import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_DISCOVERY_REMINDER_CRON,
  DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
  DEFAULT_INTERVAL_MINUTES,
  DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
  EPISODE_NOTIFICATION_WINDOW_OPTIONS,
  EVENT_TYPE,
  MAX_DISCOVERY_REMINDER_DURATION_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
} from "./constants.js";
import {
  isValidCronExpression,
  normalizeCronExpression,
} from "./cron.js";
import {
  createDefaultNotificationSettings,
  normalizeNotificationSettings,
} from "./notifications.js";
import {
  deriveSeriesStatus,
  deriveSubscriptionIdentity,
  hasSeriesFinaleMarker,
  highestSeason,
  normalizeConfirmedSeriesIds,
  seriesVerificationComplete,
} from "./series.js";
import {
  clampInteger,
  deepClone,
  isPlainObject,
  normalizeWhitespace,
  nowIso,
  parseTimestamp,
  toSafeInteger,
} from "./utils.js";

const STATE_VERSION = 7;
const SERIES_COMPLETION_RULE_VERSION = 2;
const MAX_EVENTS = 100;

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      notifications: createDefaultNotificationSettings(),
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      episodeNotificationWindowMinutes:
        DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
      discoveryReminderDurationMinutes:
        DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
      discoveryReminderCron: DEFAULT_DISCOVERY_REMINDER_CRON,
      lastCheckAt: null,
      lastCheckResult: null,
    },
    subscriptions: [],
    events: [],
    pendingNotifications: [],
    discoveryReminders: [],
  };
}

function normalizeEpisodeNotificationWindow(value) {
  const parsed = Number(value);
  return EPISODE_NOTIFICATION_WINDOW_OPTIONS.includes(parsed)
    ? parsed
    : DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES;
}

function normalizeDiscoveryReminderDuration(value) {
  return clampInteger(
    value,
    0,
    MAX_DISCOVERY_REMINDER_DURATION_MINUTES,
    DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
  );
}

function normalizeDiscoveryReminderCron(value) {
  const expression = normalizeCronExpression(value);
  return isValidCronExpression(expression)
    ? expression
    : DEFAULT_DISCOVERY_REMINDER_CRON;
}

function normalizeEvent(event) {
  if (!isPlainObject(event) || !event.id || !event.type) {
    return null;
  }

  return {
    id: String(event.id),
    type: String(event.type),
    subscriptionId: event.subscriptionId ? String(event.subscriptionId) : null,
    seasonId: event.seasonId ? String(event.seasonId) : null,
    seasonTitle: normalizeWhitespace(event.seasonTitle || ""),
    message: normalizeWhitespace(event.message || ""),
    episodeCount: Number.isFinite(Number(event.episodeCount))
      ? Number(event.episodeCount)
      : null,
    seasonCount: Number.isFinite(Number(event.seasonCount))
      ? Number(event.seasonCount)
      : null,
    previousEpisodeCount: Number.isFinite(Number(event.previousEpisodeCount))
      ? Number(event.previousEpisodeCount)
      : null,
    createdAt: String(event.createdAt || nowIso()),
    notified: Boolean(event.notified),
    notificationDueAt: parseTimestamp(event.notificationDueAt)
      ? new Date(parseTimestamp(event.notificationDueAt)).toISOString()
      : null,
    notificationError: event.notificationError
      ? normalizeWhitespace(event.notificationError)
      : null,
  };
}

function normalizePendingNotification(notification) {
  if (
    !isPlainObject(notification) ||
    !notification.id ||
    !notification.subscriptionId ||
    !notification.seasonId
  ) {
    return null;
  }

  const baselineEpisodeCount = toSafeInteger(
    notification.baselineEpisodeCount,
    null,
  );
  const episodeCount = toSafeInteger(notification.episodeCount, null);
  const dueAtMs = parseTimestamp(notification.dueAt);
  if (
    baselineEpisodeCount === null ||
    episodeCount === null ||
    episodeCount <= baselineEpisodeCount ||
    dueAtMs === null
  ) {
    return null;
  }

  const lastObservedMs =
    parseTimestamp(notification.lastObservedAt) ||
    parseTimestamp(notification.createdAt) ||
    dueAtMs;
  const firstObservedMs =
    parseTimestamp(notification.firstObservedAt) ||
    parseTimestamp(notification.createdAt) ||
    lastObservedMs;
  const eventIds = Array.isArray(notification.eventIds)
    ? [
        ...new Set(
          notification.eventIds
            .map((eventId) => String(eventId || "").trim())
            .filter(Boolean),
        ),
      ]
    : [];

  return {
    id: String(notification.id),
    type: EVENT_TYPE.EPISODE,
    subscriptionId: String(notification.subscriptionId),
    seasonId: String(notification.seasonId),
    seasonTitle: normalizeWhitespace(notification.seasonTitle || ""),
    baselineEpisodeCount,
    episodeCount,
    firstObservedAt: new Date(firstObservedMs).toISOString(),
    lastObservedAt: new Date(lastObservedMs).toISOString(),
    dueAt: new Date(dueAtMs).toISOString(),
    eventIds,
    lastError: notification.lastError
      ? normalizeWhitespace(notification.lastError)
      : null,
  };
}

function normalizeDiscoveryReminder(reminder) {
  if (
    !isPlainObject(reminder) ||
    !reminder.id ||
    !reminder.subscriptionId ||
    !reminder.seasonId ||
    ![EVENT_TYPE.EPISODE, EVENT_TYPE.SEASON].includes(reminder.type)
  ) {
    return null;
  }

  const firstDiscoveredMs = parseTimestamp(reminder.firstDiscoveredAt);
  const lastDiscoveredMs =
    parseTimestamp(reminder.lastDiscoveredAt) || firstDiscoveredMs;
  const expiresAtMs = parseTimestamp(reminder.expiresAt);
  const episodeCount = toSafeInteger(reminder.episodeCount, null);
  if (
    firstDiscoveredMs === null ||
    lastDiscoveredMs === null ||
    expiresAtMs === null ||
    expiresAtMs <= firstDiscoveredMs ||
    episodeCount === null
  ) {
    return null;
  }

  const eventIds = Array.isArray(reminder.eventIds)
    ? [
        ...new Set(
          reminder.eventIds
            .map((eventId) => String(eventId || "").trim())
            .filter(Boolean),
        ),
      ]
    : [];
  const lastReminderMs = parseTimestamp(reminder.lastReminderAt);
  const nextReminderMs = parseTimestamp(reminder.nextReminderAt);

  return {
    id: String(reminder.id),
    type: reminder.type,
    subscriptionId: String(reminder.subscriptionId),
    seasonId: String(reminder.seasonId),
    seasonTitle: normalizeWhitespace(reminder.seasonTitle || ""),
    previousEpisodeCount:
      reminder.type === EVENT_TYPE.EPISODE
        ? toSafeInteger(reminder.previousEpisodeCount, 0)
        : null,
    episodeCount,
    firstDiscoveredAt: new Date(firstDiscoveredMs).toISOString(),
    lastDiscoveredAt: new Date(lastDiscoveredMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    eventIds,
    nextReminderAt:
      nextReminderMs === null
        ? null
        : new Date(nextReminderMs).toISOString(),
    lastReminderAt:
      lastReminderMs === null
        ? null
        : new Date(lastReminderMs).toISOString(),
    lastError: reminder.lastError
      ? normalizeWhitespace(reminder.lastError)
      : null,
  };
}

function normalizeSeason(season) {
  if (!season || !/^\d{8,25}$/.test(String(season.seriesId || ""))) {
    return null;
  }

  const highWaterEpisodeCount = Math.max(
    0,
    Number(season.highWaterEpisodeCount ?? season.episodeCount) || 0,
  );

  return {
    seriesId: String(season.seriesId),
    seriesGroupId: season.seriesGroupId ? String(season.seriesGroupId) : null,
    title: normalizeWhitespace(season.title || "未命名短剧"),
    coverUrl: String(season.coverUrl || ""),
    intro: normalizeWhitespace(season.intro || ""),
    tags: Array.isArray(season.tags)
      ? season.tags.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
      : [],
    firstVisibleTime: season.firstVisibleTime
      ? String(season.firstVisibleTime)
      : null,
    lastEpisodeChangedAt: parseTimestamp(season.lastEpisodeChangedAt)
      ? new Date(parseTimestamp(season.lastEpisodeChangedAt)).toISOString()
      : null,
    status: ["updating", "completed", "unknown"].includes(season.status)
      ? season.status
      : "unknown",
    episodeCount: Math.max(0, Number(season.episodeCount) || 0),
    totalEpisodeCount: Math.max(
      0,
      Number(season.totalEpisodeCount ?? season.episodeCount) || 0,
    ),
    accessibleEpisodeCount: Math.max(
      0,
      Number(season.accessibleEpisodeCount) || 0,
    ),
    highWaterEpisodeCount,
    lastObservedEpisodeCount: Math.max(
      0,
      Number(season.lastObservedEpisodeCount ?? season.episodeCount) || 0,
    ),
    rightText: normalizeWhitespace(season.rightText || ""),
    detailUrl: String(season.detailUrl || ""),
    source: ["share", "album", "recommendation", "manual"].includes(
      season.source,
    )
      ? season.source
      : "manual",
    addedAt: String(season.addedAt || nowIso()),
    updatedAt: String(season.updatedAt || season.addedAt || nowIso()),
    lastCheckedAt: season.lastCheckedAt
      ? String(season.lastCheckedAt)
      : null,
    lastError: season.lastError
      ? normalizeWhitespace(season.lastError)
      : null,
  };
}

function normalizeSubscription(subscription) {
  if (!isPlainObject(subscription) || !subscription.id) {
    return null;
  }

  const seasons = Array.isArray(subscription.seasons)
    ? subscription.seasons.map(normalizeSeason).filter(Boolean)
    : [];
  if (seasons.length === 0) {
    return null;
  }

  const candidates = isPlainObject(subscription.discovery?.candidates)
    ? subscription.discovery.candidates
    : {};
  const normalizedCandidates = {};
  for (const [seriesId, candidate] of Object.entries(candidates)) {
    if (!/^\d{8,25}$/.test(seriesId) || !isPlainObject(candidate)) {
      continue;
    }
    normalizedCandidates[seriesId] = {
      checkedAt: String(candidate.checkedAt || nowIso()),
      matchesGroup: Boolean(candidate.matchesGroup),
      lastError: candidate.lastError
        ? normalizeWhitespace(candidate.lastError)
        : null,
    };
  }

  const primary = seasons.find(
    (season) => season.seriesId === subscription.primarySeriesId,
  );
  const identity = deriveSubscriptionIdentity({
    ...subscription,
    seasons,
  });
  const confirmedSeriesIds = normalizeConfirmedSeriesIds(
    subscription.discovery?.confirmedSeriesIds,
  );
  const unpublishedSeriesIds = normalizeConfirmedSeriesIds(
    subscription.discovery?.unpublishedSeriesIds,
  );
  const unpublishedSeasonCount = Math.max(
    unpublishedSeriesIds.length,
    toSafeInteger(subscription.discovery?.unpublishedSeasonCount, 0),
  );
  const lastDiscoveryIssue = normalizeWhitespace(
    subscription.discovery?.lastDiscoveryIssue || "",
  );
  const seriesCompletionVerifiedAt = subscription.seriesCompletionVerifiedAt
    ? String(subscription.seriesCompletionVerifiedAt)
    : null;
  const hasVerifiedCompletionCycle = Boolean(
    seriesCompletionVerifiedAt &&
      seriesVerificationComplete(seasons, confirmedSeriesIds) &&
      hasSeriesFinaleMarker(highestSeason(seasons)),
  );
  const derivedStatus = deriveSeriesStatus(seasons, {
    confirmedSeriesIds,
    discoveryError: lastDiscoveryIssue || null,
    unpublishedSeasonCount,
  });

  return {
    id: String(subscription.id),
    primarySeriesId: String(
      subscription.primarySeriesId || primary?.seriesId || seasons[0].seriesId,
    ),
    seriesGroupId: subscription.seriesGroupId
      ? String(subscription.seriesGroupId)
      : null,
    title: identity.firstSeasonTitle,
    displayTitle: identity.displayTitle,
    firstSeasonId: identity.firstSeasonId,
    firstSeasonTitle: identity.firstSeasonTitle,
    coverUrl: String(subscription.coverUrl || primary?.coverUrl || ""),
    seriesStatus: derivedStatus.status,
    seriesStatusReason: derivedStatus.reason,
    completedAt:
      hasVerifiedCompletionCycle && subscription.completedAt
        ? String(subscription.completedAt)
        : null,
    seriesCompletionAnnounced:
      hasVerifiedCompletionCycle &&
      subscription.seriesCompletionAnnounced === true,
    seriesCompletionVerifiedAt:
      hasVerifiedCompletionCycle ? seriesCompletionVerifiedAt : null,
    hasUnreadUpdate: subscription.hasUnreadUpdate === true,
    lastWatchedAt: parseTimestamp(subscription.lastWatchedAt)
      ? new Date(parseTimestamp(subscription.lastWatchedAt)).toISOString()
      : null,
    createdAt: String(subscription.createdAt || nowIso()),
    updatedAt: String(subscription.updatedAt || nowIso()),
    lastCheckedAt: subscription.lastCheckedAt
      ? String(subscription.lastCheckedAt)
      : null,
    lastError: subscription.lastError
      ? normalizeWhitespace(subscription.lastError)
      : null,
    discovery: {
      lastRunAt: subscription.discovery?.lastRunAt
        ? String(subscription.discovery.lastRunAt)
        : null,
      lastCompletedAt: subscription.discovery?.lastCompletedAt
        ? String(subscription.discovery.lastCompletedAt)
        : null,
      lastDiscoveryIssue: lastDiscoveryIssue || null,
      confirmedSeriesIds,
      unpublishedSeriesIds,
      unpublishedSeasonCount,
      albumSeasonCount: Number.isFinite(
        Number(subscription.discovery?.albumSeasonCount),
      )
        ? toSafeInteger(subscription.discovery.albumSeasonCount, null)
        : null,
      albumItemCount: Number.isFinite(
        Number(subscription.discovery?.albumItemCount),
      )
        ? toSafeInteger(subscription.discovery.albumItemCount, null)
        : null,
      candidates: normalizedCandidates,
    },
    seasons,
  };
}

export function normalizeState(input) {
  const fallback = createDefaultState();
  if (!isPlainObject(input)) {
    return fallback;
  }

  const inputVersion = Number(input.version);
  const needsCompletionCleanup =
    !Number.isFinite(inputVersion) ||
    inputVersion < SERIES_COMPLETION_RULE_VERSION;
  const subscriptions = Array.isArray(input.subscriptions)
    ? input.subscriptions.map(normalizeSubscription).filter(Boolean)
    : [];
  const normalizedEvents = Array.isArray(input.events)
    ? input.events.map(normalizeEvent).filter(Boolean).slice(0, MAX_EVENTS)
    : [];
  const subscriptionsById = new Map(
    subscriptions.map((subscription) => [subscription.id, subscription]),
  );
  const events = normalizedEvents.filter((event) => {
    if (
      !needsCompletionCleanup ||
      event.type !== EVENT_TYPE.COMPLETED ||
      !event.subscriptionId ||
      !subscriptionsById.has(event.subscriptionId)
    ) {
      return true;
    }
    const subscription = subscriptionsById.get(event.subscriptionId);
    return Boolean(
      subscription.seriesCompletionVerifiedAt &&
        hasSeriesFinaleMarker(highestSeason(subscription.seasons)),
    );
  });
  const seasonsBySubscriptionAndId = new Map(
    subscriptions.flatMap((subscription) =>
      subscription.seasons.map((season) => [
        `${subscription.id}:${season.seriesId}`,
        season,
      ]),
    ),
  );
  for (const event of events) {
    if (
      event.type !== EVENT_TYPE.EPISODE ||
      !event.subscriptionId ||
      !event.seasonId
    ) {
      continue;
    }
    const season = seasonsBySubscriptionAndId.get(
      `${event.subscriptionId}:${event.seasonId}`,
    );
    const eventMs = parseTimestamp(event.createdAt);
    const storedMs = parseTimestamp(season?.lastEpisodeChangedAt);
    if (season && eventMs && (!storedMs || eventMs > storedMs)) {
      season.lastEpisodeChangedAt = new Date(eventMs).toISOString();
    }
  }
  const knownSeasonIds = new Set(
    subscriptions.flatMap((subscription) =>
      subscription.seasons.map(
        (season) => `${subscription.id}:${season.seriesId}`,
      ),
    ),
  );
  const pendingNotificationsBySeason = new Map();
  if (Array.isArray(input.pendingNotifications)) {
    for (const pending of input.pendingNotifications) {
      const normalized = normalizePendingNotification(pending);
      if (
        !normalized ||
        !knownSeasonIds.has(
          `${normalized.subscriptionId}:${normalized.seasonId}`,
        )
      ) {
        continue;
      }
      const key = `${normalized.subscriptionId}:${normalized.seasonId}`;
      const existing = pendingNotificationsBySeason.get(key);
      if (!existing || normalized.lastObservedAt > existing.lastObservedAt) {
        pendingNotificationsBySeason.set(key, normalized);
      }
    }
  }
  const discoveryRemindersBySeason = new Map();
  if (Array.isArray(input.discoveryReminders)) {
    for (const reminder of input.discoveryReminders) {
      const normalized = normalizeDiscoveryReminder(reminder);
      if (
        !normalized ||
        !knownSeasonIds.has(
          `${normalized.subscriptionId}:${normalized.seasonId}`,
        )
      ) {
        continue;
      }
      const key = `${normalized.subscriptionId}:${normalized.seasonId}`;
      const existing = discoveryRemindersBySeason.get(key);
      if (
        !existing ||
        normalized.lastDiscoveredAt > existing.lastDiscoveredAt
      ) {
        discoveryRemindersBySeason.set(key, normalized);
      }
    }
  }

  return {
    version: STATE_VERSION,
    settings: {
      notifications: normalizeNotificationSettings(
        input.settings?.notifications,
        input.settings?.barkKey,
      ),
      intervalMinutes: clampInteger(
        input.settings?.intervalMinutes,
        MIN_INTERVAL_MINUTES,
        MAX_INTERVAL_MINUTES,
        DEFAULT_INTERVAL_MINUTES,
      ),
      episodeNotificationWindowMinutes: normalizeEpisodeNotificationWindow(
        input.settings?.episodeNotificationWindowMinutes,
      ),
      discoveryReminderDurationMinutes:
        normalizeDiscoveryReminderDuration(
          input.settings?.discoveryReminderDurationMinutes,
        ),
      discoveryReminderCron: normalizeDiscoveryReminderCron(
        input.settings?.discoveryReminderCron,
      ),
      lastCheckAt: input.settings?.lastCheckAt
        ? String(input.settings.lastCheckAt)
        : null,
      lastCheckResult: ["success", "partial", "error"].includes(
        input.settings?.lastCheckResult,
      )
        ? input.settings.lastCheckResult
        : null,
    },
    subscriptions,
    events,
    pendingNotifications: [...pendingNotificationsBySeason.values()],
    discoveryReminders: [...discoveryRemindersBySeason.values()],
  };
}

export function appendEvent(state, event) {
  const normalized = normalizeEvent({
    id: event.id,
    createdAt: event.createdAt || nowIso(),
    ...event,
  });
  if (!normalized) {
    return null;
  }

  state.events.unshift(normalized);
  state.events = state.events.slice(0, MAX_EVENTS);
  return normalized;
}

async function atomicWriteJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(temporaryPath, payload, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
}

export class JsonStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = createDefaultState();
    this.initialized = false;
    this.queue = Promise.resolve();
  }

  async init() {
    if (this.initialized) {
      return this.read();
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = normalizeState(parsed);
      if (Number(parsed?.version) !== STATE_VERSION) {
        await this.persist();
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        await this.backupInvalidFile();
      }
      this.state = createDefaultState();
      await this.persist();
    }

    this.initialized = true;
    return this.read();
  }

  async backupInvalidFile() {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = `${this.filePath}.corrupt-${stamp}`;
    try {
      await fs.rename(this.filePath, backupPath);
    } catch {
      // A concurrent read must not prevent the app from starting with fresh state.
    }
  }

  async persist() {
    await atomicWriteJson(this.filePath, this.state);
  }

  async read() {
    if (!this.initialized) {
      await this.init();
    }
    return deepClone(this.state);
  }

  async replace(nextState) {
    return this.mutate((state) => {
      const normalized = normalizeState(nextState);
      for (const key of Object.keys(state)) {
        delete state[key];
      }
      Object.assign(state, normalized);
      return state;
    });
  }

  async mutate(mutator) {
    const operation = this.queue.then(async () => {
      if (!this.initialized) {
        await this.init();
      }

      const draft = deepClone(this.state);
      const result = await mutator(draft);
      const normalized = normalizeState(draft);
      this.state = normalized;
      await this.persist();
      return result;
    });

    this.queue = operation.catch(() => {});
    return operation;
  }
}
