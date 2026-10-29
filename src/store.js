import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_CHECK_CRON,
  DEFAULT_DISCOVERY_REMINDER_CRON,
  DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
  DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
  DEFAULT_STALE_COMPLETION_DAYS,
  EPISODE_NOTIFICATION_WINDOW_OPTIONS,
  EVENT_TYPE,
  MAX_DISCOVERY_REMINDER_DURATION_MINUTES,
  MAX_STALE_COMPLETION_DAYS,
  MIN_STALE_COMPLETION_DAYS,
} from "./constants.js";
import {
  isValidCronExpression,
  legacyIntervalMinutesToCron,
  nextCronOccurrence,
  normalizeCronExpression,
} from "./cron.js";
import {
  createDefaultNotificationSettings,
  normalizeNotificationSettings,
} from "./notifications.js";
import { EventLogStore } from "./event-log.js";
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

const STATE_VERSION = 10;
const SERIES_COMPLETION_RULE_VERSION = 2;
export const MAX_EVENTS = 100;

export function createDefaultState() {
  return {
    version: STATE_VERSION,
    settings: {
      notifications: createDefaultNotificationSettings(),
      checkCron: DEFAULT_CHECK_CRON,
      staleCompletionDays: DEFAULT_STALE_COMPLETION_DAYS,
      episodeNotificationWindowMinutes:
        DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
      discoveryReminderDurationMinutes:
        DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
      discoveryReminderCron: DEFAULT_DISCOVERY_REMINDER_CRON,
      nextCheckAt: null,
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

function normalizeStaleCompletionDays(value) {
  return clampInteger(
    value,
    MIN_STALE_COMPLETION_DAYS,
    MAX_STALE_COMPLETION_DAYS,
    DEFAULT_STALE_COMPLETION_DAYS,
  );
}

function normalizeDiscoveryReminderCron(value) {
  const expression = normalizeCronExpression(value);
  return isValidCronExpression(expression)
    ? expression
    : DEFAULT_DISCOVERY_REMINDER_CRON;
}

function normalizeCheckCron(value, legacyIntervalMinutes) {
  const expression = normalizeCronExpression(value);
  if (isValidCronExpression(expression)) {
    return expression;
  }
  return (
    legacyIntervalMinutesToCron(legacyIntervalMinutes) ||
    DEFAULT_CHECK_CRON
  );
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
  const storedSeriesStatusOverride = [
    "updating",
    "completed",
    "unknown",
  ].includes(subscription.seriesStatusOverride)
    ? subscription.seriesStatusOverride
    : null;
  const autoCompletedAt = parseTimestamp(subscription.autoCompletedAt)
    ? new Date(parseTimestamp(subscription.autoCompletedAt)).toISOString()
    : null;
  const seriesStatusOverride = autoCompletedAt
    ? null
    : storedSeriesStatusOverride;
  const seriesStatusOverrideAt =
    seriesStatusOverride &&
    parseTimestamp(subscription.seriesStatusOverrideAt)
      ? new Date(
          parseTimestamp(subscription.seriesStatusOverrideAt),
        ).toISOString()
      : null;
  const autoCompletionReason = autoCompletedAt
    ? normalizeWhitespace(subscription.autoCompletionReason || "")
    : "";
  const manualStatusReason = {
    updating: "已手动标记为更新中，将继续自动检查。",
    completed: "已手动标记为已完结，已停止自动检查。",
    unknown: "已手动标记为状态未知，将继续自动检查。",
  }[seriesStatusOverride];
  const seriesStatus =
    seriesStatusOverride ||
    (autoCompletedAt ? "completed" : derivedStatus.status);
  const seriesStatusReason =
    manualStatusReason ||
    (autoCompletedAt
      ? autoCompletionReason || "超过设定的无更新期限，已自动标记为完结。"
      : derivedStatus.reason);

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
    seriesStatus,
    seriesStatusReason,
    seriesStatusOverride,
    seriesStatusOverrideAt,
    completedAt:
      hasVerifiedCompletionCycle && subscription.completedAt
        ? String(subscription.completedAt)
        : null,
    autoCompletedAt,
    autoCompletionReason: autoCompletionReason || null,
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
  const checkCron = normalizeCheckCron(
    input.settings?.checkCron,
    input.settings?.intervalMinutes,
  );
  const lastCheckAt =
    parseTimestamp(input.settings?.lastCheckAt) === null
      ? null
      : new Date(
          parseTimestamp(input.settings.lastCheckAt),
        ).toISOString();
  const storedNextCheckAt =
    Number.isFinite(inputVersion) && inputVersion >= STATE_VERSION
      ? parseTimestamp(input.settings?.nextCheckAt)
      : null;
  const derivedNextCheckAt =
    lastCheckAt === null
      ? null
      : nextCronOccurrence(checkCron, new Date(lastCheckAt)).toISOString();
  const nextCheckAt =
    storedNextCheckAt === null
      ? derivedNextCheckAt
      : new Date(storedNextCheckAt).toISOString();

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
      checkCron,
      staleCompletionDays: normalizeStaleCompletionDays(
        input.settings?.staleCompletionDays,
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
      nextCheckAt,
      lastCheckAt,
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

const SQLITE_SCHEMA_VERSION = 1;
const SQLITE_BUSY_ERROR_CODE = 5;
const SQLITE_LOCKED_ERROR_CODE = 6;
const SQLITE_RETRY_BASE_MS = 25;
const SQLITE_RETRY_MAX_MS = 500;

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seasons (
    subscription_id TEXT NOT NULL,
    series_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (subscription_id, series_id),
    FOREIGN KEY (subscription_id)
      REFERENCES subscriptions(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS seasons_updated_at_idx
    ON seasons(updated_at DESC);

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS events_created_at_idx
    ON events(created_at DESC);

  CREATE TABLE IF NOT EXISTS pending_notifications (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    due_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    FOREIGN KEY (subscription_id, season_id)
      REFERENCES seasons(subscription_id, series_id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS pending_notifications_due_at_idx
    ON pending_notifications(due_at);

  CREATE TABLE IF NOT EXISTS discovery_reminders (
    id TEXT PRIMARY KEY,
    subscription_id TEXT NOT NULL,
    season_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    next_reminder_at TEXT,
    payload TEXT NOT NULL,
    FOREIGN KEY (subscription_id, season_id)
      REFERENCES seasons(subscription_id, series_id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS discovery_reminders_next_at_idx
    ON discovery_reminders(next_reminder_at);
`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isSqliteBusy(error) {
  return (
    error?.errcode === SQLITE_BUSY_ERROR_CODE ||
    error?.errcode === SQLITE_LOCKED_ERROR_CODE ||
    /database is (?:busy|locked)/i.test(error?.message || "")
  );
}

function parseStoredPayload(payload, label) {
  try {
    return JSON.parse(payload);
  } catch (error) {
    const wrapped = new Error(`SQLite 中的${label}数据损坏。`, {
      cause: error,
    });
    wrapped.code = "SQLITE_STATE_INVALID";
    throw wrapped;
  }
}

export function databaseFileForStateFile(stateFile) {
  const parsed = path.parse(path.resolve(stateFile));
  return path.join(parsed.dir, `${parsed.name}.sqlite3`);
}

export class SqliteStateStore {
  constructor(
    databaseFile,
    {
      legacyStateFile = path.join(
        path.dirname(path.resolve(databaseFile)),
        "state.json",
      ),
      eventLogDirectory = path.join(
        path.dirname(path.resolve(databaseFile)),
        "logs",
      ),
      maxEventLogFileBytes,
      busyTimeoutMs = 0,
      maxWriteRetries = 8,
    } = {},
  ) {
    this.databaseFile = path.resolve(databaseFile);
    this.filePath = this.databaseFile;
    this.legacyStateFile = path.resolve(legacyStateFile);
    this.eventLog = new EventLogStore(eventLogDirectory, {
      maxFileBytes: maxEventLogFileBytes,
    });
    this.busyTimeoutMs = Math.max(0, Number(busyTimeoutMs) || 0);
    this.maxWriteRetries = Math.max(
      0,
      Math.trunc(Number(maxWriteRetries) || 0),
    );
    this.state = createDefaultState();
    this.initialized = false;
    this.initializing = null;
    this.queue = Promise.resolve();
    this.db = null;
    this.closed = false;
  }

  async init() {
    if (this.closed) {
      throw new Error("状态存储已经关闭。");
    }
    if (this.initialized) {
      return deepClone(this.state);
    }
    if (!this.initializing) {
      this.initializing = this.initialize().finally(() => {
        this.initializing = null;
      });
    }
    return this.initializing;
  }

  async initialize() {
    if (this.closed) {
      throw new Error("状态存储已经关闭。");
    }
    await fs.mkdir(path.dirname(this.databaseFile), {
      recursive: true,
      mode: 0o700,
    });
    await this.secureLegacyFile();
    const databaseHandle = await fs.open(
      this.databaseFile,
      "a",
      0o600,
    );
    await databaseHandle.close();
    await fs.chmod(this.databaseFile, 0o600);

    try {
      this.db = new DatabaseSync(this.databaseFile);

      this.db.exec(`PRAGMA busy_timeout = ${this.busyTimeoutMs}`);
      this.db.exec("PRAGMA foreign_keys = ON");
      this.db.exec("PRAGMA synchronous = FULL");
      this.db.exec("PRAGMA secure_delete = ON");
      this.db.exec("PRAGMA temp_store = MEMORY");
      this.db.exec("PRAGMA wal_autocheckpoint = 1000");
      this.db.exec("PRAGMA journal_size_limit = 67108864");
      const journalMode = this.db
        .prepare("PRAGMA journal_mode = WAL")
        .get()?.journal_mode;
      if (String(journalMode).toLowerCase() !== "wal") {
        throw new Error("无法启用 SQLite WAL 模式。");
      }

      const schemaVersion = Number(
        this.db.prepare("PRAGMA user_version").get()?.user_version || 0,
      );
      if (schemaVersion > SQLITE_SCHEMA_VERSION) {
        throw new Error(
          `SQLite 数据库版本 ${schemaVersion} 高于当前程序支持的版本。`,
        );
      }
      this.db.exec(SQLITE_SCHEMA);
      this.db.exec(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION}`);

      const state = await this.initializePersistedState();
      await this.eventLog.init();
      await this.eventLog.appendEvents([...state.events].reverse());
      await this.secureDatabaseFiles();
      this.state = state;
      this.initialized = true;
      return deepClone(state);
    } catch (error) {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      throw error;
    }
  }

  async initializePersistedState() {
    const existing = this.db
      .prepare("SELECT payload FROM settings WHERE id = 1")
      .get();
    if (existing) {
      return this.readStateDirect();
    }

    let state = createDefaultState();
    let importedFrom = null;
    try {
      const raw = await fs.readFile(this.legacyStateFile, "utf8");
      state = normalizeState(JSON.parse(raw));
      importedFrom = this.legacyStateFile;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        await this.backupInvalidFile();
      }
    }

    return this.withImmediateTransaction(() => {
      // Another process may have completed the import while this one read
      // the legacy file. Recheck after acquiring the write lock.
      const existingAfterLock = this.db
        .prepare("SELECT payload FROM settings WHERE id = 1")
        .get();
      if (existingAfterLock) {
        return this.readStateDirect();
      }
      this.writeState(state, { importedFrom });
      return state;
    });
  }

  async backupInvalidFile() {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = `${this.legacyStateFile}.corrupt-${stamp}`;
    try {
      await fs.copyFile(this.legacyStateFile, backupPath);
      await fs.chmod(backupPath, 0o600);
    } catch {
      // Keep startup available even if the legacy file cannot be backed up.
    }
  }

  async secureDatabaseFiles() {
    for (const filePath of [
      this.databaseFile,
      `${this.databaseFile}-wal`,
      `${this.databaseFile}-shm`,
    ]) {
      try {
        await fs.chmod(filePath, 0o600);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
    }
  }

  async secureLegacyFile() {
    try {
      await fs.chmod(this.legacyStateFile, 0o600);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async read() {
    if (!this.initialized) {
      await this.init();
    }
    return this.enqueue(async () => {
      const state = await this.readSnapshot();
      this.state = state;
      return deepClone(state);
    });
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
    return this.enqueue(async () => {
      if (!this.initialized) {
        await this.init();
      }

      const outcome = await this.withImmediateTransaction(() => {
        const current = this.readStateDirect();
        const draft = deepClone(current);
        const previousEventIds = new Set(
          current.events.map((event) => event.id),
        );
        const result = mutator(draft);
        if (result && typeof result.then === "function") {
          throw new TypeError("SQLite 状态修改回调必须同步完成。");
        }
        const normalized = normalizeState(draft);
        const newEvents = normalized.events
          .filter((event) => !previousEventIds.has(event.id))
          .reverse();
        this.writeState(normalized);
        return { normalized, newEvents, result };
      });

      await this.secureDatabaseFiles();
      this.state = outcome.normalized;
      const { newEvents } = outcome;
      if (newEvents.length) {
        try {
          await this.eventLog.appendEvents(newEvents);
        } catch (error) {
          console.error(
            `事件日志写入失败：${error?.message || "未知错误"}`,
          );
        }
      }
      return outcome.result;
    });
  }

  async persist() {
    return this.mutate(() => undefined);
  }

  async close() {
    await this.queue.catch(() => {});
    if (this.initializing) {
      await this.initializing.catch(() => {});
    }
    if (this.db) {
      try {
        this.db.exec("PRAGMA wal_checkpoint(PASSIVE)");
      } catch {
        // SQLite still closes safely when another connection owns the WAL.
      }
      this.db.close();
      this.db = null;
    }
    this.closed = true;
  }

  enqueue(operation) {
    const queued = this.queue.then(operation);
    this.queue = queued.catch(() => {});
    return queued;
  }

  async beginWithRetry(statement) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        this.db.exec(statement);
        return;
      } catch (error) {
        if (attempt >= this.maxWriteRetries || !isSqliteBusy(error)) {
          throw error;
        }
        const wait = Math.min(
          SQLITE_RETRY_MAX_MS,
          SQLITE_RETRY_BASE_MS * 2 ** attempt,
        );
        await delay(wait);
      }
    }
  }

  async withImmediateTransaction(operation) {
    await this.beginWithRetry("BEGIN IMMEDIATE");
    try {
      const result = operation();
      if (result && typeof result.then === "function") {
        throw new TypeError("SQLite 事务回调必须同步完成。");
      }
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // The original failure is more useful than a rollback failure.
      }
      throw error;
    }
  }

  async readSnapshot() {
    await this.beginWithRetry("BEGIN");
    try {
      const state = this.readStateDirect();
      this.db.exec("COMMIT");
      return state;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // The original failure is more useful than a rollback failure.
      }
      throw error;
    }
  }

  readStateDirect() {
    const settingsRow = this.db
      .prepare("SELECT payload FROM settings WHERE id = 1")
      .get();
    if (!settingsRow) {
      throw new Error("SQLite 状态库尚未初始化。");
    }

    const subscriptions = this.db
      .prepare(
        "SELECT id, payload FROM subscriptions ORDER BY position, id",
      )
      .all()
      .map((row) => ({
        ...parseStoredPayload(row.payload, `订阅 ${row.id} `),
        seasons: this.db
          .prepare(
            `SELECT series_id, payload
             FROM seasons
             WHERE subscription_id = ?
             ORDER BY position, series_id`,
          )
          .all(row.id)
          .map((season) =>
            parseStoredPayload(
              season.payload,
              `季度 ${row.id}/${season.series_id} `,
            ),
          ),
      }));

    const state = {
      version:
        Number(this.readMetadata("state_version")) || STATE_VERSION,
      settings: parseStoredPayload(settingsRow.payload, "设置"),
      subscriptions,
      events: this.db
        .prepare("SELECT id, payload FROM events ORDER BY position, id")
        .all()
        .map((row) =>
          parseStoredPayload(row.payload, `事件 ${row.id} `),
        ),
      pendingNotifications: this.db
        .prepare(
          `SELECT id, payload
           FROM pending_notifications
           ORDER BY position, id`,
        )
        .all()
        .map((row) =>
          parseStoredPayload(
            row.payload,
            `待发送通知 ${row.id} `,
          ),
        ),
      discoveryReminders: this.db
        .prepare(
          `SELECT id, payload
           FROM discovery_reminders
           ORDER BY position, id`,
        )
        .all()
        .map((row) =>
          parseStoredPayload(row.payload, `持续提醒 ${row.id} `),
        ),
    };
    return normalizeState(state);
  }

  writeState(state, { importedFrom = null } = {}) {
    this.db.exec(`
      DELETE FROM discovery_reminders;
      DELETE FROM pending_notifications;
      DELETE FROM events;
      DELETE FROM seasons;
      DELETE FROM subscriptions;
      DELETE FROM settings;
    `);

    this.db
      .prepare("INSERT INTO settings (id, payload) VALUES (1, ?)")
      .run(JSON.stringify(state.settings));

    const insertSubscription = this.db.prepare(
      `INSERT INTO subscriptions
        (id, position, updated_at, payload)
       VALUES (?, ?, ?, ?)`,
    );
    const insertSeason = this.db.prepare(
      `INSERT INTO seasons
        (subscription_id, series_id, position, updated_at, payload)
       VALUES (?, ?, ?, ?, ?)`,
    );
    state.subscriptions.forEach((subscription, position) => {
      const { seasons, ...subscriptionData } = subscription;
      insertSubscription.run(
        subscription.id,
        position,
        subscription.updatedAt,
        JSON.stringify(subscriptionData),
      );
      seasons.forEach((season, seasonPosition) => {
        insertSeason.run(
          subscription.id,
          season.seriesId,
          seasonPosition,
          season.updatedAt,
          JSON.stringify(season),
        );
      });
    });

    const insertEvent = this.db.prepare(
      `INSERT INTO events (id, position, created_at, payload)
       VALUES (?, ?, ?, ?)`,
    );
    state.events.forEach((event, position) => {
      insertEvent.run(
        event.id,
        position,
        event.createdAt,
        JSON.stringify(event),
      );
    });

    const insertPending = this.db.prepare(
      `INSERT INTO pending_notifications
        (id, subscription_id, season_id, position, due_at, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    state.pendingNotifications.forEach((notification, position) => {
      insertPending.run(
        notification.id,
        notification.subscriptionId,
        notification.seasonId,
        position,
        notification.dueAt,
        JSON.stringify(notification),
      );
    });

    const insertReminder = this.db.prepare(
      `INSERT INTO discovery_reminders
        (id, subscription_id, season_id, position, expires_at,
         next_reminder_at, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    state.discoveryReminders.forEach((reminder, position) => {
      insertReminder.run(
        reminder.id,
        reminder.subscriptionId,
        reminder.seasonId,
        position,
        reminder.expiresAt,
        reminder.nextReminderAt,
        JSON.stringify(reminder),
      );
    });

    const revision = Number(this.readMetadata("revision") || 0) + 1;
    this.writeMetadata("state_version", String(STATE_VERSION));
    this.writeMetadata("schema_version", String(SQLITE_SCHEMA_VERSION));
    this.writeMetadata("revision", String(revision));
    this.writeMetadata("updated_at", nowIso());
    if (importedFrom) {
      this.writeMetadata("legacy_imported_from", importedFrom);
    }
  }

  readMetadata(key) {
    return this.db
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(key)?.value;
  }

  writeMetadata(key, value) {
    this.db
      .prepare(
        `INSERT INTO metadata (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }
}

// Retain the old export so existing integrations can migrate without a
// simultaneous class-name change; the implementation is SQLite-backed.
export class JsonStateStore extends SqliteStateStore {
  constructor(stateFile, options = {}) {
    const legacyStateFile = path.resolve(stateFile);
    super(databaseFileForStateFile(legacyStateFile), {
      legacyStateFile,
      ...options,
    });
    this.filePath = legacyStateFile;
  }
}
