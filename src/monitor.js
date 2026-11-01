import {
  APP_NAME,
  CANDIDATE_RECHECK_MS,
  DEFAULT_CHECK_CRON,
  DEFAULT_DISCOVERY_REMINDER_CRON,
  DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
  DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
  DEFAULT_STALE_COMPLETION_DAYS,
  DISCOVERY_INTERVAL_MS,
  EPISODE_NOTIFICATION_WINDOW_OPTIONS,
  EVENT_TYPE,
  MAX_DISCOVERY_REMINDER_DURATION_MINUTES,
  MAX_STALE_COMPLETION_DAYS,
  MIN_STALE_COMPLETION_DAYS,
  SERIES_STATUS,
} from "./constants.js";
import {
  isValidCronExpression,
  legacyIntervalMinutesToCron,
  nextCronOccurrence,
  normalizeCronExpression,
} from "./cron.js";
import {
  fetchAlbumSeriesInfo,
  fetchSeriesDetail,
  resolveSharedSeries,
} from "./hongguo.js";
import {
  applyNotificationSettingsPatch,
  describeNotificationSettings,
  enabledNotificationChannels,
  sendNotificationChannels,
  summarizeNotificationDelivery,
} from "./notifications.js";
import {
  applyNotificationTemplatesPatch,
  renderNotificationTemplate,
  validateNotificationTemplatesPatch,
} from "./notification-templates.js";
import {
  albumMetadataIssue,
  deriveSeriesStatus,
  deriveSubscriptionIdentity,
  hasNewerSeason,
  normalizeAlbumMetadata,
  seasonNumber,
  seriesVerificationComplete,
  titleWithoutSeason,
} from "./series.js";
import { buildSubscriptionSearchIndex } from "./search-index.js";
import { appendEvent, MAX_EVENTS } from "./store.js";
import {
  createId,
  normalizeWhitespace,
  nowIso,
} from "./utils.js";

const MAX_SUBSCRIPTIONS = 100;
const MAX_SEASONS_PER_SERIES = 64;
const NETWORK_CONCURRENCY = 3;
const NOTIFICATION_RETRY_MS = 15 * 60 * 1000;
const NOTIFICATION_TIME_ZONE = "Asia/Shanghai";
const MAX_SCHEDULER_DELAY_MS = 2_147_000_000;
const SUMMARY_EVENT_TYPES = new Set([
  EVENT_TYPE.EPISODE,
  EVENT_TYPE.SEASON,
  EVENT_TYPE.COMPLETED,
]);

export class ReminderError extends Error {
  constructor(message, code = "REMINDER_ERROR", statusCode = 400) {
    super(message);
    this.name = "ReminderError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isRecent(timestamp, durationMs, nowMs) {
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) && nowMs - parsed < durationMs;
}

function isDiscoveryDue(
  subscription,
  discoveryIntervalMs,
  nowMs,
  forceDiscovery = false,
) {
  return (
    forceDiscovery ||
    !isRecent(
      subscription?.discovery?.lastRunAt,
      discoveryIntervalMs,
      nowMs,
    )
  );
}

function resolveScheduledCheckMs(settings, nowMs) {
  const storedNextCheckMs = Date.parse(settings.nextCheckAt || "");
  if (Number.isFinite(storedNextCheckMs)) {
    return storedNextCheckMs;
  }
  const lastCheckMs = Date.parse(settings.lastCheckAt || "");
  const anchorMs = Number.isFinite(lastCheckMs) ? lastCheckMs : nowMs;
  return nextCronOccurrence(
    settings.checkCron || DEFAULT_CHECK_CRON,
    new Date(anchorMs),
  ).getTime();
}

function nextCheckAtAfterRun(scheduledMs, checkCron, completedMs) {
  if (scheduledMs > completedMs) {
    return scheduledMs;
  }
  return nextCronOccurrence(checkCron, new Date(completedMs)).getTime();
}

function isKnownCompletedSeries(subscription) {
  if (subscription?.seriesStatusOverride) {
    return subscription.seriesStatusOverride === SERIES_STATUS.COMPLETED;
  }
  return (
    subscription?.seriesStatus === SERIES_STATUS.COMPLETED ||
    Number.isFinite(Date.parse(subscription?.completedAt || "")) ||
    Number.isFinite(
      Date.parse(subscription?.seriesCompletionVerifiedAt || ""),
    )
  );
}

function isKnownInactiveSeries(subscription) {
  return (
    subscription?.seriesStatus === SERIES_STATUS.INACTIVE ||
    Number.isFinite(Date.parse(subscription?.autoInactiveAt || ""))
  );
}

function calendarDateKey(value, timeZone = NOTIFICATION_TIME_ZONE) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return values.year && values.month && values.day
    ? `${values.year}-${values.month}-${values.day}`
    : null;
}

function inactiveCheckedToday(subscription, now) {
  const lastCheckedDate = calendarDateKey(
    subscription?.inactiveStatusCheckedAt,
  );
  const currentDate = calendarDateKey(now?.toISOString?.() || "");
  return Boolean(
    lastCheckedDate && currentDate && lastCheckedDate === currentDate,
  );
}

function batchNeedsDiscoveryAlignment(
  subscriptions,
  discoveryIntervalMs,
  nowMs,
  { discover = true, forceDiscovery = false } = {},
) {
  if (!discover) {
    return false;
  }
  return subscriptions.some(
    (subscription) =>
      subscription.trackingPaused !== true &&
      !isKnownCompletedSeries(subscription) &&
      isDiscoveryDue(
        subscription,
        discoveryIntervalMs,
        nowMs,
        forceDiscovery,
      ),
  );
}

function latestContentActivityMs(subscription) {
  const contentTimes = (subscription?.seasons || [])
    .flatMap((season) => [
      season.lastEpisodeChangedAt,
      season.firstVisibleTime,
    ])
    .map((value) => Date.parse(value || ""))
    .filter(Number.isFinite);
  if (contentTimes.length) {
    return Math.max(...contentTimes);
  }

  const createdAtMs = Date.parse(subscription?.createdAt || "");
  if (Number.isFinite(createdAtMs)) {
    return createdAtMs;
  }
  const addedTimes = (subscription?.seasons || [])
    .map((season) => Date.parse(season.addedAt || ""))
    .filter(Number.isFinite);
  return addedTimes.length ? Math.min(...addedTimes) : null;
}

function shouldAutomaticallyInactivate(subscription, staleDays, nowMs) {
  if (
    isKnownInactiveSeries(subscription) ||
    isKnownCompletedSeries(subscription) ||
    Number.isFinite(Date.parse(subscription?.completedAt || "")) ||
    Number.isFinite(
      Date.parse(subscription?.seriesCompletionVerifiedAt || ""),
    )
  ) {
    return null;
  }
  const latestActivityMs = latestContentActivityMs(subscription);
  if (
    !Number.isFinite(latestActivityMs) ||
    nowMs - latestActivityMs < staleDays * 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  return { latestActivityMs };
}

function clearAutomaticInactive(subscription) {
  subscription.autoInactiveAt = null;
  subscription.autoInactiveReason = null;
  subscription.inactiveStatusCheckedAt = null;
  // Remove fields written by state versions that treated inactivity as a
  // confirmed series completion.
  subscription.autoCompletedAt = null;
  subscription.autoCompletionReason = null;
}

function clearSeriesCompletionState(subscription) {
  clearAutomaticInactive(subscription);
  subscription.seriesStatusOverride = null;
  subscription.seriesStatusOverrideAt = null;
  subscription.seriesCompletionAnnounced = false;
  subscription.completedAt = null;
  subscription.seriesCompletionVerifiedAt = null;
}

function clearPendingNotificationsForSubscription(state, subscriptionId) {
  const affectedEventIds = new Set();
  for (const pending of state.pendingNotifications) {
    if (pending.subscriptionId === subscriptionId) {
      for (const eventId of pending.eventIds || []) {
        affectedEventIds.add(eventId);
      }
    }
  }
  for (const event of state.events) {
    if (
      event.subscriptionId === subscriptionId &&
      affectedEventIds.has(event.id)
    ) {
      event.notificationDueAt = null;
      event.notificationError = null;
    }
  }
  state.pendingNotifications = state.pendingNotifications.filter(
    (pending) => pending.subscriptionId !== subscriptionId,
  );
}

function clearQueuedNotificationsForSubscription(state, subscriptionId) {
  clearPendingNotificationsForSubscription(state, subscriptionId);
  const affectedEventIds = new Set();
  for (const reminder of state.discoveryReminders) {
    if (reminder.subscriptionId === subscriptionId) {
      for (const eventId of reminder.eventIds || []) {
        affectedEventIds.add(eventId);
      }
    }
  }
  for (const event of state.events) {
    if (
      event.subscriptionId === subscriptionId &&
      affectedEventIds.has(event.id)
    ) {
      event.notificationDueAt = null;
      event.notificationError = null;
    }
  }
  state.discoveryReminders = state.discoveryReminders.filter(
    (reminder) => reminder.subscriptionId !== subscriptionId,
  );
}

function remindersEnabledForSubscription(state, subscriptionId) {
  const subscription = state.subscriptions.find(
    (item) => item.id === subscriptionId,
  );
  return reminderModeForSubscription(subscription) === "enabled";
}

function reminderModeForSubscription(subscription) {
  if (!subscription || subscription.reminderEnabled === false) {
    return "disabled";
  }
  if (subscription.reminderMutedForCurrentUpdate === true) {
    return "muted";
  }
  return "enabled";
}

function resumeMutedReminderForNewUpdate(subscription) {
  if (subscription?.reminderMutedForCurrentUpdate === true) {
    subscription.reminderMutedForCurrentUpdate = false;
  }
}

function statusLabel(status) {
  if (status === "completed") {
    return "已完结";
  }
  if (status === "inactive") {
    return "系列已停更";
  }
  if (status === "updating") {
    return "更新中";
  }
  return "状态未知";
}

function manualSeriesStatusReason(status) {
  return {
    updating: "已手动标记为更新中，将继续自动检查。",
    completed: "已手动标记为已完结，已停止自动检查。",
    unknown: "已手动标记为状态未知，将继续自动检查。",
  }[status];
}

function seasonSortValue(season) {
  const firstVisibleMs = Date.parse(season.firstVisibleTime || "");
  if (Number.isFinite(firstVisibleMs)) {
    return firstVisibleMs;
  }
  return Date.parse(season.addedAt || "") || 0;
}

function createSeason(detail, source, timestamp) {
  return {
    seriesId: detail.seriesId,
    seriesGroupId: detail.seriesGroupId,
    title: detail.title,
    coverUrl: detail.coverUrl,
    intro: detail.intro,
    tags: detail.tags,
    firstVisibleTime: detail.firstVisibleTime,
    lastEpisodeChangedAt: null,
    status: detail.status,
    episodeCount: detail.episodeCount,
    totalEpisodeCount: detail.totalEpisodeCount,
    accessibleEpisodeCount: detail.accessibleEpisodeCount,
    highWaterEpisodeCount: detail.episodeCount,
    lastObservedEpisodeCount: detail.episodeCount,
    rightText: detail.rightText,
    detailUrl: detail.detailUrl,
    source,
    addedAt: timestamp,
    updatedAt: timestamp,
    lastCheckedAt: timestamp,
    lastError: null,
  };
}

function baselineMessage(detail, source) {
  const prefix =
    source === "manual"
      ? "手动追加同系列季"
      : source === "album"
        ? "官方多季列表发现同系列季"
        : source === "recommendation"
          ? "发现同系列季"
          : "开始追更";
  return `${prefix}《${detail.title}》，基线 ${detail.episodeCount} 集，${statusLabel(detail.status)}。`;
}

function findSeasonReference(state, seriesId) {
  for (const subscription of state.subscriptions) {
    const season = subscription.seasons.find(
      (item) => item.seriesId === String(seriesId),
    );
    if (season) {
      return { subscription, season };
    }
  }
  return null;
}

function earliestVisibleSeason(seasons) {
  return [...seasons].sort((left, right) => {
    const leftVisible =
      Date.parse(left.firstVisibleTime || "") || Number.POSITIVE_INFINITY;
    const rightVisible =
      Date.parse(right.firstVisibleTime || "") || Number.POSITIVE_INFINITY;
    return leftVisible - rightVisible;
  })[0] || null;
}

function applySubscriptionIdentity(subscription, preferredFirstSeason = null) {
  const identity = deriveSubscriptionIdentity(subscription);
  const preferredGroupMatches =
    !preferredFirstSeason ||
    !preferredFirstSeason.seriesGroupId ||
    preferredFirstSeason.seriesGroupId === subscription.seriesGroupId;
  const preferredNumber = seasonNumber(preferredFirstSeason?.title);
  const preferredIsFirst =
    preferredGroupMatches &&
    Boolean(preferredFirstSeason?.title) &&
    (preferredNumber === null || preferredNumber === 1);
  const firstSeason = preferredIsFirst
    ? preferredFirstSeason
    : identity.firstSeason;
  const firstSeasonTitle = normalizeWhitespace(
    firstSeason?.title || identity.firstSeasonTitle,
  );

  subscription.firstSeasonId =
    firstSeason?.seriesId || identity.firstSeasonId || null;
  subscription.firstSeasonTitle = firstSeasonTitle;
  subscription.displayTitle = firstSeasonTitle;
  subscription.title = firstSeasonTitle;
  subscription.coverUrl =
    firstSeason?.coverUrl || subscription.coverUrl || "";
  return {
    ...identity,
    firstSeasonId: subscription.firstSeasonId,
    firstSeasonTitle: subscription.firstSeasonTitle,
    displayTitle: subscription.displayTitle,
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      } catch (error) {
        results[currentIndex] = { error };
      }
    }
  }

  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    () => run(),
  );
  await Promise.all(runners);
  return results;
}

function formatNotificationTime(value) {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "时间未知";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: NOTIFICATION_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function latestEventTime(events) {
  return events.reduce((latest, event) => {
    const eventMs = Date.parse(event.createdAt || event.lastObservedAt || "");
    const latestMs = Date.parse(latest || "");
    return Number.isFinite(eventMs) &&
      (!Number.isFinite(latestMs) || eventMs > latestMs)
      ? event.createdAt || event.lastObservedAt
      : latest;
  }, "");
}

function notificationTemplateCopy(
  state,
  type,
  { defaultTitle, defaultBody, variables },
) {
  const template = state.settings.notificationTemplates?.[type] || {};
  const renderedTitle = template.title
    ? renderNotificationTemplate(template.title, variables)
    : "";
  const renderedBody = template.body
    ? renderNotificationTemplate(template.body, variables)
    : "";
  return {
    title: renderedTitle.trim() ? renderedTitle.trim() : defaultTitle,
    body: renderedBody.trim() ? renderedBody.trim() : defaultBody,
  };
}

function seasonForEvent(subscription, event) {
  return subscription?.seasons.find(
    (season) => season.seriesId === event.seasonId,
  );
}

function eventTimingParts(subscription, event) {
  const season = seasonForEvent(subscription, event);
  const parts = [];
  if (season) {
    parts.push(`季上线：${formatNotificationTime(season.firstVisibleTime)}`);
  }
  if (event.type === EVENT_TYPE.EPISODE) {
    parts.push(`检测到更新：${formatNotificationTime(event.createdAt)}`);
  } else if (event.type === EVENT_TYPE.SEASON) {
    parts.push(`检测到新季：${formatNotificationTime(event.createdAt)}`);
  } else if (event.type === EVENT_TYPE.COMPLETED) {
    parts.push(`确认完结：${formatNotificationTime(event.createdAt)}`);
  }
  return parts;
}

function subscriptionEventLines(subscription, events) {
  return events
    .filter((event) => SUMMARY_EVENT_TYPES.has(event.type))
    .sort((left, right) => {
      const leftMs = Date.parse(left.createdAt || "") || 0;
      const rightMs = Date.parse(right.createdAt || "") || 0;
      return leftMs - rightMs;
    })
    .map((event) => {
      if (event.type === EVENT_TYPE.EPISODE) {
        const delta =
          Number(event.episodeCount) - Number(event.previousEpisodeCount);
        const timing = eventTimingParts(subscription, event);
        return `• 集数更新：《${event.seasonTitle}》更新到第 ${event.episodeCount} 集${
          Number.isFinite(delta) && delta > 0 ? `，新增 ${delta} 集` : ""
        }。${timing.length ? `\n  ${timing.join("；")}` : ""}`;
      }
      if (event.type === EVENT_TYPE.SEASON) {
        const timing = eventTimingParts(subscription, event);
        return `• 发现新季：《${event.seasonTitle}》，当前 ${event.episodeCount} 集。${
          timing.length ? `\n  ${timing.join("；")}` : ""
        }`;
      }
      if (event.type === EVENT_TYPE.COMPLETED) {
        const timing = eventTimingParts(subscription, event);
        return `• 系列完结：共 ${event.seasonCount || 0} 季，合计 ${event.episodeCount || 0} 集。${
          timing.length ? `\n  ${timing.join("；")}` : ""
        }`;
      }
      return "";
    })
    .filter(Boolean);
}

function detailedCheckMessage(state, events, subscriptionId) {
  const subscription = state.subscriptions.find(
    (item) => item.id === subscriptionId,
  );
  const relevantEvents = events.filter((event) =>
    SUMMARY_EVENT_TYPES.has(event.type),
  );
  if (
    !subscription ||
    subscription.reminderEnabled === false ||
    !relevantEvents.length
  ) {
    return null;
  }

  const seriesTitle =
    subscription.displayTitle ||
    subscription.firstSeasonTitle ||
    subscription.title;
  const contentTypes = new Set(relevantEvents.map((event) => event.type));
  const notificationTitle =
    relevantEvents.length === 1 && contentTypes.has(EVENT_TYPE.EPISODE)
      ? "红果短剧更新"
      : relevantEvents.length === 1 && contentTypes.has(EVENT_TYPE.SEASON)
        ? "发现同系列新季"
        : relevantEvents.length === 1 &&
            contentTypes.has(EVENT_TYPE.COMPLETED)
          ? "短剧系列已完结"
          : `《${seriesTitle}》更新详情`;
  const lines = [
    `检查时间：${formatNotificationTime(latestEventTime(relevantEvents))}`,
    "",
    ...subscriptionEventLines(subscription, relevantEvents),
    "",
    `当前共收录 ${subscription.seasons.length} 季。`,
  ];

  return notificationTemplateCopy(state, "detailed", {
    defaultTitle: notificationTitle,
    defaultBody: lines.join("\n"),
    variables: {
      appName: APP_NAME,
      seriesTitle,
      checkTime: formatNotificationTime(
        latestEventTime(relevantEvents),
      ),
      updates: subscriptionEventLines(
        subscription,
        relevantEvents,
      ).join("\n"),
      seasonCount: subscription.seasons.length,
    },
  });
}

function seasonRankMap(subscription) {
  return new Map(
    [...subscription.seasons]
      .sort((left, right) => seasonSortValue(right) - seasonSortValue(left))
      .map((season, index) => [season.seriesId, index]),
  );
}

function latestChangedEvent(subscription, events) {
  const ranks = seasonRankMap(subscription);
  const contentEvents = events.filter(
    (event) =>
      event.type === EVENT_TYPE.EPISODE || event.type === EVENT_TYPE.SEASON,
  );
  contentEvents.sort((left, right) => {
    const leftRank = ranks.get(left.seasonId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = ranks.get(right.seasonId) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    const leftMs = Date.parse(left.createdAt || "") || 0;
    const rightMs = Date.parse(right.createdAt || "") || 0;
    return rightMs - leftMs;
  });
  return (
    contentEvents[0] ||
    events.find((event) => event.type === EVENT_TYPE.COMPLETED) ||
    null
  );
}

function compactSeasonTitle(seriesTitle, seasonTitle) {
  const normalizedSeriesTitle = normalizeWhitespace(
    seriesTitle || seasonTitle || "未知短剧",
  );
  const normalizedSeasonTitle = normalizeWhitespace(
    seasonTitle || seriesTitle || "未知短剧",
  );
  if (normalizedSeasonTitle === normalizedSeriesTitle) {
    return `《${normalizedSeriesTitle}》`;
  }

  const seriesBase = titleWithoutSeason(normalizedSeriesTitle);
  const seasonBase = titleWithoutSeason(normalizedSeasonTitle);
  if (
    seriesBase &&
    seriesBase === seasonBase &&
    normalizedSeasonTitle.startsWith(seasonBase)
  ) {
    const seasonSuffix = normalizeWhitespace(
      normalizedSeasonTitle.slice(seasonBase.length),
    );
    if (seasonSuffix) {
      return `《${seasonBase}》${seasonSuffix}`;
    }
  }
  return `《${normalizedSeasonTitle}》`;
}

function compactChangeLine(subscription, events) {
  const seriesTitle =
    subscription.displayTitle ||
    subscription.firstSeasonTitle ||
    subscription.title;
  const event = latestChangedEvent(subscription, events);
  if (!event) {
    return "";
  }

  let detail;
  if (event.type === EVENT_TYPE.COMPLETED) {
    detail = `《${seriesTitle}》全系列完结 · ${event.seasonCount || subscription.seasons.length} 季/${event.episodeCount || 0} 集`;
  } else {
    const title = compactSeasonTitle(seriesTitle, event.seasonTitle);
    if (event.type === EVENT_TYPE.SEASON) {
      detail = `${title} · 新季 ${event.episodeCount} 集`;
    } else {
      const delta =
        Number(event.episodeCount) - Number(event.previousEpisodeCount);
      detail = `${title} · 第 ${event.episodeCount} 集${
        Number.isFinite(delta) && delta > 0 ? `（新增 ${delta} 集）` : ""
      }`;
    }
    if (events.some((item) => item.type === EVENT_TYPE.COMPLETED)) {
      detail += " · 已完结";
    }
  }

  const timing = eventTimingParts(subscription, event);
  return timing.length ? `${detail} · ${timing.join(" · ")}` : detail;
}

function groupedCheckEvents(state, events) {
  const groups = new Map();
  for (const event of events) {
    if (!event.subscriptionId || !SUMMARY_EVENT_TYPES.has(event.type)) {
      continue;
    }
    const subscription = state.subscriptions.find(
      (item) => item.id === event.subscriptionId,
    );
    if (!subscription || subscription.reminderEnabled === false) {
      continue;
    }
    const group = groups.get(event.subscriptionId) || {
      subscription,
      events: [],
      order: groups.size,
    };
    group.events.push(event);
    groups.set(event.subscriptionId, group);
  }
  return [...groups.values()].sort((left, right) => left.order - right.order);
}

function batchCheckMessage(state, events) {
  const groups = groupedCheckEvents(state, events);
  if (!groups.length) {
    return null;
  }
  const allEvents = groups.flatMap((group) => group.events);
  const lines = groups
    .map((group, index) => {
      const line = compactChangeLine(group.subscription, group.events);
      return line ? `${index + 1}. ${line}` : "";
    })
    .filter(Boolean);
  if (!lines.length) {
    return null;
  }

  const checkTime = formatNotificationTime(
    latestEventTime(allEvents),
  );
  return notificationTemplateCopy(state, "batch", {
    defaultTitle: `${APP_NAME} · ${lines.length} 个系列有更新`,
    defaultBody: `检查时间：${checkTime}\n\n${lines.join("\n")}`,
    variables: {
      appName: APP_NAME,
      checkTime,
      updateCount: groups.length,
      updates: lines.join("\n"),
    },
  });
}

function pendingNotificationCopy(state, pendingNotifications) {
  const pendingBySubscription = new Map();
  for (const pending of pendingNotifications) {
    const subscription = state.subscriptions.find(
      (item) => item.id === pending.subscriptionId,
    );
    if (!subscription || subscription.reminderEnabled === false) {
      continue;
    }
    const group = pendingBySubscription.get(pending.subscriptionId) || {
      subscription,
      pending: [],
      order: pendingBySubscription.size,
    };
    group.pending.push(pending);
    pendingBySubscription.set(pending.subscriptionId, group);
  }

  const groups = [...pendingBySubscription.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => {
      const ranks = seasonRankMap(group.subscription);
      const pending = [...group.pending].sort((left, right) => {
        const leftRank =
          ranks.get(left.seasonId) ?? Number.MAX_SAFE_INTEGER;
        const rightRank =
          ranks.get(right.seasonId) ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return (
          (Date.parse(right.lastObservedAt || "") || 0) -
          (Date.parse(left.lastObservedAt || "") || 0)
        );
      })[0];
      if (!pending) {
        return null;
      }
      const seriesTitle =
        group.subscription.displayTitle ||
        group.subscription.firstSeasonTitle ||
        group.subscription.title;
      const title = compactSeasonTitle(seriesTitle, pending.seasonTitle);
      const delta = pending.episodeCount - pending.baselineEpisodeCount;
      const season = group.subscription.seasons.find(
        (item) => item.seriesId === pending.seasonId,
      );
      const timing = [
        `季上线：${formatNotificationTime(season?.firstVisibleTime)}`,
        `检测到更新：${formatNotificationTime(pending.lastObservedAt)}`,
      ];
      return {
        subscriptionId: group.subscription.id,
        line: `${title} · 第 ${pending.episodeCount} 集（本时段新增 ${delta} 集） · ${timing.join(" · ")}`,
        lastObservedAt: pending.lastObservedAt,
      };
    })
    .filter(Boolean);

  if (!groups.length) {
    return null;
  }
  const checkTime = formatNotificationTime(
    latestEventTime(groups),
  );
  const updates = groups
    .map((group, index) => `${index + 1}. ${group.line}`)
    .join("\n");
  return notificationTemplateCopy(state, "batch", {
    defaultTitle: "红果短剧更新汇总",
    defaultBody: `最近检测：${checkTime}\n\n${updates}`,
    variables: {
      appName: APP_NAME,
      checkTime,
      updateCount: groups.length,
      updates,
    },
  });
}

function discoveryReminderCopy(state, reminders, nowMs) {
  const remindersBySubscription = new Map();
  for (const reminder of reminders) {
    const subscription = state.subscriptions.find(
      (item) => item.id === reminder.subscriptionId,
    );
    if (!subscription || subscription.reminderEnabled === false) {
      continue;
    }
    const group = remindersBySubscription.get(reminder.subscriptionId) || {
      subscription,
      reminders: [],
      order: remindersBySubscription.size,
    };
    group.reminders.push(reminder);
    remindersBySubscription.set(reminder.subscriptionId, group);
  }

  const groups = [...remindersBySubscription.values()]
    .sort((left, right) => left.order - right.order)
    .map((group) => {
      const ranks = seasonRankMap(group.subscription);
      const reminder = [...group.reminders].sort((left, right) => {
        const leftRank =
          ranks.get(left.seasonId) ?? Number.MAX_SAFE_INTEGER;
        const rightRank =
          ranks.get(right.seasonId) ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
        return (
          (Date.parse(right.lastDiscoveredAt || "") || 0) -
          (Date.parse(left.lastDiscoveredAt || "") || 0)
        );
      })[0];
      if (!reminder) {
        return null;
      }

      const seriesTitle =
        group.subscription.displayTitle ||
        group.subscription.firstSeasonTitle ||
        group.subscription.title;
      const title = compactSeasonTitle(
        seriesTitle,
        reminder.seasonTitle,
      );
      const season = group.subscription.seasons.find(
        (item) => item.seriesId === reminder.seasonId,
      );
      const change =
        reminder.type === EVENT_TYPE.SEASON
          ? `${title} · 新季 ${reminder.episodeCount} 集`
          : `${title} · 第 ${reminder.episodeCount} 集${
              reminder.episodeCount > reminder.previousEpisodeCount
                ? `（新增 ${
                    reminder.episodeCount -
                    reminder.previousEpisodeCount
                  } 集）`
                : ""
            }`;
      const timing = [
        season
          ? `季上线：${formatNotificationTime(season.firstVisibleTime)}`
          : "",
        `${
          reminder.type === EVENT_TYPE.SEASON
            ? "检测到新季"
            : "检测到更新"
        }：${formatNotificationTime(reminder.lastDiscoveredAt)}`,
        `提醒有效至：${formatNotificationTime(reminder.expiresAt)}`,
      ].filter(Boolean);

      return `${change} · ${timing.join(" · ")}`;
    })
    .filter(Boolean);

  if (!groups.length) {
    return null;
  }
  const reminderTime = formatNotificationTime(
    new Date(nowMs).toISOString(),
  );
  const updates = groups
    .map((group, index) => `${index + 1}. ${group}`)
    .join("\n");
  return notificationTemplateCopy(state, "reminder", {
    defaultTitle: "红果短剧新内容提醒",
    defaultBody: `提醒时间：${reminderTime}\n\n${updates}`,
    variables: {
      appName: APP_NAME,
      reminderTime,
      updateCount: groups.length,
      updates,
    },
  });
}

function queueEpisodeNotification(
  state,
  event,
  windowMinutes,
  nowMs,
) {
  if (!windowMinutes) {
    return null;
  }

  const existing = state.pendingNotifications.find(
    (pending) =>
      pending.subscriptionId === event.subscriptionId &&
      pending.seasonId === event.seasonId,
  );
  if (existing) {
    existing.seasonTitle = event.seasonTitle;
    existing.episodeCount = Math.max(
      existing.episodeCount,
      event.episodeCount,
    );
    existing.lastObservedAt = event.createdAt;
    existing.eventIds = [
      ...new Set([...existing.eventIds, event.id]),
    ];
    event.notificationDueAt = existing.dueAt;
    return existing;
  }

  const dueAt = new Date(
    nowMs + windowMinutes * 60_000,
  ).toISOString();
  const pending = {
    id: createId("notify_"),
    type: EVENT_TYPE.EPISODE,
    subscriptionId: event.subscriptionId,
    seasonId: event.seasonId,
    seasonTitle: event.seasonTitle,
    baselineEpisodeCount: event.previousEpisodeCount,
    episodeCount: event.episodeCount,
    firstObservedAt: event.createdAt,
    lastObservedAt: event.createdAt,
    dueAt,
    eventIds: [event.id],
    lastError: null,
  };
  state.pendingNotifications.push(pending);
  event.notificationDueAt = dueAt;
  return pending;
}

function nextDiscoveryReminderTime(cron, fromMs, expiresAtMs) {
  try {
    const nextMs = nextCronOccurrence(cron, new Date(fromMs)).getTime();
    return Number.isFinite(nextMs) && nextMs < expiresAtMs
      ? new Date(nextMs).toISOString()
      : null;
  } catch {
    return null;
  }
}

function queueDiscoveryReminder(state, event, nowMs) {
  if (
    ![EVENT_TYPE.EPISODE, EVENT_TYPE.SEASON].includes(event.type) ||
    !state.settings.discoveryReminderDurationMinutes
  ) {
    return null;
  }

  state.discoveryReminders = state.discoveryReminders.filter((reminder) => {
    const expiresAtMs = Date.parse(reminder.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });

  const existing = state.discoveryReminders.find(
    (reminder) =>
      reminder.subscriptionId === event.subscriptionId &&
      reminder.seasonId === event.seasonId,
  );
  if (existing) {
    existing.type = event.type;
    existing.seasonTitle = event.seasonTitle;
    existing.previousEpisodeCount =
      event.type === EVENT_TYPE.EPISODE
        ? event.previousEpisodeCount
        : null;
    existing.episodeCount = event.episodeCount;
    existing.lastDiscoveredAt = event.createdAt;
    existing.eventIds = [
      ...new Set([...existing.eventIds, event.id]),
    ];
    return existing;
  }

  const expiresAtMs =
    nowMs + state.settings.discoveryReminderDurationMinutes * 60_000;
  const nextReminderAt = nextDiscoveryReminderTime(
    state.settings.discoveryReminderCron,
    nowMs,
    expiresAtMs,
  );
  if (!nextReminderAt) {
    return null;
  }

  const reminder = {
    id: createId("repeat_"),
    type: event.type,
    subscriptionId: event.subscriptionId,
    seasonId: event.seasonId,
    seasonTitle: event.seasonTitle,
    previousEpisodeCount:
      event.type === EVENT_TYPE.EPISODE
        ? event.previousEpisodeCount
        : null,
    episodeCount: event.episodeCount,
    firstDiscoveredAt: event.createdAt,
    lastDiscoveredAt: event.createdAt,
    expiresAt: new Date(expiresAtMs).toISOString(),
    eventIds: [event.id],
    nextReminderAt,
    lastReminderAt: null,
    lastError: null,
  };
  state.discoveryReminders.push(reminder);
  return reminder;
}

function restoreDiscoveryRemindersForSubscription(
  state,
  subscription,
  nowMs,
  { includeEventsBeforeLastWatched = null } = {},
) {
  const durationMinutes = Number(
    state.settings.discoveryReminderDurationMinutes,
  );
  if (
    !subscription ||
    subscription.hasUnreadUpdate !== true ||
    reminderModeForSubscription(subscription) !== "enabled" ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return [];
  }

  const durationMs = durationMinutes * 60_000;
  const cutoffMs = nowMs - durationMs;
  const lastWatchedMs = Date.parse(subscription.lastWatchedAt || "");
  const eventsBySeason = new Map();
  const eligibleEvents = [];

  for (const event of state.events) {
    if (
      event.subscriptionId !== subscription.id ||
      ![EVENT_TYPE.EPISODE, EVENT_TYPE.SEASON].includes(event.type) ||
      !event.seasonId
    ) {
      continue;
    }
    const eventMs = Date.parse(event.createdAt || "");
    if (
      !Number.isFinite(eventMs) ||
      eventMs < cutoffMs ||
      eventMs > nowMs
    ) {
      continue;
    }
    eligibleEvents.push({ event, eventMs });
  }

  const hasEventsAfterLastWatched =
    Number.isFinite(lastWatchedMs) &&
    eligibleEvents.some(({ eventMs }) => eventMs > lastWatchedMs);
  const includeEarlierEvents =
    includeEventsBeforeLastWatched ??
    !hasEventsAfterLastWatched;

  for (const { event, eventMs } of eligibleEvents) {
    if (
      Number.isFinite(lastWatchedMs) &&
      eventMs <= lastWatchedMs &&
      !includeEarlierEvents
    ) {
      continue;
    }
    const key = `${event.subscriptionId}:${event.seasonId}`;
    const events = eventsBySeason.get(key) || [];
    events.push(event);
    eventsBySeason.set(key, events);
  }

  state.discoveryReminders = state.discoveryReminders.filter((reminder) => {
    const expiresAtMs = Date.parse(reminder.expiresAt || "");
    return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
  });
  const existingKeys = new Set(
    state.discoveryReminders
      .filter((reminder) => reminder.subscriptionId === subscription.id)
      .map(
        (reminder) =>
          `${reminder.subscriptionId}:${reminder.seasonId}`,
      ),
  );
  const restored = [];

  for (const [key, events] of eventsBySeason) {
    if (existingKeys.has(key)) {
      continue;
    }
    events.sort(
      (left, right) =>
        (Date.parse(left.createdAt || "") || 0) -
        (Date.parse(right.createdAt || "") || 0),
    );
    const firstEvent = events[0];
    const latestEvent = events.at(-1);
    const firstDiscoveredMs = Date.parse(firstEvent?.createdAt || "");
    const expiresAtMs = firstDiscoveredMs + durationMs;
    if (
      !Number.isFinite(firstDiscoveredMs) ||
      expiresAtMs <= nowMs
    ) {
      continue;
    }

    const episodeEvents = events.filter(
      (event) => event.type === EVENT_TYPE.EPISODE,
    );
    const reminder = {
      id: createId("repeat_"),
      type: latestEvent.type,
      subscriptionId: subscription.id,
      seasonId: latestEvent.seasonId,
      seasonTitle: latestEvent.seasonTitle,
      previousEpisodeCount:
        latestEvent.type === EVENT_TYPE.EPISODE
          ? (episodeEvents[0]?.previousEpisodeCount ?? null)
          : null,
      episodeCount: Math.max(
        ...events.map((event) => Number(event.episodeCount) || 0),
      ),
      firstDiscoveredAt: new Date(firstDiscoveredMs).toISOString(),
      lastDiscoveredAt: latestEvent.createdAt,
      expiresAt: new Date(expiresAtMs).toISOString(),
      eventIds: [...new Set(events.map((event) => event.id))],
      nextReminderAt: new Date(nowMs).toISOString(),
      lastReminderAt: null,
      lastError: null,
    };
    state.discoveryReminders.push(reminder);
    existingKeys.add(key);
    restored.push(reminder);
  }

  return restored;
}

export class ReminderService {
  constructor({
    store,
    fetchDetail = fetchSeriesDetail,
    fetchAlbumSeries = fetchAlbumSeriesInfo,
    resolveShared = resolveSharedSeries,
    sendNotifications = sendNotificationChannels,
    systemLog = null,
    now = () => new Date(),
    discoveryIntervalMs = DISCOVERY_INTERVAL_MS,
    candidateRecheckMs = CANDIDATE_RECHECK_MS,
    timers = { setTimeout, clearTimeout },
    requestScheduler = null,
  }) {
    this.store = store;
    this.fetchDetail = requestScheduler
      ? (seriesId) => fetchDetail(seriesId, { requestScheduler })
      : fetchDetail;
    this.fetchAlbumSeries = requestScheduler
      ? (seriesId) => fetchAlbumSeries(seriesId, { requestScheduler })
      : fetchAlbumSeries;
    this.resolveShared = requestScheduler
      ? (input) => resolveShared(input, { requestScheduler })
      : resolveShared;
    this.sendNotifications = sendNotifications;
    this.systemLog = systemLog;
    this.now = now;
    this.discoveryIntervalMs = discoveryIntervalMs;
    this.candidateRecheckMs = candidateRecheckMs;
    this.timers = timers;
    this.operationQueue = Promise.resolve();
    this.checking = false;
    this.schedulerTimer = null;
    this.nextCheckAt = null;
    this.stopped = true;
  }

  async writeSystemLog(entry) {
    if (!this.systemLog) {
      return;
    }
    try {
      await this.systemLog.append(entry);
    } catch (error) {
      console.error(
        `系统操作日志写入失败：${error?.message || "未知错误"}`,
      );
    }
  }

  async logCheckResult(result, { scope, trigger, subscriptionId = null }) {
    let title = "";
    if (subscriptionId) {
      const state = await this.store.read();
      const subscription = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      title =
        subscription?.displayTitle ||
        subscription?.firstSeasonTitle ||
        subscription?.title ||
        "";
    }
    const triggerLabel =
      trigger === "cron" ? "自动检查" : "手动检查";
    const scopeLabel =
      scope === "single" ? (title ? `《${title}》` : "单个系列") : "全部追更";
    const skipped = [
      result.skipped === "completed" ? "已完结" : "",
      result.skipped === "inactive" ? "今天已核验停更状态" : "",
      result.skipped === "paused" ? "已暂停追更" : "",
    ].filter(Boolean);
    const message = skipped.length
      ? `${triggerLabel}跳过${scopeLabel}：${skipped.join("、")}。`
      : `${triggerLabel}${scopeLabel}完成：检查 ${
          result.seasonsChecked || 0
        } 个季，发现 ${result.updatedSeasons || 0} 个季有更新，${
          result.discoveredSeasons || 0
        } 个新季${
          result.errors > 0 ? `，${result.errors} 项失败` : ""
        }${
          result.discoveryFailures > 0
            ? `，${result.discoveryFailures} 个系列多季核验未完成`
            : ""
        }。`;
    const failureCount =
      (result.errors || 0) + (result.discoveryFailures || 0);
    await this.writeSystemLog({
      category: "check",
      action: "check.completed",
      level:
        failureCount > 0
          ? result.seasonsChecked > failureCount
            ? "warning"
            : "error"
          : "success",
      message,
      metadata: {
        scope,
        trigger,
        subscriptionId,
        seasonsChecked: result.seasonsChecked || 0,
        updatedSeasons: result.updatedSeasons || 0,
        discoveredSeasons: result.discoveredSeasons || 0,
        errors: result.errors || 0,
        discoveryFailures: result.discoveryFailures || 0,
      },
    });
  }

  enqueue(operation) {
    const queued = this.operationQueue.then(operation);
    this.operationQueue = queued.catch(() => {});
    return queued;
  }

  async resolveFirstSeasonDetail(detail) {
    const number = seasonNumber(detail?.title);
    if (number === 1 || number === null) {
      return detail;
    }
    if (!detail.seriesGroupId) {
      return number === null ? detail : null;
    }

    try {
      const album = normalizeAlbumMetadata(
        await this.fetchAlbumSeries(detail.seriesId),
      );
      if (albumMetadataIssue(album)) {
        return null;
      }

      const detailResults = await mapWithConcurrency(
        album.publishedSeriesIds.slice(0, MAX_SEASONS_PER_SERIES),
        NETWORK_CONCURRENCY,
        async (seriesId) =>
          seriesId === detail.seriesId
            ? { detail }
            : this.fetchDetail(seriesId),
      );
      const matchingDetails = detailResults
        .filter((result) => !result?.error && result?.detail)
        .map((result) => result.detail)
        .filter(
          (candidate) =>
            candidate.seriesGroupId === detail.seriesGroupId,
        );
      const explicitFirstSeasons = matchingDetails.filter(
        (candidate) => seasonNumber(candidate.title) === 1,
      );
      if (explicitFirstSeasons.length) {
        return earliestVisibleSeason(explicitFirstSeasons);
      }

      const unnumberedSeasons = matchingDetails.filter(
        (candidate) => seasonNumber(candidate.title) === null,
      );
      if (unnumberedSeasons.length) {
        return earliestVisibleSeason(unnumberedSeasons);
      }
      return null;
    } catch {
      if (number === null) {
        return detail;
      }
      return null;
    }
  }

  async addSubscription(input, { detail: preparedDetail = null } = {}) {
    let detail = preparedDetail;
    if (!detail) {
      const resolved = await this.resolveShared(input);
      ({ detail } = await this.fetchDetail(resolved.seriesId));
    }
    const firstSeasonDetail = await this.resolveFirstSeasonDetail(detail);
    const timestamp = this.now().toISOString();

    return this.store.mutate((state) => {
      const existing = findSeasonReference(state, detail.seriesId);
      if (existing) {
        const error = new ReminderError(
          "这部剧已经在我的追更中。",
          "SUBSCRIPTION_EXISTS",
          409,
        );
        error.subscriptionId = existing.subscription.id;
        error.seriesTitle =
          existing.subscription.displayTitle ||
          existing.subscription.firstSeasonTitle ||
          existing.subscription.title;
        throw error;
      }

      if (state.subscriptions.length >= MAX_SUBSCRIPTIONS) {
        throw new ReminderError(
          `最多支持 ${MAX_SUBSCRIPTIONS} 部短剧。`,
          "SUBSCRIPTION_LIMIT",
          409,
        );
      }

      let subscription = detail.seriesGroupId
        ? state.subscriptions.find(
            (item) => item.seriesGroupId === detail.seriesGroupId,
          )
        : null;
      let action = "created";

      if (subscription) {
        if (subscription.seasons.length >= MAX_SEASONS_PER_SERIES) {
          throw new ReminderError(
            "同一系列已确认的季数过多。",
            "SEASON_LIMIT",
            409,
          );
        }
        subscription.seasons.push(createSeason(detail, "share", timestamp));
        subscription.updatedAt = timestamp;
        subscription.discovery.lastRunAt = null;
        subscription.discovery.lastCompletedAt = null;
        subscription.discovery.lastDiscoveryIssue = null;
        subscription.discovery.confirmedSeriesIds = [];
        subscription.discovery.unpublishedSeriesIds = [];
        subscription.discovery.unpublishedSeasonCount = 0;
        subscription.discovery.albumSeasonCount = null;
        subscription.discovery.albumItemCount = null;
        clearAutomaticInactive(subscription);
        if (
          hasNewerSeason(
            subscription.seasons.slice(0, -1),
            subscription.seasons,
          )
        ) {
          subscription.seriesCompletionAnnounced = false;
          subscription.completedAt = null;
          subscription.seriesCompletionVerifiedAt = null;
        }
        action = "season_added";
      } else {
        subscription = {
          id: createId("sub_"),
          primarySeriesId: detail.seriesId,
          seriesGroupId: detail.seriesGroupId,
          title: detail.title,
          displayTitle: detail.title,
          firstSeasonId: firstSeasonDetail?.seriesId || null,
          firstSeasonTitle: firstSeasonDetail?.title || detail.title,
          coverUrl: detail.coverUrl,
          seriesStatus:
            detail.status === SERIES_STATUS.UPDATING
              ? SERIES_STATUS.UPDATING
              : SERIES_STATUS.UNKNOWN,
          seriesStatusReason:
            detail.status === SERIES_STATUS.UPDATING
              ? "已确认季度中有季度仍在更新。"
              : "已确认季度均已完结，等待官方多季列表及最高季“完结篇”标识核验。",
          seriesStatusOverride: null,
          seriesStatusOverrideAt: null,
          completedAt: null,
          seriesCompletionVerifiedAt: null,
          seriesCompletionAnnounced: false,
          autoInactiveAt: null,
          autoInactiveReason: null,
          inactiveStatusCheckedAt: null,
          hasUnreadUpdate: false,
          reminderEnabled: true,
          trackingPaused: false,
          lastWatchedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
          lastCheckedAt: timestamp,
          lastError: null,
          discovery: {
            lastRunAt: null,
            lastCompletedAt: null,
            lastDiscoveryIssue: null,
            confirmedSeriesIds: [],
            unpublishedSeriesIds: [],
            unpublishedSeasonCount: 0,
            albumSeasonCount: null,
            albumItemCount: null,
            candidates: {},
          },
          seasons: [createSeason(detail, "share", timestamp)],
        };
        state.subscriptions.unshift(subscription);
      }
      const identity = applySubscriptionIdentity(
        subscription,
        firstSeasonDetail,
      );
      const seriesStatus = deriveSeriesStatus(subscription.seasons, {
        confirmedSeriesIds: subscription.discovery.confirmedSeriesIds,
        discoveryError: subscription.discovery.lastDiscoveryIssue,
        unpublishedSeasonCount:
          subscription.discovery.unpublishedSeasonCount,
      });
      subscription.seriesStatus = seriesStatus.status;
      subscription.seriesStatusReason = seriesStatus.reason;

      const event = appendEvent(state, {
        id: createId("evt_"),
        type: EVENT_TYPE.BASELINE,
        subscriptionId: subscription.id,
        seasonId: detail.seriesId,
        seasonTitle: detail.title,
        message: baselineMessage(
          { ...detail, title: identity.displayTitle },
          "share",
        ),
        episodeCount: detail.episodeCount,
        previousEpisodeCount: null,
        createdAt: timestamp,
        notified: false,
      });

      return {
        action,
        subscriptionId: subscription.id,
        seasonId: detail.seriesId,
        seasonTitle: detail.title,
        title: identity.displayTitle,
        episodeCount: detail.episodeCount,
        eventId: event?.id || null,
      };
    });
  }

  async addSeason(subscriptionId, input) {
    const snapshot = await this.store.read();
    const subscription = snapshot.subscriptions.find(
      (item) => item.id === subscriptionId,
    );
    if (!subscription) {
      throw new ReminderError("追更条目不存在。", "SUBSCRIPTION_NOT_FOUND", 404);
    }
    if (!subscription.seriesGroupId) {
      throw new ReminderError(
        "当前条目没有官方系列分组信息，无法确认同系列关系。",
        "SERIES_GROUP_MISSING",
        409,
      );
    }

    const resolved = await this.resolveShared(input);
    const { detail } = await this.fetchDetail(resolved.seriesId);
    if (!detail.seriesGroupId) {
      throw new ReminderError(
        "红果详情页没有提供该剧的系列分组，不能自动归入同系列。",
        "SERIES_GROUP_MISSING",
        409,
      );
    }
    if (detail.seriesGroupId !== subscription.seriesGroupId) {
      throw new ReminderError(
        "这是另一部剧：红果官方系列分组与当前追更条目不匹配。",
        "SERIES_GROUP_MISMATCH",
        409,
      );
    }

    const firstSeasonDetail = await this.resolveFirstSeasonDetail(detail);
    const timestamp = this.now().toISOString();
    return this.store.mutate((state) => {
      const current = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      if (!current) {
        throw new ReminderError("追更条目不存在。", "SUBSCRIPTION_NOT_FOUND", 404);
      }
      if (
        current.seasons.some((season) => season.seriesId === detail.seriesId)
      ) {
        throw new ReminderError(
          "这部剧已经在当前系列中。",
          "SEASON_EXISTS",
          409,
        );
      }
      if (current.seasons.length >= MAX_SEASONS_PER_SERIES) {
        throw new ReminderError(
          "同一系列已确认的季数过多。",
          "SEASON_LIMIT",
          409,
        );
      }

      const newerSeason = hasNewerSeason(current.seasons, [
        ...current.seasons,
        detail,
      ]);
      current.seasons.push(createSeason(detail, "manual", timestamp));
      current.updatedAt = timestamp;
      current.discovery.lastRunAt = null;
      current.discovery.lastCompletedAt = null;
      current.discovery.lastDiscoveryIssue = null;
      current.discovery.confirmedSeriesIds = [];
      current.discovery.unpublishedSeriesIds = [];
      current.discovery.unpublishedSeasonCount = 0;
      current.discovery.albumSeasonCount = null;
      current.discovery.albumItemCount = null;
      clearAutomaticInactive(current);
      if (newerSeason) {
        current.seriesCompletionAnnounced = false;
        current.completedAt = null;
        current.seriesCompletionVerifiedAt = null;
      }
      const identity = applySubscriptionIdentity(
        current,
        firstSeasonDetail,
      );
      const seriesStatus = deriveSeriesStatus(current.seasons, {
        confirmedSeriesIds: current.discovery.confirmedSeriesIds,
        discoveryError: current.discovery.lastDiscoveryIssue,
        unpublishedSeasonCount:
          current.discovery.unpublishedSeasonCount,
      });
      current.seriesStatus = seriesStatus.status;
      current.seriesStatusReason = seriesStatus.reason;
      const event = appendEvent(state, {
        id: createId("evt_"),
        type: EVENT_TYPE.BASELINE,
        subscriptionId: current.id,
        seasonId: detail.seriesId,
        seasonTitle: detail.title,
        message: baselineMessage(detail, "manual"),
        episodeCount: detail.episodeCount,
        previousEpisodeCount: null,
        createdAt: timestamp,
        notified: false,
      });

      return {
        subscriptionId: current.id,
        seasonId: detail.seriesId,
        seasonTitle: detail.title,
        title: identity.displayTitle,
        eventId: event?.id || null,
      };
    });
  }

  async removeSubscription(subscriptionId) {
    return this.store.mutate((state) => {
      const index = state.subscriptions.findIndex(
        (item) => item.id === subscriptionId,
      );
      if (index === -1) {
        throw new ReminderError(
          "追更条目不存在。",
          "SUBSCRIPTION_NOT_FOUND",
          404,
        );
      }
      const [removed] = state.subscriptions.splice(index, 1);
      state.events = state.events.filter(
        (event) => event.subscriptionId !== subscriptionId,
      );
      state.pendingNotifications = state.pendingNotifications.filter(
        (pending) => pending.subscriptionId !== subscriptionId,
      );
      state.discoveryReminders = state.discoveryReminders.filter(
        (reminder) => reminder.subscriptionId !== subscriptionId,
      );
      return {
        id: removed.id,
        title: removed.displayTitle || removed.title,
        subscription: {
          id: removed.id,
          title: removed.displayTitle || removed.title,
          seriesGroupId: removed.seriesGroupId || null,
          firstSeasonId: removed.firstSeasonId || null,
          seasons: removed.seasons.map((season) => ({
            seriesId: season.seriesId,
          })),
        },
      };
    });
  }

  async setSubscriptionTrackingState(subscriptionId, paused) {
    const timestamp = this.now().toISOString();
    return this.store.mutate((state) => {
      const subscription = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      if (!subscription) {
        throw new ReminderError(
          "追更条目不存在。",
          "SUBSCRIPTION_NOT_FOUND",
          404,
        );
      }
      subscription.trackingPaused = Boolean(paused);
      subscription.updatedAt = timestamp;
      return {
        id: subscription.id,
        title:
          subscription.displayTitle ||
          subscription.firstSeasonTitle ||
          subscription.title,
        trackingPaused: subscription.trackingPaused,
      };
    });
  }

  async setSubscriptionWatchState(subscriptionId, watched) {
    const now = this.now();
    let restoredReminderCount = 0;
    const result = await this.store.mutate((state) => {
      const subscription = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      if (!subscription) {
        throw new ReminderError(
          "追更条目不存在。",
          "SUBSCRIPTION_NOT_FOUND",
          404,
        );
      }

      if (watched) {
        clearQueuedNotificationsForSubscription(state, subscriptionId);
        subscription.hasUnreadUpdate = false;
        subscription.lastWatchedAt = now.toISOString();
      }

      if (!watched) {
        subscription.hasUnreadUpdate = true;
        restoredReminderCount =
          restoreDiscoveryRemindersForSubscription(
            state,
            subscription,
            now.getTime(),
            { includeEventsBeforeLastWatched: true },
          ).length;
      }

      return {
        id: subscription.id,
        title:
          subscription.displayTitle ||
          subscription.firstSeasonTitle ||
          subscription.title,
        hasUnreadUpdate: subscription.hasUnreadUpdate,
        lastWatchedAt: subscription.lastWatchedAt || null,
      };
    });

    if (!watched && restoredReminderCount > 0) {
      await this.flushDiscoveryReminders();
      await this.flushDueNotifications();
      if (!this.stopped) {
        await this.reschedule();
      }
    }

    return result;
  }

  async markSubscriptionWatched(subscriptionId) {
    return this.setSubscriptionWatchState(subscriptionId, true);
  }

  async markSubscriptionUnwatched(subscriptionId) {
    return this.setSubscriptionWatchState(subscriptionId, false);
  }

  async setSubscriptionReminderState(subscriptionId, mode) {
    const reminderMode = String(mode || "");
    if (!["enabled", "muted", "disabled"].includes(reminderMode)) {
      throw new ReminderError(
        "提醒状态必须为 enabled、muted 或 disabled。",
        "INVALID_REMINDER_STATE",
        400,
      );
    }

    const result = await this.store.mutate((state) => {
      const subscription = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      if (!subscription) {
        throw new ReminderError(
          "追更条目不存在。",
          "SUBSCRIPTION_NOT_FOUND",
          404,
        );
      }

      subscription.reminderEnabled = reminderMode !== "disabled";
      subscription.reminderMutedForCurrentUpdate =
        reminderMode === "muted";
      if (reminderMode === "muted") {
        clearPendingNotificationsForSubscription(
          state,
          subscriptionId,
        );
      }
      if (reminderMode === "enabled") {
        restoreDiscoveryRemindersForSubscription(
          state,
          subscription,
          this.now().getTime(),
        );
      }
      subscription.updatedAt = this.now().toISOString();
      return {
        id: subscription.id,
        title:
          subscription.displayTitle ||
          subscription.firstSeasonTitle ||
          subscription.title,
        reminderEnabled: subscription.reminderEnabled,
        reminderMutedForCurrentUpdate:
          subscription.reminderMutedForCurrentUpdate,
        reminderMode: reminderModeForSubscription(subscription),
        hasUnreadUpdate: subscription.hasUnreadUpdate === true,
      };
    });

    if (reminderMode === "enabled") {
      await this.flushDiscoveryReminders();
      await this.flushDueNotifications();
    }
    if (!this.stopped) {
      await this.reschedule();
    }
    return result;
  }

  async setSubscriptionReminderEnabled(subscriptionId, enabled) {
    return this.setSubscriptionReminderState(
      subscriptionId,
      enabled ? "enabled" : "disabled",
    );
  }

  async updateSubscriptionStatus(subscriptionId, status) {
    const normalizedStatus =
      status === null || status === "auto" ? null : String(status || "");
    if (
      normalizedStatus !== null &&
      !["updating", "completed", "unknown"].includes(normalizedStatus)
    ) {
      throw new ReminderError(
        "系列状态必须是自动判断、更新中、已完结或状态未知。",
        "INVALID_SERIES_STATUS",
        400,
      );
    }

    const timestamp = this.now().toISOString();
    return this.store.mutate((state) => {
      const subscription = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      if (!subscription) {
        throw new ReminderError(
          "追更条目不存在。",
          "SUBSCRIPTION_NOT_FOUND",
          404,
        );
      }

      subscription.seriesStatusOverride = normalizedStatus;
      subscription.seriesStatusOverrideAt = normalizedStatus
        ? timestamp
        : null;
      subscription.updatedAt = timestamp;
      clearAutomaticInactive(subscription);
      if (normalizedStatus === SERIES_STATUS.COMPLETED) {
        clearQueuedNotificationsForSubscription(state, subscriptionId);
      }

      return {
        id: subscription.id,
        title:
          subscription.displayTitle ||
          subscription.firstSeasonTitle ||
          subscription.title,
        seriesStatus:
          normalizedStatus ||
          subscription.seriesStatus ||
          SERIES_STATUS.UNKNOWN,
        seriesStatusReason:
          manualSeriesStatusReason(normalizedStatus) ||
          subscription.seriesStatusReason ||
          null,
        seriesStatusOverride: normalizedStatus,
        seriesStatusOverrideAt:
          subscription.seriesStatusOverrideAt,
      };
    });
  }

  async updateSettings({
    notifications,
    notificationTemplates,
    checkCron,
    intervalMinutes,
    staleCompletionDays,
    episodeNotificationWindowMinutes,
    discoveryReminderDurationMinutes,
    discoveryReminderCron,
    accountSyncCron,
  }) {
    let normalizedCheckCron;
    if (checkCron !== undefined) {
      normalizedCheckCron = normalizeCronExpression(checkCron);
      if (!isValidCronExpression(normalizedCheckCron, this.now())) {
        throw new ReminderError(
          "自动检查计划需要使用有效的 5 段 Cron 表达式。",
          "INVALID_CHECK_CRON",
          400,
        );
      }
    } else if (intervalMinutes !== undefined) {
      normalizedCheckCron = legacyIntervalMinutesToCron(intervalMinutes);
      if (!normalizedCheckCron) {
        throw new ReminderError(
          "旧版检查间隔无法转换为 Cron，请设置有效的 5 段 Cron 表达式。",
          "INVALID_CHECK_CRON",
          400,
        );
      }
    }
    let normalizedStaleCompletionDays;
    if (staleCompletionDays !== undefined) {
      normalizedStaleCompletionDays = Number(staleCompletionDays);
      if (
        !Number.isInteger(normalizedStaleCompletionDays) ||
        normalizedStaleCompletionDays < MIN_STALE_COMPLETION_DAYS ||
        normalizedStaleCompletionDays > MAX_STALE_COMPLETION_DAYS
      ) {
        throw new ReminderError(
          `无更新自动停更期限需要在 ${MIN_STALE_COMPLETION_DAYS} 到 ${MAX_STALE_COMPLETION_DAYS} 天之间。`,
          "INVALID_STALE_COMPLETION_DAYS",
          400,
        );
      }
    }
    let normalizedNotificationWindow;
    if (episodeNotificationWindowMinutes !== undefined) {
      normalizedNotificationWindow = Number(
        episodeNotificationWindowMinutes,
      );
      if (
        !Number.isInteger(normalizedNotificationWindow) ||
        !EPISODE_NOTIFICATION_WINDOW_OPTIONS.includes(
          normalizedNotificationWindow,
        )
      ) {
        throw new ReminderError(
          "更新提醒汇总窗口不在支持范围内。",
          "INVALID_NOTIFICATION_WINDOW",
          400,
        );
      }
    }
    let normalizedDiscoveryDuration;
    if (discoveryReminderDurationMinutes !== undefined) {
      normalizedDiscoveryDuration = Number(
        discoveryReminderDurationMinutes,
      );
      if (
        !Number.isInteger(normalizedDiscoveryDuration) ||
        normalizedDiscoveryDuration < 0 ||
        normalizedDiscoveryDuration >
          MAX_DISCOVERY_REMINDER_DURATION_MINUTES
      ) {
        throw new ReminderError(
          `持续提醒时长需要在 0 到 ${MAX_DISCOVERY_REMINDER_DURATION_MINUTES} 分钟之间。`,
          "INVALID_DISCOVERY_REMINDER_DURATION",
          400,
        );
      }
    }
    let normalizedDiscoveryCron;
    if (discoveryReminderCron !== undefined) {
      normalizedDiscoveryCron =
        normalizeCronExpression(discoveryReminderCron);
      if (!isValidCronExpression(normalizedDiscoveryCron, this.now())) {
        throw new ReminderError(
          "持续提醒频率需要使用有效的 5 段 Cron 表达式。",
          "INVALID_DISCOVERY_REMINDER_CRON",
          400,
        );
      }
    }
    let normalizedNotificationTemplates;
    if (notificationTemplates !== undefined) {
      normalizedNotificationTemplates =
        validateNotificationTemplatesPatch(notificationTemplates);
    }
    let normalizedAccountSyncCron;
    if (accountSyncCron !== undefined) {
      normalizedAccountSyncCron = normalizeCronExpression(accountSyncCron);
      if (!isValidCronExpression(normalizedAccountSyncCron, this.now())) {
        throw new ReminderError(
          "账号同步计划需要使用有效的 5 段 Cron 表达式。",
          "INVALID_ACCOUNT_SYNC_CRON",
          400,
        );
      }
    }

    const settings = await this.store.mutate((state) => {
      const previousCheckCron = state.settings.checkCron;
      const previousWindow =
        state.settings.episodeNotificationWindowMinutes;
      const previousDiscoveryDuration =
        state.settings.discoveryReminderDurationMinutes;
      const previousDiscoveryCron =
        state.settings.discoveryReminderCron;
      if (notifications !== undefined) {
        state.settings.notifications = applyNotificationSettingsPatch(
          state.settings.notifications,
          notifications,
        );
      }
      if (normalizedNotificationTemplates !== undefined) {
        state.settings.notificationTemplates =
          applyNotificationTemplatesPatch(
            state.settings.notificationTemplates,
            normalizedNotificationTemplates,
          );
      }
      if (normalizedCheckCron !== undefined) {
        state.settings.checkCron = normalizedCheckCron;
        if (normalizedCheckCron !== previousCheckCron) {
          state.settings.nextCheckAt = nextCronOccurrence(
            normalizedCheckCron,
            this.now(),
          ).toISOString();
        }
      }
      if (normalizedStaleCompletionDays !== undefined) {
        state.settings.staleCompletionDays =
          normalizedStaleCompletionDays;
      }
      if (normalizedNotificationWindow !== undefined) {
        state.settings.episodeNotificationWindowMinutes =
          normalizedNotificationWindow;
        if (normalizedNotificationWindow !== previousWindow) {
          const nowMs = this.now().getTime();
          for (const pending of state.pendingNotifications) {
            const firstObservedMs =
              Date.parse(pending.firstObservedAt || "") || nowMs;
            const dueAtMs =
              normalizedNotificationWindow === 0
                ? nowMs
                : firstObservedMs +
                  normalizedNotificationWindow * 60_000;
            pending.dueAt = new Date(dueAtMs).toISOString();
            pending.lastError = null;
            for (const event of state.events) {
              if (pending.eventIds.includes(event.id)) {
                event.notificationDueAt = pending.dueAt;
                event.notificationError = null;
              }
            }
          }
        }
      }
      if (normalizedDiscoveryDuration !== undefined) {
        state.settings.discoveryReminderDurationMinutes =
          normalizedDiscoveryDuration;
      }
      if (normalizedDiscoveryCron !== undefined) {
        state.settings.discoveryReminderCron = normalizedDiscoveryCron;
      }
      if (normalizedAccountSyncCron !== undefined) {
        state.settings.accountSyncCron = normalizedAccountSyncCron;
      }

      const discoverySettingsChanged =
        normalizedDiscoveryDuration !== undefined &&
        normalizedDiscoveryDuration !== previousDiscoveryDuration ||
        normalizedDiscoveryCron !== undefined &&
        normalizedDiscoveryCron !== previousDiscoveryCron;
      if (discoverySettingsChanged) {
        const nowMs = this.now().getTime();
        const durationMinutes =
          state.settings.discoveryReminderDurationMinutes;
        const cron = state.settings.discoveryReminderCron;
        state.discoveryReminders = state.discoveryReminders
          .map((reminder) => {
            if (!durationMinutes) {
              return null;
            }
            const firstDiscoveredMs = Date.parse(
              reminder.firstDiscoveredAt || "",
            );
            if (!Number.isFinite(firstDiscoveredMs)) {
              return null;
            }
            const expiresAtMs =
              firstDiscoveredMs + durationMinutes * 60_000;
            if (expiresAtMs <= nowMs) {
              return null;
            }
            reminder.expiresAt = new Date(expiresAtMs).toISOString();
            reminder.nextReminderAt = nextDiscoveryReminderTime(
              cron,
              nowMs,
              expiresAtMs,
            );
            reminder.lastError = null;
            return reminder;
          })
          .filter(Boolean);
      } else {
        const nowMs = this.now().getTime();
        state.discoveryReminders = state.discoveryReminders.filter(
          (reminder) =>
            (Date.parse(reminder.expiresAt || "") || 0) > nowMs,
        );
      }
      return {
        checkCron: state.settings.checkCron,
        staleCompletionDays:
          state.settings.staleCompletionDays ||
          DEFAULT_STALE_COMPLETION_DAYS,
        nextCheckAt: state.settings.nextCheckAt,
        episodeNotificationWindowMinutes:
          state.settings.episodeNotificationWindowMinutes ||
          DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
        discoveryReminderDurationMinutes:
          state.settings.discoveryReminderDurationMinutes,
        discoveryReminderCron: state.settings.discoveryReminderCron,
        accountSyncCron: state.settings.accountSyncCron,
        notifications: describeNotificationSettings(
          state.settings.notifications,
        ),
        notificationTemplates: state.settings.notificationTemplates,
        pendingNotificationCount: state.pendingNotifications.length,
        pendingDiscoveryReminderCount:
          state.discoveryReminders.length,
      };
    });

    if (
      (normalizedCheckCron !== undefined ||
        normalizedStaleCompletionDays !== undefined ||
        normalizedNotificationWindow !== undefined ||
        notifications !== undefined ||
        normalizedDiscoveryDuration !== undefined ||
        normalizedDiscoveryCron !== undefined ||
        normalizedAccountSyncCron !== undefined) &&
      !this.stopped
    ) {
      await this.reschedule();
      void this.flushDiscoveryReminders()
        .then(() => this.flushDueNotifications())
        .catch(() => {});
    }
    return settings;
  }

  async sendTestNotification() {
    const state = await this.store.read();
    const result = await this.sendNotifications(state.settings.notifications, {
      title: `${APP_NAME}连接成功`,
      body: "后续发现新集、新季或完结时，会发送提醒。",
      group: APP_NAME,
    });
    return {
      ...result,
      message: summarizeNotificationDelivery(result),
    };
  }

  async getDashboard() {
    const state = await this.store.read();
    const nowMs = this.now().getTime();
    const subscriptions = state.subscriptions.map((subscription) => {
      const seasons = [...subscription.seasons].sort(
        (left, right) => seasonSortValue(right) - seasonSortValue(left),
      );
      const latestSeason = seasons[0];
      const firstSeason = subscription.seasons.find(
        (season) => season.seriesId === subscription.firstSeasonId,
      );
      const currentEpisodeCount = seasons.reduce(
        (sum, season) => sum + (season.highWaterEpisodeCount || 0),
        0,
      );
      const latestContentActivity = latestContentActivityMs(subscription);
      const hasUnreadUpdate = subscription.hasUnreadUpdate === true;
      const reminderMode = reminderModeForSubscription(subscription);
      const reminderEnabled = reminderMode !== "disabled";
      const activeReminderExpiryMs =
        reminderMode === "enabled" && hasUnreadUpdate
          ? state.discoveryReminders
              .filter(
                (reminder) =>
                  reminder.subscriptionId === subscription.id,
              )
              .map((reminder) => Date.parse(reminder.expiresAt || ""))
              .filter((expiresAtMs) => Number.isFinite(expiresAtMs))
              .filter((expiresAtMs) => expiresAtMs > nowMs)
              .reduce(
                (latest, expiresAtMs) => Math.max(latest, expiresAtMs),
                0,
              )
          : 0;
      const searchIndex = buildSubscriptionSearchIndex([
        subscription.displayTitle,
        subscription.firstSeasonTitle,
        subscription.title,
        ...subscription.seasons.map((season) => season.title),
      ]);
      return {
        id: subscription.id,
        title: subscription.displayTitle || subscription.title,
        displayTitle:
          subscription.displayTitle ||
          subscription.firstSeasonTitle ||
          subscription.title,
        firstSeasonId: subscription.firstSeasonId,
        firstSeasonTitle:
          subscription.firstSeasonTitle ||
          subscription.displayTitle ||
          subscription.title,
        coverUrl: firstSeason?.coverUrl || subscription.coverUrl,
        seriesGroupId: subscription.seriesGroupId,
        seriesStatus: subscription.seriesStatus,
        seriesStatusReason: subscription.seriesStatusReason,
        seriesStatusOverride: subscription.seriesStatusOverride,
        seriesStatusOverrideAt: subscription.seriesStatusOverrideAt,
        completedAt: subscription.completedAt,
        autoInactiveAt: subscription.autoInactiveAt,
        autoInactiveReason: subscription.autoInactiveReason,
        inactiveStatusCheckedAt: subscription.inactiveStatusCheckedAt,
        latestContentActivityAt: Number.isFinite(latestContentActivity)
          ? new Date(latestContentActivity).toISOString()
          : null,
        seriesCompletionAnnounced:
          subscription.seriesCompletionAnnounced,
        hasUnreadUpdate,
        reminderEnabled,
        reminderMutedForCurrentUpdate: reminderMode === "muted",
        reminderMode,
        trackingPaused: subscription.trackingPaused === true,
        reminderActive: activeReminderExpiryMs > nowMs,
        reminderExpiresAt:
          activeReminderExpiryMs > nowMs
            ? new Date(activeReminderExpiryMs).toISOString()
            : null,
        lastWatchedAt: subscription.lastWatchedAt,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        lastCheckedAt: subscription.lastCheckedAt,
        lastError: subscription.lastError,
        seasonCount: seasons.length,
        highWaterEpisodeCount: currentEpisodeCount,
        latestSeasonId: latestSeason?.seriesId || null,
        ...searchIndex,
        seasons: seasons.map((season) => ({
          seriesId: season.seriesId,
          title: season.title,
          coverUrl: season.coverUrl,
          status: season.status,
          episodeCount: season.episodeCount,
          highWaterEpisodeCount: season.highWaterEpisodeCount,
          totalEpisodeCount: season.totalEpisodeCount,
          accessibleEpisodeCount: season.accessibleEpisodeCount,
          firstVisibleTime: season.firstVisibleTime,
          lastEpisodeChangedAt: season.lastEpisodeChangedAt,
          addedAt: season.addedAt,
          updatedAt: season.updatedAt,
          lastCheckedAt: season.lastCheckedAt,
          lastError: season.lastError,
          source: season.source,
          detailUrl: season.detailUrl,
          isLatest: season.seriesId === latestSeason?.seriesId,
        })),
      };
    });

    return {
      app: {
        name: APP_NAME,
        checking: this.checking,
        nextCheckAt:
          this.nextCheckAt || state.settings.nextCheckAt || null,
      },
      settings: {
        notifications: describeNotificationSettings(
          state.settings.notifications,
        ),
        notificationTemplates: state.settings.notificationTemplates,
        checkCron: state.settings.checkCron || DEFAULT_CHECK_CRON,
        staleCompletionDays:
          state.settings.staleCompletionDays ||
          DEFAULT_STALE_COMPLETION_DAYS,
        nextCheckAt: state.settings.nextCheckAt,
        episodeNotificationWindowMinutes:
          state.settings.episodeNotificationWindowMinutes ||
          DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
        pendingNotificationCount: state.pendingNotifications.length,
        discoveryReminderDurationMinutes:
          state.settings.discoveryReminderDurationMinutes,
        discoveryReminderCron: state.settings.discoveryReminderCron,
        accountSyncCron: state.settings.accountSyncCron,
        accountSync: state.settings.accountSync,
        pendingDiscoveryReminderCount:
          state.discoveryReminders.filter((reminder) => {
            const expiresAtMs = Date.parse(reminder.expiresAt || "");
            const nextReminderMs = Date.parse(
              reminder.nextReminderAt || "",
            );
            return (
              remindersEnabledForSubscription(
                state,
                reminder.subscriptionId,
              ) &&
              Number.isFinite(expiresAtMs) &&
              expiresAtMs > nowMs &&
              Number.isFinite(nextReminderMs)
            );
          }).length,
        lastCheckAt: state.settings.lastCheckAt,
        lastCheckResult: state.settings.lastCheckResult,
      },
      subscriptions,
      events: state.events.slice(0, MAX_EVENTS),
    };
  }

  async checkSubscription(subscriptionId, options = {}) {
    return this.enqueue(async () => {
      this.checking = true;
      try {
        const snapshot = await this.store.read();
        if (
          !snapshot.subscriptions.some((item) => item.id === subscriptionId)
        ) {
          throw new ReminderError(
            "追更条目不存在。",
            "SUBSCRIPTION_NOT_FOUND",
            404,
          );
        }
        const notificationEvents = [];
        const result = await this.checkOne(subscriptionId, {
          ...options,
          forceCompletedCheck: options.forceCompletedCheck ?? true,
          notificationMode: "manual",
          eventSink: notificationEvents,
        });
        if (options.notify ?? true) {
          await this.deliverCheckSummary(notificationEvents, {
            mode: "detailed",
            subscriptionId,
          });
          await this.flushDueNotificationsLocked();
        }
        await this.recordCheckRun(result);
        await this.logCheckResult(result, {
          scope: "single",
          trigger: options.trigger || "manual",
          subscriptionId,
        });
        return result;
      } finally {
        this.checking = false;
      }
    });
  }

  async checkSubscriptions(subscriptionIds, options = {}) {
    return this.enqueue(async () => {
      this.checking = true;
      try {
        const uniqueIds = [
          ...new Set(
            (Array.isArray(subscriptionIds) ? subscriptionIds : [])
              .map((item) => String(item || ""))
              .filter(Boolean),
          ),
        ];
        const snapshot = await this.store.read();
        const selectedSubscriptions = snapshot.subscriptions.filter(
          (subscription) => uniqueIds.includes(subscription.id),
        );
        const alignDiscovery = batchNeedsDiscoveryAlignment(
          selectedSubscriptions,
          this.discoveryIntervalMs,
          this.now().getTime(),
          options,
        );
        const entries = await mapWithConcurrency(
          uniqueIds,
          NETWORK_CONCURRENCY,
          async (subscriptionId) => {
            try {
              const subscription = selectedSubscriptions.find(
                (item) => item.id === subscriptionId,
              );
              if (subscription?.trackingPaused === true) {
                return {
                  subscriptionId,
                  result: {
                    subscriptionId,
                    skipped: "paused",
                    seasonsChecked: 0,
                    updatedSeasons: 0,
                    discoveredSeasons: 0,
                    errors: 0,
                    discoveryError: null,
                  },
                  notificationEvents: [],
                  error: null,
                };
              }
              const notificationEvents = [];
              const result = await this.checkOne(subscriptionId, {
                ...options,
                forceAlbumDiscovery: alignDiscovery,
                notificationMode: "aggregated",
                skipCompleted: options.skipCompleted ?? true,
                eventSink: notificationEvents,
                trigger: options.trigger || "manual",
              });
              return {
                subscriptionId,
                result,
                notificationEvents,
                error: null,
              };
            } catch (error) {
              return {
                subscriptionId,
                result: null,
                notificationEvents: [],
                error,
              };
            }
          },
        );
        const notificationEvents = entries.flatMap(
          (entry) => entry.notificationEvents,
        );
        if (options.notify ?? true) {
          await this.deliverCheckSummary(notificationEvents, {
            mode: "summary",
          });
          await this.flushDueNotificationsLocked();
        }
        const aggregate = {
          subscriptions: entries.length,
          checkedSubscriptions: entries.filter(
            (entry) =>
              entry.result &&
              !entry.result.skipped &&
              entry.result.errors === 0,
          ).length,
          skippedCompleted: entries.filter(
            (entry) => entry.result?.skipped === "completed",
          ).length,
          skippedInactive: entries.filter(
            (entry) => entry.result?.skipped === "inactive",
          ).length,
          skippedPaused: entries.filter(
            (entry) => entry.result?.skipped === "paused",
          ).length,
          failedSubscriptions: entries.filter(
            (entry) =>
              entry.error ||
              entry.result?.errors > 0 ||
              entry.result?.discoveryError,
          ).length,
          discoveryFailures: entries.filter(
            (entry) => entry.result?.discoveryError,
          ).length,
          seasonsChecked: entries.reduce(
            (sum, entry) => sum + (entry.result?.seasonsChecked || 0),
            0,
          ),
          errors: entries.reduce(
            (sum, entry) =>
              sum + (entry.error ? 1 : entry.result?.errors || 0),
            0,
          ),
          updatedSeasons: entries.reduce(
            (sum, entry) => sum + (entry.result?.updatedSeasons || 0),
            0,
          ),
          discoveredSeasons: entries.reduce(
            (sum, entry) => sum + (entry.result?.discoveredSeasons || 0),
            0,
          ),
          results: entries.map(({ notificationEvents: _, ...entry }) => entry),
        };
        await this.recordCheckRun(aggregate);
        await this.logCheckResult(aggregate, {
          scope: "batch",
          trigger: options.trigger || "manual",
        });
        return aggregate;
      } finally {
        this.checking = false;
      }
    });
  }

  async checkAll(options = {}) {
    return this.enqueue(async () => {
      this.checking = true;
      try {
        const snapshot = await this.store.read();
        const alignDiscovery = batchNeedsDiscoveryAlignment(
          snapshot.subscriptions,
          this.discoveryIntervalMs,
          this.now().getTime(),
          options,
        );
        const results = [];
        const notificationEvents = [];
        for (const subscription of snapshot.subscriptions) {
          if (subscription.trackingPaused === true) {
            results.push({
              subscriptionId: subscription.id,
              skipped: "paused",
              seasonsChecked: 0,
              updatedSeasons: 0,
              discoveredSeasons: 0,
              errors: 0,
              discoveryError: null,
            });
            continue;
          }
          results.push(
            await this.checkOne(subscription.id, {
              notify: options.notify ?? true,
              discover: options.discover ?? true,
              forceDiscovery: options.forceDiscovery ?? false,
              forceAlbumDiscovery: alignDiscovery,
              skipCompleted: options.skipCompleted ?? true,
              notificationMode: "aggregated",
              eventSink: notificationEvents,
              markUnread: options.markUnread ?? true,
              trigger: options.trigger || "manual",
            }),
          );
        }
        if (options.notify ?? true) {
          await this.deliverCheckSummary(notificationEvents, {
            mode: "summary",
          });
          await this.flushDueNotificationsLocked();
        }
        const aggregate = {
          subscriptions: results.length,
          checkedSubscriptions: results.filter(
            (result) => !result.skipped,
          ).length,
          skippedCompleted: results.filter(
            (result) => result.skipped === "completed",
          ).length,
          skippedInactive: results.filter(
            (result) => result.skipped === "inactive",
          ).length,
          skippedPaused: results.filter(
            (result) => result.skipped === "paused",
          ).length,
          failedSubscriptions: results.filter(
            (result) => result.errors > 0 || result.discoveryError,
          ).length,
          discoveryFailures: results.filter(
            (result) => result.discoveryError,
          ).length,
          seasonsChecked: results.reduce(
            (sum, result) => sum + result.seasonsChecked,
            0,
          ),
          errors: results.reduce((sum, result) => sum + result.errors, 0),
          updatedSeasons: results.reduce(
            (sum, result) => sum + result.updatedSeasons,
            0,
          ),
          discoveredSeasons: results.reduce(
            (sum, result) => sum + result.discoveredSeasons,
            0,
          ),
        };
        await this.recordCheckRun(aggregate);
        await this.logCheckResult(aggregate, {
          scope: "all",
          trigger: options.trigger || "manual",
        });
        return aggregate;
      } finally {
        this.checking = false;
      }
    });
  }

  async recordCheckRun(result) {
    const completedAt = this.now();
    const completedAtIso = completedAt.toISOString();
    await this.store.mutate((state) => {
      const checkCron =
        state.settings.checkCron || DEFAULT_CHECK_CRON;
      const scheduledMs = resolveScheduledCheckMs(
        state.settings,
        completedAt.getTime(),
      );
      state.settings.lastCheckAt = completedAtIso;
      state.settings.nextCheckAt = new Date(
        nextCheckAtAfterRun(
          scheduledMs,
          checkCron,
          completedAt.getTime(),
        ),
      ).toISOString();
      const failureCount =
        (result.errors || 0) + (result.discoveryFailures || 0);
      state.settings.lastCheckResult =
        failureCount === 0
          ? "success"
          : result.seasonsChecked > failureCount
            ? "partial"
            : "error";
    });
  }

  async checkOne(
    subscriptionId,
    {
      notify = true,
      discover = true,
      forceDiscovery = false,
      forceAlbumDiscovery = false,
      forceCompletedCheck = false,
      skipCompleted = true,
      notificationMode = "aggregated",
      eventSink = null,
      markUnread = true,
      trigger = "manual",
    } = {},
  ) {
    const snapshot = await this.store.read();
    const subscription = snapshot.subscriptions.find(
      (item) => item.id === subscriptionId,
    );
    if (!subscription) {
      throw new ReminderError("追更条目不存在。", "SUBSCRIPTION_NOT_FOUND", 404);
    }
    const wasCompleted = isKnownCompletedSeries(subscription);
    const wasInactive = isKnownInactiveSeries(subscription);
    if (skipCompleted && wasCompleted && !forceCompletedCheck) {
      return {
        subscriptionId,
        skipped: "completed",
        seasonsChecked: 0,
        updatedSeasons: 0,
        discoveredSeasons: 0,
        errors: 0,
        discoveryError: null,
      };
    }

    const checkedAt = this.now();
    const staleDays =
      snapshot.settings.staleCompletionDays ||
      DEFAULT_STALE_COMPLETION_DAYS;
    if (
      wasInactive &&
      trigger === "cron" &&
      inactiveCheckedToday(subscription, checkedAt)
    ) {
      return {
        subscriptionId,
        skipped: "inactive",
        inactiveRechecked: false,
        seasonsChecked: 0,
        updatedSeasons: 0,
        discoveredSeasons: 0,
        errors: 0,
        discoveryError: null,
      };
    }
    const automaticInactiveEligible =
      !wasInactive &&
      !wasCompleted &&
      Boolean(
        shouldAutomaticallyInactivate(
          subscription,
          staleDays,
          checkedAt.getTime(),
        ),
      );

    const timestamp = checkedAt.toISOString();
    const nowMs = checkedAt.getTime();
    const seasons = [...subscription.seasons];
    const shouldDiscover =
      discover &&
      (forceDiscovery ||
        forceAlbumDiscovery ||
        wasInactive ||
        isDiscoveryDue(
          subscription,
          this.discoveryIntervalMs,
          nowMs,
        ));
    const albumDiscoveryPromise = shouldDiscover
      ? this.fetchAlbumSeries(subscription.primarySeriesId).then(
          (album) => ({ album, error: null }),
          (error) => ({ album: null, error }),
        )
      : Promise.resolve({ album: null, error: null });
    const [seasonResults, albumDiscovery] = await Promise.all([
      mapWithConcurrency(
        seasons,
        NETWORK_CONCURRENCY,
        async (season) => {
          try {
            const result = await this.fetchDetail(season.seriesId);
            return { season, ...result, ok: true };
          } catch (error) {
            return { season, ok: false, error };
          }
        },
      ),
      albumDiscoveryPromise,
    ]);
    const albumDiscoveryError = albumDiscovery.error || null;
    const albumMetadata = normalizeAlbumMetadata(
      albumDiscoveryError ? null : albumDiscovery.album,
    );
    const albumSeriesIds = albumMetadata.publishedSeriesIds;

    const candidateMap = new Map();
    // Official album entries are authoritative and must not be crowded out by
    // the recommendation list, which regularly contains dozens of unrelated IDs.
    for (const seriesId of albumSeriesIds) {
      const normalizedSeriesId = String(seriesId || "");
      if (
        /^\d{8,25}$/.test(normalizedSeriesId) &&
        !seasons.some((season) => season.seriesId === normalizedSeriesId)
      ) {
        candidateMap.set(normalizedSeriesId, {
          seriesId: normalizedSeriesId,
          title: "",
          coverUrl: "",
          episodeCount: 0,
          source: "album",
        });
      }
    }
    for (const result of seasonResults) {
      if (!result.ok) {
        continue;
      }
      for (const recommendation of result.recommendations || []) {
        if (
          !seasons.some(
            (season) => season.seriesId === recommendation.seriesId,
          ) &&
          !candidateMap.has(recommendation.seriesId)
        ) {
          candidateMap.set(recommendation.seriesId, {
            ...recommendation,
            source: "recommendation",
          });
        }
      }
    }

    const candidateChecks = [];
    if (shouldDiscover) {
      const candidates = [...candidateMap.values()]
        .filter((candidate) => {
          const cached =
            subscription.discovery?.candidates?.[candidate.seriesId];
          return (
            forceDiscovery ||
            !cached ||
            cached.lastError ||
            !isRecent(
              cached.checkedAt,
              this.candidateRecheckMs,
              nowMs,
            )
          );
        })
        .slice(0, Math.max(0, MAX_SEASONS_PER_SERIES - seasons.length));
      const candidateResults = await mapWithConcurrency(
        candidates,
        NETWORK_CONCURRENCY,
        async (candidate) => {
          try {
            const result = await this.fetchDetail(candidate.seriesId);
            return {
              candidate,
              ok: true,
              matchesGroup:
                Boolean(result.detail.seriesGroupId) &&
                result.detail.seriesGroupId === subscription.seriesGroupId,
              detail: result.detail,
            };
          } catch (error) {
            return { candidate, ok: false, error };
          }
        },
      );
      candidateChecks.push(...candidateResults);
    }

    const generatedEvents = [];
    let updatedSeasons = 0;
    let discoveredSeasons = 0;
    let discoveredNewerSeason = false;
    let errors = 0;
    let resultSubscriptionId = subscriptionId;
    let observedDiscoveryIssue = null;
    let enteredAutomaticInactive = false;

    await this.store.mutate((state) => {
      const current = state.subscriptions.find(
        (item) => item.id === subscriptionId,
      );
      if (!current) {
        resultSubscriptionId = null;
        return;
      }

      for (const result of seasonResults) {
        const season = current.seasons.find(
          (item) => item.seriesId === result.season.seriesId,
        );
        if (!season) {
          continue;
        }
        season.lastCheckedAt = timestamp;
        season.updatedAt = timestamp;

        if (!result.ok) {
          errors += 1;
          const message =
            normalizeWhitespace(result.error?.message) || "检查剧集失败。";
          const wasDifferent = season.lastError !== message;
          season.lastError = message;
          if (wasDifferent) {
            appendEvent(state, {
              id: createId("evt_"),
              type: EVENT_TYPE.ERROR,
              subscriptionId: current.id,
              seasonId: season.seriesId,
              seasonTitle: season.title,
              message: `《${season.title}》检查失败：${message}`,
              episodeCount: season.highWaterEpisodeCount,
              previousEpisodeCount: null,
              createdAt: timestamp,
              notified: false,
            });
          }
          continue;
        }

        const detail = result.detail;
        const previousHighWater = season.highWaterEpisodeCount;
        season.lastError = null;
        season.title = detail.title;
        season.coverUrl = detail.coverUrl || season.coverUrl;
        season.seriesGroupId =
          detail.seriesGroupId || season.seriesGroupId || null;
        season.intro = detail.intro || season.intro;
        season.tags = detail.tags.length ? detail.tags : season.tags;
        season.firstVisibleTime =
          detail.firstVisibleTime || season.firstVisibleTime;
        season.status = detail.status;
        season.episodeCount = detail.episodeCount;
        season.totalEpisodeCount = detail.totalEpisodeCount;
        season.accessibleEpisodeCount = detail.accessibleEpisodeCount;
        season.rightText = detail.rightText;
        season.lastObservedEpisodeCount = detail.episodeCount;
        season.highWaterEpisodeCount = Math.max(
          previousHighWater,
          detail.episodeCount,
        );

        if (detail.episodeCount > previousHighWater) {
          resumeMutedReminderForNewUpdate(current);
          clearAutomaticInactive(current);
          updatedSeasons += 1;
          season.lastEpisodeChangedAt = timestamp;
          const event = appendEvent(state, {
            id: createId("evt_"),
            type: EVENT_TYPE.EPISODE,
            subscriptionId: current.id,
            seasonId: season.seriesId,
            seasonTitle: season.title,
            message: `《${season.title}》更新到第 ${detail.episodeCount} 集，新增 ${
              detail.episodeCount - previousHighWater
            } 集。`,
            episodeCount: detail.episodeCount,
            previousEpisodeCount: previousHighWater,
            createdAt: timestamp,
            notified: false,
          });
          if (event) {
            if (markUnread) {
              current.hasUnreadUpdate = true;
            }
            if (notify && notificationMode !== "manual") {
              queueEpisodeNotification(
                state,
                event,
                state.settings.episodeNotificationWindowMinutes,
                nowMs,
              );
            }
            if (notify) {
              queueDiscoveryReminder(state, event, nowMs);
            }
            generatedEvents.push(event);
          }
        }

      }

      for (const result of candidateChecks) {
        current.discovery.candidates[result.candidate.seriesId] = {
          checkedAt: timestamp,
          matchesGroup: Boolean(result.ok && result.matchesGroup),
          lastError: result.ok
            ? null
            : normalizeWhitespace(result.error?.message) ||
              "候选季检查失败。",
        };
        if (
          !result.ok ||
          !result.matchesGroup ||
          current.seasons.some(
            (season) => season.seriesId === result.detail.seriesId,
          ) ||
          current.seasons.length >= MAX_SEASONS_PER_SERIES
        ) {
          continue;
        }

        const newSeason = createSeason(
          result.detail,
          result.candidate.source === "album" ? "album" : "recommendation",
          timestamp,
        );
        clearAutomaticInactive(current);
        const seasonsBefore = [...current.seasons];
        current.seasons.push(newSeason);
        if (hasNewerSeason(seasonsBefore, current.seasons)) {
          discoveredNewerSeason = true;
        }
        discoveredSeasons += 1;
        resumeMutedReminderForNewUpdate(current);
        const event = appendEvent(state, {
          id: createId("evt_"),
          type: EVENT_TYPE.SEASON,
          subscriptionId: current.id,
          seasonId: newSeason.seriesId,
          seasonTitle: newSeason.title,
          message: `发现同系列新季《${newSeason.title}》，当前 ${newSeason.episodeCount} 集。`,
          episodeCount: newSeason.episodeCount,
          previousEpisodeCount: null,
          createdAt: timestamp,
          notified: false,
        });
        if (event) {
          if (markUnread) {
            current.hasUnreadUpdate = true;
          }
          if (notify) {
            queueDiscoveryReminder(state, event, nowMs);
          }
          generatedEvents.push(event);
        }
      }

      if (discoveredNewerSeason) {
        current.seriesCompletionAnnounced = false;
        current.completedAt = null;
        current.seriesCompletionVerifiedAt = null;
      }

      const completionInvalidated =
        wasCompleted &&
        forceCompletedCheck &&
        (updatedSeasons > 0 || discoveredNewerSeason);
      if (completionInvalidated) {
        clearSeriesCompletionState(current);
      }

      let discoveryIssue = null;
      if (albumDiscoveryError) {
        discoveryIssue =
          normalizeWhitespace(albumDiscoveryError.message) ||
          "多季列表检查失败。";
        current.discovery.lastDiscoveryIssue = discoveryIssue;
      } else if (shouldDiscover) {
        const metadataIssue = albumMetadataIssue(albumMetadata);
        const verificationComplete = seriesVerificationComplete(
          current.seasons,
          albumSeriesIds,
        );
        const currentSeasonIds = new Set(
          current.seasons.map((season) => season.seriesId),
        );
        const albumSeriesIdSet = new Set(albumSeriesIds);
        const missingPublishedSeasonCount = albumSeriesIds.filter(
          (seriesId) => !currentSeasonIds.has(seriesId),
        ).length;
        const extraLocalSeasonCount = current.seasons.filter(
          (season) => !albumSeriesIdSet.has(season.seriesId),
        ).length;
        const verificationIssue =
          missingPublishedSeasonCount > 0
            ? `官方多季列表中的季度未能全部确认，还有 ${missingPublishedSeasonCount} 个已发布季度待确认，后续检查会自动重试。`
            : extraLocalSeasonCount > 0
              ? `官方多季列表中的季度未能全部确认，本地有 ${extraLocalSeasonCount} 个已确认季度不在当前官方多季列表中，后续检查会自动重试。`
              : "官方多季列表中的季度未能全部确认，后续检查会自动重试。";
        discoveryIssue =
          metadataIssue ||
          (verificationComplete
            ? null
            : verificationIssue);
        current.discovery.lastRunAt = timestamp;
        current.discovery.lastDiscoveryIssue = discoveryIssue;
        current.discovery.confirmedSeriesIds = verificationComplete
          ? albumSeriesIds
          : [];
        current.discovery.lastCompletedAt =
          verificationComplete && !metadataIssue ? timestamp : null;
        current.discovery.unpublishedSeriesIds =
          albumMetadata.unpublishedSeriesIds;
        current.discovery.unpublishedSeasonCount =
          albumMetadata.unpublishedSeasonCount;
        current.discovery.albumSeasonCount =
          albumMetadata.declaredSeasonCount;
        current.discovery.albumItemCount = albumMetadata.itemCount;
      } else {
        discoveryIssue = current.discovery.lastDiscoveryIssue || null;
      }
      observedDiscoveryIssue = discoveryIssue;
      const identity = applySubscriptionIdentity(current);
      let status = deriveSeriesStatus(current.seasons, {
        confirmedSeriesIds: current.discovery.confirmedSeriesIds,
        discoveryError: discoveryIssue,
        seasonErrors: errors,
        unpublishedSeasonCount:
          current.discovery.unpublishedSeasonCount,
      });
      if (
        completionInvalidated &&
        status.status === SERIES_STATUS.COMPLETED
      ) {
        status = {
          status: SERIES_STATUS.UPDATING,
          reason:
            "强制检查发现新集或新季，系列已恢复为未完结，将继续自动检查。",
        };
      }
      current.seriesStatus = status.status;
      current.seriesStatusReason = status.reason;
      const hasContentChange =
        updatedSeasons > 0 || discoveredNewerSeason;
      if (status.status === SERIES_STATUS.COMPLETED) {
        clearAutomaticInactive(current);
        current.seriesCompletionVerifiedAt ||= timestamp;
        current.completedAt ||= timestamp;
        if (!current.seriesCompletionAnnounced) {
          resumeMutedReminderForNewUpdate(current);
          const seasonEpisodeCount = current.seasons.reduce(
            (sum, season) => sum + (season.highWaterEpisodeCount || 0),
            0,
          );
          const event = appendEvent(state, {
            id: createId("evt_"),
            type: EVENT_TYPE.COMPLETED,
            subscriptionId: current.id,
            seasonId: null,
            seasonTitle: identity.displayTitle,
            message: `《${identity.displayTitle}》最高季明确标注“完结篇”，整个系列已完结，共 ${current.seasons.length} 季，合计 ${seasonEpisodeCount} 集。`,
            episodeCount: seasonEpisodeCount,
            seasonCount: current.seasons.length,
            previousEpisodeCount: null,
            createdAt: timestamp,
            notified: false,
          });
          current.seriesCompletionAnnounced = true;
          if (event) {
            generatedEvents.push(event);
          }
        }
      } else if (status.status === SERIES_STATUS.UPDATING) {
        if (!wasInactive) {
          clearAutomaticInactive(current);
        }
        current.seriesCompletionAnnounced = false;
        current.completedAt = null;
        current.seriesCompletionVerifiedAt = null;
      } else {
        if (!current.seriesCompletionVerifiedAt) {
          current.completedAt = null;
          current.seriesCompletionAnnounced = false;
        }
      }
      if (status.status !== SERIES_STATUS.COMPLETED) {
        if (wasInactive) {
          if (hasContentChange) {
            clearAutomaticInactive(current);
            current.seriesStatus = SERIES_STATUS.UPDATING;
            current.seriesStatusReason =
              "停更后发现新集或新季，系列已恢复为未完结，将继续自动检查。";
            current.seriesCompletionAnnounced = false;
            current.completedAt = null;
            current.seriesCompletionVerifiedAt = null;
          } else {
            current.seriesStatus = SERIES_STATUS.INACTIVE;
            current.seriesStatusReason =
              normalizeWhitespace(current.autoInactiveReason || "") ||
              "超过设定的无更新期限，系列已停更。系统会每天自动核验一次。";
            current.autoInactiveAt ||= timestamp;
            current.autoInactiveReason = current.seriesStatusReason;
            current.inactiveStatusCheckedAt = timestamp;
          }
        } else if (
          automaticInactiveEligible &&
          !hasContentChange &&
          errors === 0
        ) {
          current.autoInactiveAt = timestamp;
          current.autoInactiveReason =
            `超过 ${staleDays} 天未检测到新季或新集，系列已停更。系统会每天自动核验一次。`;
          current.inactiveStatusCheckedAt = timestamp;
          current.seriesStatus = SERIES_STATUS.INACTIVE;
          current.seriesStatusReason = current.autoInactiveReason;
          current.seriesStatusOverride = null;
          current.seriesStatusOverrideAt = null;
          current.seriesCompletionAnnounced = false;
          current.completedAt = null;
          current.seriesCompletionVerifiedAt = null;
          clearQueuedNotificationsForSubscription(state, subscriptionId);
          enteredAutomaticInactive = true;
        } else if (!wasInactive) {
          clearAutomaticInactive(current);
        }
      }
      current.lastCheckedAt = timestamp;
      current.updatedAt = timestamp;
      current.lastError =
        errors > 0 ? `${errors} 个季度检查失败，可稍后重试。` : null;
    });

    if (resultSubscriptionId && eventSink) {
      eventSink.push(...generatedEvents);
    }

    return {
      subscriptionId: resultSubscriptionId,
      seasonsChecked: seasons.length,
      updatedSeasons,
      discoveredSeasons,
      errors,
      discoveryError: observedDiscoveryIssue,
      autoInactive: enteredAutomaticInactive,
      inactiveRechecked: wasInactive,
      reactivatedFromInactive:
        wasInactive && (updatedSeasons > 0 || discoveredNewerSeason),
      completionRechecked: wasCompleted && forceCompletedCheck,
      reactivatedFromCompleted:
        wasCompleted &&
        forceCompletedCheck &&
        (updatedSeasons > 0 || discoveredNewerSeason),
    };
  }

  async deliverCheckSummary(
    events,
    { mode = "summary", subscriptionId = null } = {},
  ) {
    const state = await this.store.read();
    const immediateEvents = events.filter(
      (event) =>
        !event.notificationDueAt &&
        SUMMARY_EVENT_TYPES.has(event.type) &&
        remindersEnabledForSubscription(state, event.subscriptionId),
    );
    if (!immediateEvents.length) {
      return;
    }
    const notificationSettings = state.settings.notifications;
    if (!enabledNotificationChannels(notificationSettings).length) {
      return;
    }

    const message =
      mode === "detailed"
        ? detailedCheckMessage(state, immediateEvents, subscriptionId)
        : batchCheckMessage(state, immediateEvents);
    if (!message) {
      return;
    }

    let notified = false;
    let notificationError = null;
    let deliveryResult = null;
    try {
      const result = await this.sendNotifications(notificationSettings, {
        ...message,
        group: APP_NAME,
      });
      deliveryResult = result;
      notified = result.delivered > 0;
      if (result.failed > 0) {
        notificationError = summarizeNotificationDelivery(result, {
          subject: mode === "detailed" ? "检查详情" : "汇总通知",
        });
      }
    } catch (error) {
      notificationError =
        normalizeWhitespace(error?.message) || "通知发送失败。";
    }

    const eventIds = new Set(immediateEvents.map((event) => event.id));
    await this.store.mutate((currentState) => {
      for (const storedEvent of currentState.events) {
        if (!eventIds.has(storedEvent.id)) {
          continue;
        }
        storedEvent.notified = notified;
        storedEvent.notificationError = notificationError;
      }
    });
    await this.writeSystemLog({
      category: "notification",
      action: "notification.check-summary.sent",
      level:
        notified && !notificationError
          ? "success"
          : notified
            ? "warning"
            : "error",
      message:
        notified && !notificationError
          ? `已发送${mode === "detailed" ? "单个系列更新详情" : "批量更新汇总"}通知。`
          : `更新通知未完全发送：${
              notificationError || "没有渠道成功送达"
            }`,
      metadata: {
        deliveryId: deliveryResult?.id || null,
        delivered: deliveryResult?.delivered || 0,
        failed: deliveryResult?.failed || 0,
        mode,
      },
    });
  }

  async flushDiscoveryReminders() {
    return this.enqueue(() => this.flushDiscoveryRemindersLocked());
  }

  async flushDiscoveryRemindersLocked() {
    const state = await this.store.read();
    const nowMs = this.now().getTime();
    const activeReminders = state.discoveryReminders.filter((reminder) => {
      const expiresAtMs = Date.parse(reminder.expiresAt || "");
      return (
        remindersEnabledForSubscription(state, reminder.subscriptionId) &&
        Number.isFinite(expiresAtMs) &&
        expiresAtMs > nowMs
      );
    });

    if (!enabledNotificationChannels(state.settings.notifications).length) {
      if (activeReminders.length !== state.discoveryReminders.length) {
        await this.store.mutate((currentState) => {
          currentState.discoveryReminders =
            currentState.discoveryReminders.filter(
              (reminder) =>
                (Date.parse(reminder.expiresAt || "") || 0) > nowMs,
            );
        });
      }
      return {
        sent: 0,
        pending: activeReminders.filter((reminder) =>
          Number.isFinite(Date.parse(reminder.nextReminderAt || "")),
        ).length,
      };
    }

    const dueReminders = activeReminders.filter((reminder) => {
      const nextReminderMs = Date.parse(
        reminder.nextReminderAt || "",
      );
      return Number.isFinite(nextReminderMs) && nextReminderMs <= nowMs;
    });
    if (!dueReminders.length) {
      if (activeReminders.length !== state.discoveryReminders.length) {
        await this.store.mutate((currentState) => {
          currentState.discoveryReminders =
            currentState.discoveryReminders.filter(
              (reminder) =>
                (Date.parse(reminder.expiresAt || "") || 0) > nowMs,
            );
        });
      }
      return {
        sent: 0,
        pending: activeReminders.filter((reminder) =>
          Number.isFinite(Date.parse(reminder.nextReminderAt || "")),
        ).length,
      };
    }

    const message = discoveryReminderCopy(state, dueReminders, nowMs);
    let notified = false;
    let notificationError = null;
    let deliveryResult = null;
    if (message) {
      try {
        const result = await this.sendNotifications(
          state.settings.notifications,
          {
            ...message,
            group: APP_NAME,
          },
        );
        deliveryResult = result;
        notified = result.delivered > 0;
        if (result.failed > 0) {
          notificationError = summarizeNotificationDelivery(result, {
            subject: "持续提醒",
          });
        }
      } catch (error) {
        notificationError =
          normalizeWhitespace(error?.message) || "持续提醒发送失败。";
      }
    } else {
      notificationError = "持续提醒内容已失效。";
    }

    const completedAtMs = this.now().getTime();
    const dueIds = new Set(dueReminders.map((reminder) => reminder.id));
    await this.store.mutate((currentState) => {
      currentState.discoveryReminders =
        currentState.discoveryReminders
          .map((reminder) => {
            const expiresAtMs = Date.parse(reminder.expiresAt || "");
            if (
              !Number.isFinite(expiresAtMs) ||
              expiresAtMs <= completedAtMs
            ) {
              return null;
            }
            if (!dueIds.has(reminder.id)) {
              return reminder;
            }
            if (notified) {
              reminder.lastReminderAt =
                new Date(completedAtMs).toISOString();
              reminder.nextReminderAt = nextDiscoveryReminderTime(
                currentState.settings.discoveryReminderCron,
                completedAtMs,
                expiresAtMs,
              );
              reminder.lastError = null;
              return reminder;
            }

            const retryAtMs = completedAtMs + NOTIFICATION_RETRY_MS;
            if (retryAtMs >= expiresAtMs) {
              return null;
            }
            reminder.nextReminderAt = new Date(retryAtMs).toISOString();
            reminder.lastError =
              notificationError || "持续提醒发送失败，稍后重试。";
            return reminder;
          })
          .filter(Boolean);
    });

    const latestState = await this.store.read();
    await this.writeSystemLog({
      category: "notification",
      action: "notification.discovery-reminder.sent",
      level:
        notified && !notificationError
          ? "success"
          : notified
            ? "warning"
            : "error",
      message:
        notified && !notificationError
          ? `已发送 ${dueReminders.length} 部短剧的持续更新提醒。`
          : `持续更新提醒未完全发送：${
              notificationError || "没有渠道成功送达"
            }`,
      metadata: {
        deliveryId: deliveryResult?.id || null,
        delivered: deliveryResult?.delivered || 0,
        failed: deliveryResult?.failed || 0,
        reminderCount: dueReminders.length,
      },
    });
    return {
      sent: notified ? 1 : 0,
      pending: latestState.discoveryReminders.filter((reminder) => {
        const expiresAtMs = Date.parse(reminder.expiresAt || "");
        return (
          remindersEnabledForSubscription(
            latestState,
            reminder.subscriptionId,
          ) &&
          Number.isFinite(expiresAtMs) &&
          expiresAtMs > completedAtMs &&
          Number.isFinite(Date.parse(reminder.nextReminderAt || ""))
        );
      }).length,
    };
  }

  async flushDueNotifications() {
    return this.enqueue(() => this.flushDueNotificationsLocked());
  }

  async flushDueNotificationsLocked() {
    const state = await this.store.read();
    if (!enabledNotificationChannels(state.settings.notifications).length) {
      return { sent: 0, pending: state.pendingNotifications.length };
    }
    const nowMs = this.now().getTime();
    const dueNotifications = state.pendingNotifications.filter((pending) => {
      const dueAtMs = Date.parse(pending.dueAt || "");
      return (
        remindersEnabledForSubscription(state, pending.subscriptionId) &&
        Number.isFinite(dueAtMs) &&
        dueAtMs <= nowMs
      );
    });
    if (!dueNotifications.length) {
      return { sent: 0, pending: state.pendingNotifications.length };
    }

    const message = pendingNotificationCopy(state, dueNotifications);
    let notified = false;
    let notificationError = null;
    let deliveryResult = null;
    if (message) {
      try {
        const result = await this.sendNotifications(
          state.settings.notifications,
          {
            ...message,
            group: APP_NAME,
          },
        );
        deliveryResult = result;
        notified = result.delivered > 0;
        if (result.failed > 0) {
          notificationError = summarizeNotificationDelivery(result, {
            subject: "汇总通知",
          });
        }
      } catch (error) {
        notificationError =
          normalizeWhitespace(error?.message) || "汇总通知发送失败。";
      }
    }

    const pendingIds = new Set(
      dueNotifications.map((pending) => pending.id),
    );
    const eventIds = new Set(
      dueNotifications.flatMap((pending) => pending.eventIds),
    );
    const retryAt = new Date(
      nowMs + NOTIFICATION_RETRY_MS,
    ).toISOString();
    await this.store.mutate((currentState) => {
      for (const event of currentState.events) {
        if (!eventIds.has(event.id)) {
          continue;
        }
        event.notified = notified;
        event.notificationError = notificationError;
      }
      if (notified) {
        currentState.pendingNotifications =
          currentState.pendingNotifications.filter(
            (pending) => !pendingIds.has(pending.id),
          );
        return;
      }

      for (const pending of currentState.pendingNotifications) {
        if (!pendingIds.has(pending.id)) {
          continue;
        }
        pending.dueAt = retryAt;
        pending.lastError =
          notificationError || "汇总通知发送失败，稍后重试。";
        for (const event of currentState.events) {
          if (pending.eventIds.includes(event.id)) {
            event.notificationDueAt = retryAt;
          }
        }
      }
    });
    await this.writeSystemLog({
      category: "notification",
      action: "notification.update-summary.sent",
      level:
        notified && !notificationError
          ? "success"
          : notified
            ? "warning"
            : "error",
      message:
        notified && !notificationError
          ? `已发送 ${dueNotifications.length} 条待处理更新汇总。`
          : `待处理更新汇总未完全发送：${
              notificationError || "没有渠道成功送达"
            }`,
      metadata: {
        deliveryId: deliveryResult?.id || null,
        delivered: deliveryResult?.delivered || 0,
        failed: deliveryResult?.failed || 0,
        summaryCount: dueNotifications.length,
      },
    });

    return {
      sent: notified ? 1 : 0,
      pending: (await this.store.read()).pendingNotifications.length,
    };
  }

  async start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    await this.store.mutate((state) => {
      const nowMs = this.now().getTime();
      for (const subscription of state.subscriptions) {
        if (reminderModeForSubscription(subscription) === "enabled") {
          restoreDiscoveryRemindersForSubscription(
            state,
            subscription,
            nowMs,
          );
        }
      }
    });
    await this.flushDiscoveryReminders();
    await this.flushDueNotifications();
    await this.scheduleNext();
  }

  stop() {
    this.stopped = true;
    this.nextCheckAt = null;
    if (this.schedulerTimer) {
      this.timers.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async reschedule() {
    if (this.schedulerTimer) {
      this.timers.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    await this.scheduleNext();
  }

  async scheduleNext() {
    if (this.stopped) {
      return;
    }
    const state = await this.store.read();
    const nowMs = this.now().getTime();
    const checkTarget = resolveScheduledCheckMs(state.settings, nowMs);
    if (state.settings.nextCheckAt !== new Date(checkTarget).toISOString()) {
      await this.store.mutate((currentState) => {
        currentState.settings.nextCheckAt =
          new Date(checkTarget).toISOString();
      });
    }
    const pendingDueTargets =
      enabledNotificationChannels(state.settings.notifications).length > 0
        ? state.pendingNotifications
            .filter((pending) =>
              remindersEnabledForSubscription(
                state,
                pending.subscriptionId,
              ),
            )
            .map((pending) => Date.parse(pending.dueAt || ""))
            .filter(Number.isFinite)
        : [];
    const discoveryReminderTargets =
      enabledNotificationChannels(state.settings.notifications).length > 0
        ? state.discoveryReminders
            .filter((reminder) =>
              remindersEnabledForSubscription(
                state,
                reminder.subscriptionId,
              ),
            )
            .map((reminder) => {
              const expiresAtMs = Date.parse(reminder.expiresAt || "");
              const nextReminderMs = Date.parse(
                reminder.nextReminderAt || "",
              );
              return Number.isFinite(expiresAtMs) &&
                Number.isFinite(nextReminderMs) &&
                nextReminderMs < expiresAtMs
                ? nextReminderMs
                : null;
            })
            .filter(Number.isFinite)
        : [];
    const target = Math.min(
      checkTarget,
      ...pendingDueTargets,
      ...discoveryReminderTargets,
    );
    const delay = Math.max(
      1_000,
      Math.min(target - nowMs, MAX_SCHEDULER_DELAY_MS),
    );

    this.nextCheckAt = new Date(checkTarget).toISOString();
    this.schedulerTimer = this.timers.setTimeout(async () => {
      this.schedulerTimer = null;
      try {
        await this.flushDiscoveryReminders();
        await this.flushDueNotifications();
        const latestState = await this.store.read();
        const latestNowMs = this.now().getTime();
        const latestCheckTarget = resolveScheduledCheckMs(
          latestState.settings,
          latestNowMs,
        );
        if (latestNowMs >= latestCheckTarget - 500) {
          await this.checkAll({
            notify: true,
            discover: true,
            trigger: "cron",
          });
        }
      } catch {
        // The next timer is still scheduled so a transient error cannot stop monitoring.
      } finally {
        await this.scheduleNext();
      }
    }, delay);
    this.schedulerTimer?.unref?.();
  }
}

export const __test = {
  MAX_SEASONS_PER_SERIES,
  MAX_SUBSCRIPTIONS,
  mapWithConcurrency,
  seasonSortValue,
};
