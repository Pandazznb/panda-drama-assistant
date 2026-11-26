import {
  parseReservationExpectedDate,
  reservationPlaceholderId,
} from "./calendar-reservations.js";
import {
  calendarEventSeasonKey,
  latestEpisodeEventIdBySeason,
  resolveUpdateEventOccurredAt,
} from "./calendar-events.js";
import { buildSeasonUpdateSchedule } from "./calendar-schedule.js";

(() => {
  "use strict";

  const APP_TIME_ZONE = "Asia/Shanghai";
  const VIEW_STORAGE_KEY = "panda-drama-assistant.calendar-view";
  const TYPE_STORAGE_KEY = "panda-drama-assistant.calendar-type";
  const LOG_PAGE_SIZE = 500;
  const UPDATE_EVENT_TYPES = new Set(["season", "episode"]);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const AUTO_REFRESH_MS = 5 * 60 * 1000;
  const ACCOUNT_SNAPSHOT_MAX_AGE_MS = 30 * 60 * 1000;
  const WEEKDAY_NAMES = [
    "周日",
    "周一",
    "周二",
    "周三",
    "周四",
    "周五",
    "周六",
  ];
  const elements = {
    workspace: document.querySelector(".calendar-view"),
    heroLabel: document.querySelector("#calendar-hero-label"),
    heroDate: document.querySelector("#calendar-hero-date"),
    heroSummary: document.querySelector("#calendar-hero-summary"),
    accountSummary: document.querySelector("#calendar-account-summary"),
    refresh: document.querySelector("#calendar-refresh"),
    previous: document.querySelector("#calendar-previous"),
    next: document.querySelector("#calendar-next"),
    today: document.querySelector("#calendar-today"),
    status: document.querySelector("#calendar-status"),
    periodTitle: document.querySelector("#calendar-period-title"),
    weekView: document.querySelector("#calendar-week-view"),
    weekStrip: document.querySelector("#calendar-week-strip"),
    weekTimeline: document.querySelector("#calendar-week-timeline"),
    monthView: document.querySelector("#calendar-month-view"),
    monthGrid: document.querySelector("#calendar-grid"),
    dayPanel: document.querySelector(".calendar-day-panel"),
    selectedDate: document.querySelector("#calendar-selected-date"),
    selectedToday: document.querySelector("#calendar-selected-today"),
    entryCount: document.querySelector("#calendar-entry-count"),
    selectedSummary: document.querySelector("#calendar-selected-summary"),
    entryList: document.querySelector("#calendar-entry-list"),
    pendingSection: document.querySelector("#calendar-pending-section"),
    pendingToggle: document.querySelector("#calendar-pending-toggle"),
    pendingBody: document.querySelector("#calendar-pending-body"),
    pendingCount: document.querySelector("#calendar-pending-count"),
    pendingList: document.querySelector("#calendar-pending-list"),
    sourceNote: document.querySelector("#calendar-source-note"),
    typeButtons: [
      ...document.querySelectorAll("[data-calendar-type]"),
    ],
    viewButtons: [
      ...document.querySelectorAll("[data-calendar-view]"),
    ],
  };

  if (
    !elements.workspace ||
    !elements.weekStrip ||
    !elements.weekTimeline ||
    !elements.monthGrid
  ) {
    return;
  }

  const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timePartsFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const state = {
    view: readStoredView(),
    typeFilter: readStoredType(),
    selectedDate: todayDateKey(),
    loading: true,
    fetching: false,
    hasLoaded: false,
    pendingExpanded: false,
    requestToken: 0,
    lastRefreshAt: 0,
    accountPayload: null,
    accountRefreshPromise: null,
    dashboard: null,
    logPayload: null,
    data: emptyCalendarData(),
    errors: [],
  };

  function icon(name, className = "icon") {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readStoredView() {
    try {
      const view = window.localStorage.getItem(VIEW_STORAGE_KEY);
      return view === "month" ? "month" : "week";
    } catch {
      return "week";
    }
  }

  function storeView(view) {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // Calendar preferences are optional when storage is unavailable.
    }
  }

  function readStoredType() {
    try {
      const type = window.localStorage.getItem(TYPE_STORAGE_KEY);
      return ["season", "episode"].includes(type) ? type : "all";
    } catch {
      return "all";
    }
  }

  function storeType(type) {
    try {
      window.localStorage.setItem(TYPE_STORAGE_KEY, type);
    } catch {
      // Calendar preferences are optional when storage is unavailable.
    }
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function datePartsFromInstant(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const parts = Object.fromEntries(
      datePartsFormatter
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    if (
      !Number.isInteger(parts.year) ||
      !Number.isInteger(parts.month) ||
      !Number.isInteger(parts.day)
    ) {
      return null;
    }
    return parts;
  }

  function dateKeyFromValue(value) {
    if (!value) {
      return null;
    }
    const parts = datePartsFromInstant(value);
    if (!parts) {
      return null;
    }
    return `${parts.year}-${padNumber(parts.month)}-${padNumber(parts.day)}`;
  }

  function todayDateKey() {
    return dateKeyFromValue(new Date());
  }

  function parseDateKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return { year, month, day };
  }

  function dateKeyFromUtcDate(date) {
    return `${date.getUTCFullYear()}-${padNumber(
      date.getUTCMonth() + 1,
    )}-${padNumber(date.getUTCDate())}`;
  }

  function dateKeyToUtcMs(dateKey) {
    const parts = parseDateKey(dateKey);
    return parts
      ? Date.UTC(parts.year, parts.month - 1, parts.day)
      : Number.NaN;
  }

  function dayOfWeek(dateKey) {
    const utcMs = dateKeyToUtcMs(dateKey);
    return Number.isFinite(utcMs)
      ? new Date(utcMs).getUTCDay()
      : Number.NaN;
  }

  function addDays(dateKey, amount) {
    const utcMs = dateKeyToUtcMs(dateKey);
    if (!Number.isFinite(utcMs)) {
      return todayDateKey();
    }
    return dateKeyFromUtcDate(new Date(utcMs + amount * DAY_MS));
  }

  function addMonthsClamped(dateKey, amount) {
    const parts = parseDateKey(dateKey);
    if (!parts) {
      return todayDateKey();
    }
    const targetMonth = new Date(
      Date.UTC(parts.year, parts.month - 1 + amount, 1),
    );
    const lastDay = new Date(
      Date.UTC(
        targetMonth.getUTCFullYear(),
        targetMonth.getUTCMonth() + 1,
        0,
      ),
    ).getUTCDate();
    return dateKeyFromUtcDate(
      new Date(
        Date.UTC(
          targetMonth.getUTCFullYear(),
          targetMonth.getUTCMonth(),
          Math.min(parts.day, lastDay),
        ),
      ),
    );
  }

  function startOfWeek(dateKey) {
    const weekDay = dayOfWeek(dateKey);
    if (!Number.isFinite(weekDay)) {
      return todayDateKey();
    }
    return addDays(dateKey, -((weekDay + 6) % 7));
  }

  function weekDates(dateKey) {
    const start = startOfWeek(dateKey);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }

  function daysBetween(leftDateKey, rightDateKey) {
    return Math.round(
      (dateKeyToUtcMs(leftDateKey) - dateKeyToUtcMs(rightDateKey)) /
        DAY_MS,
    );
  }

  function formatMonthDay(dateKey) {
    const parts = parseDateKey(dateKey);
    return parts ? `${parts.month}月${parts.day}日` : "日期未知";
  }

  function formatDotDate(dateKey) {
    const parts = parseDateKey(dateKey);
    return parts
      ? `${padNumber(parts.month)}.${padNumber(parts.day)}`
      : "--.--";
  }

  function formatMonthTitle(dateKey) {
    const parts = parseDateKey(dateKey);
    return parts ? `${parts.year} 年 ${parts.month} 月` : "日期未知";
  }

  function relativeDateLabel(dateKey) {
    const difference = daysBetween(dateKey, todayDateKey());
    if (difference === 0) {
      return "今天";
    }
    if (difference === 1) {
      return "明天";
    }
    if (difference === -1) {
      return "昨天";
    }
    const weekDay = dayOfWeek(dateKey);
    return Number.isFinite(weekDay) ? WEEKDAY_NAMES[weekDay] : "日期";
  }

  function formatInstantTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      return "时间未知";
    }
    const parts = Object.fromEntries(
      timePartsFormatter
        .formatToParts(date)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }

  function formatFullDateTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      return "时间未知";
    }
    return dateTimeFormatter.format(date).replaceAll("/", "-");
  }

  function normalizeWhitespace(value) {
    return String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractSeasonLabel(title) {
    const match =
      /(第[0-9零一二三四五六七八九十百千万两]+(?:季|部))/u.exec(
        String(title || ""),
      );
    return match ? match[1] : "";
  }

  function stripSeasonLabel(title) {
    const normalized = normalizeWhitespace(title);
    if (!normalized) {
      return "";
    }
    const stripped = normalized
      .replace(
        /\s*第[0-9零一二三四五六七八九十百千万两]+(?:季|部)\s*$/u,
        "",
      )
      .trim();
    return stripped || normalized;
  }

  function normalizedTitleKey(value) {
    return stripSeasonLabel(value)
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s·•,，。.!！?？:：;；'"“”‘’()（）[\]【】_-]+/gu, "");
  }

  function officialSeriesId(value) {
    const seriesId = String(value || "");
    return /^\d{8,25}$/u.test(seriesId) ? seriesId : "";
  }

  function subscriptionSeriesTitle(subscription) {
    return (
      stripSeasonLabel(
        subscription?.displayTitle ||
          subscription?.firstSeasonTitle ||
          subscription?.title,
      ) || "未命名系列"
    );
  }

  function seasonLabelFromIndex(value) {
    const seasonIndex = finiteNumber(value);
    return Number.isInteger(seasonIndex) && seasonIndex > 0
      ? `第${seasonIndex}季`
      : "";
  }

  function subscriptionPlaceholderSeasons(subscription) {
    const discovery =
      subscription?.discovery && typeof subscription.discovery === "object"
        ? subscription.discovery
        : {};
    const seasons = [];
    const seen = new Set();
    const detailedSeasons = Array.isArray(discovery.unpublishedSeasons)
      ? discovery.unpublishedSeasons
      : [];
    for (const value of detailedSeasons) {
      const source =
        value && typeof value === "object" ? value : { seriesId: value };
      const seriesId = officialSeriesId(
        source.seriesId || source.itemId || source.item_id,
      );
      if (!seriesId || seen.has(seriesId)) {
        continue;
      }
      seen.add(seriesId);
      seasons.push({
        seriesId,
        seasonIndex: finiteNumber(source.seasonIndex ?? source.season_index),
        coverUrl: safeImageUrl(
          source.coverUrl || source.series_cover,
        ),
        schedulePublishAt: validIso(source.schedulePublishAt),
        scheduleDateKey: /^\d{4}-\d{2}-\d{2}$/.test(
          String(source.scheduleDateKey || ""),
        )
          ? String(source.scheduleDateKey)
          : null,
        scheduleText: normalizeWhitespace(source.scheduleText),
        scheduleCheckedAt: validIso(source.scheduleCheckedAt),
        scheduleError: normalizeWhitespace(source.scheduleError),
      });
    }

    for (const value of Array.isArray(discovery.unpublishedSeriesIds)
      ? discovery.unpublishedSeriesIds
      : []) {
      const seriesId = officialSeriesId(value);
      if (!seriesId || seen.has(seriesId)) {
        continue;
      }
      seen.add(seriesId);
      seasons.push({
        seriesId,
        seasonIndex: null,
        coverUrl: "",
        schedulePublishAt: null,
        scheduleDateKey: null,
        scheduleText: "",
        scheduleCheckedAt: null,
        scheduleError: "",
      });
    }

    const declaredCount = Math.max(
      0,
      Number(discovery.unpublishedSeasonCount) || 0,
      seasons.length,
    );
    for (let index = seasons.length; index < declaredCount; index += 1) {
      seasons.push({
        seriesId: null,
        seasonIndex: null,
        coverUrl: "",
        schedulePublishAt: null,
        scheduleDateKey: null,
        scheduleText: "",
        scheduleCheckedAt: null,
        scheduleError: "",
      });
    }

    return {
      seriesTitle: subscriptionSeriesTitle(subscription),
      coverUrl:
        safeImageUrl(subscription?.coverUrl) ||
        safeImageUrl(
          Array.isArray(subscription?.seasons)
            ? subscription.seasons[0]?.coverUrl
            : "",
        ),
      seasons,
    };
  }

  function safeLinkUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function safeImageUrl(value) {
    try {
      const url = new URL(String(value || ""), window.location.origin);
      if (url.protocol === "https:") {
        return url.href;
      }
      if (url.origin === window.location.origin && url.pathname.startsWith("/")) {
        return url.pathname;
      }
    } catch {
      return "";
    }
    return "";
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validIso(value) {
    if (!value) {
      return null;
    }
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString()
      : null;
  }

  function emptyCalendarData() {
    return {
      entries: [],
      pending: [],
      reservations: [],
      account: {
        authenticated: false,
        available: true,
        name: "",
        snapshotFetchedAt: null,
      },
    };
  }

  async function requestJson(
    path,
    { timeoutMs = 15_000, method = "GET", body } = {},
  ) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: "application/json" };
      let requestBody;
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        requestBody = JSON.stringify(body);
      }
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: requestBody,
        signal: controller.signal,
      });
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            payload?.message ||
            `请求失败（HTTP ${response.status}）`,
        );
      }
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("请求超时，请稍后重试。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function mergeUpdateEntry(existing, incoming) {
    const episodeCount = Math.max(
      Number(existing.episodeCount) || 0,
      Number(incoming.episodeCount) || 0,
    );
    const previousCounts = [
      finiteNumber(existing.previousEpisodeCount),
      finiteNumber(incoming.previousEpisodeCount),
    ].filter((value) => value !== null);
    const previousEpisodeCount = previousCounts.length
      ? Math.min(...previousCounts)
      : null;
    const existingTime = Date.parse(existing.occurredAt || "") || 0;
    const incomingTime = Date.parse(incoming.occurredAt || "") || 0;
    const keepExistingTime =
      existing.source === "dashboard" &&
      dateKeyFromValue(existing.occurredAt) ===
        dateKeyFromValue(incoming.occurredAt);
    return {
      ...existing,
      ...incoming,
      seriesTitle: incoming.seriesTitle || existing.seriesTitle,
      seasonTitle: incoming.seasonTitle || existing.seasonTitle,
      seasonLabel: incoming.seasonLabel || existing.seasonLabel,
      coverUrl: incoming.coverUrl || existing.coverUrl,
      detailUrl: incoming.detailUrl || existing.detailUrl,
      episodeCount: episodeCount || null,
      previousEpisodeCount,
      addedEpisodeCount:
        previousEpisodeCount !== null && episodeCount
          ? Math.max(0, episodeCount - previousEpisodeCount)
          : null,
      occurredAt: keepExistingTime
        ? existing.occurredAt
        : incomingTime >= existingTime
          ? incoming.occurredAt
          : existing.occurredAt,
      source:
        existing.source === "dashboard" || incoming.source === "dashboard"
          ? "dashboard"
          : "log",
    };
  }

  function upsertUpdateEntry(entries, entry) {
    if (!entry.dateKey) {
      return;
    }
    const key = updateEntryKey(entry);
    const existing = entries.get(key);
    if (!existing) {
      entries.set(key, entry);
      return;
    }
    const merged = mergeUpdateEntry(existing, entry);
    entries.set(key, merged);
  }

  function updateEntryKey(entry) {
    return [
      entry.subscriptionId,
      entry.seasonId,
      entry.kind,
      entry.dateKey,
    ].join(":");
  }

  function updateEntryFromSeason(subscription, season, kind, occurredAt) {
    if (!occurredAt) {
      return null;
    }
    const seriesTitle =
      subscription.displayTitle ||
      subscription.firstSeasonTitle ||
      subscription.title ||
      "未命名系列";
    const seasonTitle =
      season.title || subscription.firstSeasonTitle || seriesTitle;
    const episodeCount =
      kind === "episode"
        ? finiteNumber(season.highWaterEpisodeCount) ??
          finiteNumber(season.episodeCount)
        : finiteNumber(season.episodeCount);
    return {
      id: `${kind}:${subscription.id}:${season.seriesId}:${dateKeyFromValue(
        occurredAt,
      )}`,
      type: "update",
      kind,
      dateKey: dateKeyFromValue(occurredAt),
      subscriptionId: String(subscription.id),
      seasonId: String(season.seriesId),
      seriesTitle,
      seasonTitle,
      seasonLabel: extractSeasonLabel(seasonTitle),
      episodeCount,
      previousEpisodeCount: null,
      addedEpisodeCount: null,
      occurredAt,
      coverUrl:
        safeImageUrl(season.coverUrl) ||
        safeImageUrl(subscription.coverUrl),
      detailUrl: safeLinkUrl(season.detailUrl),
      expectedText: "",
      source: "dashboard",
    };
  }

  function buildCalendarData(dashboard, logPayload, accountPayload) {
    const subscriptions = Array.isArray(dashboard?.subscriptions)
      ? dashboard.subscriptions
      : [];
    const events = Array.isArray(logPayload?.events) ? logPayload.events : [];
    const account = accountPayload?.account || null;
    const authenticated = account?.authenticated === true;
    const subscriptionById = new Map(
      subscriptions.map((subscription) => [
        String(subscription.id),
        subscription,
      ]),
    );
    const calendarTodayKey = todayDateKey();
    const seasonLookup = new Map();
    const updateEntries = new Map();
    const latestEpisodeEventIds = latestEpisodeEventIdBySeason(events);

    for (const subscription of subscriptions) {
      for (const season of Array.isArray(subscription.seasons)
        ? subscription.seasons
        : []) {
        if (!season?.seriesId) {
          continue;
        }
        const lookupKey = `${subscription.id}:${season.seriesId}`;
        seasonLookup.set(lookupKey, { subscription, season });

        const seasonTime = validIso(season.firstVisibleTime);
        const seasonEntry = updateEntryFromSeason(
          subscription,
          season,
          "season",
          seasonTime,
        );
        if (seasonEntry) {
          upsertUpdateEntry(updateEntries, seasonEntry);
        }

        const episodeTime = validIso(season.lastEpisodeChangedAt);
        const episodeEntry = updateEntryFromSeason(
          subscription,
          season,
          "episode",
          episodeTime,
        );
        if (episodeEntry) {
          upsertUpdateEntry(updateEntries, episodeEntry);
        }
      }
    }

    for (const event of events) {
      if (!UPDATE_EVENT_TYPES.has(event?.type)) {
        continue;
      }
      const subscription = subscriptionById.get(
        String(event.subscriptionId || ""),
      );
      if (!subscription || !event.seasonId) {
        continue;
      }
      const lookup = seasonLookup.get(
        `${subscription.id}:${event.seasonId}`,
      );
      if (!lookup) {
        continue;
      }
      const fallbackTime = validIso(event.createdAt);
      if (!fallbackTime) {
        continue;
      }
      const eventSeasonKey = calendarEventSeasonKey(event);
      const occurredAt =
        resolveUpdateEventOccurredAt(
          event,
          lookup.season,
          latestEpisodeEventIds.get(eventSeasonKey),
        ) || fallbackTime;
      const seasonTitle =
        lookup.season.title || event.seasonTitle || subscription.displayTitle;
      const entry = {
        id: String(event.id),
        type: "update",
        kind: event.type,
        dateKey: dateKeyFromValue(occurredAt),
        subscriptionId: String(subscription.id),
        seasonId: String(event.seasonId),
        seriesTitle:
          subscription.displayTitle ||
          subscription.firstSeasonTitle ||
          subscription.title ||
          "未命名系列",
        seasonTitle,
        seasonLabel: extractSeasonLabel(seasonTitle),
        episodeCount: finiteNumber(event.episodeCount),
        previousEpisodeCount: finiteNumber(event.previousEpisodeCount),
        addedEpisodeCount: null,
        occurredAt,
        coverUrl:
          safeImageUrl(lookup.season.coverUrl) ||
          safeImageUrl(subscription.coverUrl),
        detailUrl: safeLinkUrl(lookup.season.detailUrl),
        expectedText: "",
        source: "log",
      };
      if (
        entry.kind === "episode" &&
        entry.previousEpisodeCount !== null &&
        entry.episodeCount !== null
      ) {
        entry.addedEpisodeCount = Math.max(
          0,
          entry.episodeCount - entry.previousEpisodeCount,
        );
      }
      upsertUpdateEntry(updateEntries, entry);
    }

    const estimatedUpdateEntries = new Map();
    for (const subscription of subscriptions) {
      const seriesTitle = subscriptionSeriesTitle(subscription);
      for (const season of Array.isArray(subscription.seasons)
        ? subscription.seasons
        : []) {
        if (!season?.seriesId) {
          continue;
        }
        const schedule = buildSeasonUpdateSchedule({
          season,
          todayDateKey: calendarTodayKey,
        });
        for (const occurrence of schedule) {
          const seasonTitle =
            season.title || subscription.firstSeasonTitle || seriesTitle;
          const candidate = {
            id: `estimated:${subscription.id}:${season.seriesId}:${occurrence.dateKey}`,
            type: "update",
            kind: "episode",
            dateKey: occurrence.dateKey,
            subscriptionId: String(subscription.id),
            seasonId: String(season.seriesId),
            seriesTitle,
            seasonTitle,
            seasonLabel: extractSeasonLabel(seasonTitle),
            episodeCount: occurrence.projectedEpisodeCount,
            previousEpisodeCount: null,
            addedEpisodeCount: occurrence.plannedEpisodes,
            occurredAt: occurrence.occurredAt,
            coverUrl:
              safeImageUrl(season.coverUrl) ||
              safeImageUrl(subscription.coverUrl),
            detailUrl: safeLinkUrl(season.detailUrl),
            expectedText: `官方更新规则：${occurrence.ruleText}`,
            source: "update-rule",
            estimated: true,
            scheduleTimeKnown: occurrence.timeKnown,
            scheduleTimeLabel: occurrence.timeLabel,
            confirmedTotalEpisodeCount:
              occurrence.confirmedTotalEpisodeCount,
          };
          const key = updateEntryKey(candidate);
          if (updateEntries.has(key) || estimatedUpdateEntries.has(key)) {
            continue;
          }
          estimatedUpdateEntries.set(key, candidate);
        }
      }
    }

    const reservationSource = authenticated
      ? account?.snapshot?.categories?.reservationsUpcoming?.items
      : [];
    const reservationItems = Array.isArray(reservationSource)
      ? reservationSource
      : [];
    const reservationMap = new Map();
    for (const item of reservationItems) {
      const title = normalizeWhitespace(item?.title);
      if (!title) {
        continue;
      }
      const seriesTitle = stripSeasonLabel(title);
      const expectedDateKey = parseReservationExpectedDate(
        item.expectedDate ||
          item.expectedDateKey ||
          item.expectedPublishDate ||
          item.expectedText,
        calendarTodayKey,
      );
      const reliableTime = validIso(item.updatedAt);
      const dateKey = expectedDateKey;
      const occurredAt = expectedDateKey
        ? `${expectedDateKey}T00:00:00+08:00`
        : reliableTime;
      const displayId = String(
        item.displayId ||
          item.seriesId ||
          `${normalizedTitleKey(title)}:${dateKey || "pending"}`,
      );
      const entry = {
        id: `reservation:${displayId}`,
        type: "reservation",
        kind: "reservation",
        dateKey,
        datePrecision: expectedDateKey ? "day" : null,
        dateSource: expectedDateKey
          ? "expected-text"
          : reliableTime
            ? "account"
            : null,
        subscriptionId: null,
        seasonId: item.seriesId ? String(item.seriesId) : null,
        displayId,
        seriesTitle,
        seasonTitle: title,
        seasonLabel: extractSeasonLabel(title),
        episodeCount: finiteNumber(item.episodeCount),
        previousEpisodeCount: null,
        addedEpisodeCount: null,
        occurredAt,
        coverUrl: safeImageUrl(item.coverUrl),
        detailUrl: "",
        expectedText: normalizeWhitespace(item.expectedText),
        source: "account",
      };
      const existing = reservationMap.get(displayId);
      if (!existing) {
        reservationMap.set(displayId, entry);
        continue;
      }
      const existingRank =
        (existing.dateKey ? 4 : 0) +
        (existing.dateSource === "expected-text" ? 2 : 0);
      const incomingRank =
        (entry.dateKey ? 4 : 0) +
        (entry.dateSource === "expected-text" ? 2 : 0);
      const existingTime = Date.parse(existing.occurredAt || "") || 0;
      const incomingTime = Date.parse(entry.occurredAt || "") || 0;
      if (
        incomingRank > existingRank ||
        (incomingRank === existingRank && incomingTime > existingTime)
      ) {
        reservationMap.set(displayId, {
          ...existing,
          ...entry,
          coverUrl: entry.coverUrl || existing.coverUrl,
          expectedText: entry.expectedText || existing.expectedText,
        });
      }
    }

    const allReservations = [...reservationMap.values()];
    const reservationByPlaceholderId = new Map();
    const reservationBySeriesId = new Map();
    for (const reservation of allReservations) {
      const placeholderId = reservationPlaceholderId(
        reservation.displayId,
      );
      if (placeholderId) {
        reservationByPlaceholderId.set(placeholderId, reservation);
      }
      if (reservation.seasonId) {
        reservationBySeriesId.set(
          String(reservation.seasonId),
          reservation,
        );
      }
    }

    const pending = [];
    const scheduledPlaceholderEntries = [];
    const seenPlaceholderSeriesIds = new Set();
    for (const subscription of subscriptions) {
      const placeholderInfo = subscriptionPlaceholderSeasons(subscription);
      for (const [index, placeholder] of placeholderInfo.seasons.entries()) {
        if (placeholder.seriesId) {
          if (seenPlaceholderSeriesIds.has(placeholder.seriesId)) {
            continue;
          }
          seenPlaceholderSeriesIds.add(placeholder.seriesId);
        }
        const matchedReservation = placeholder.seriesId
          ? reservationByPlaceholderId.get(placeholder.seriesId) ||
            reservationBySeriesId.get(placeholder.seriesId)
          : null;
        const seasonLabel = seasonLabelFromIndex(placeholder.seasonIndex);
        const scheduleDateKey = placeholder.scheduleDateKey
          ? placeholder.scheduleDateKey
          : placeholder.schedulePublishAt
            ? dateKeyFromValue(placeholder.schedulePublishAt)
            : null;
        if (matchedReservation) {
          matchedReservation.subscriptionId = String(subscription.id);
          matchedReservation.seriesTitle = placeholderInfo.seriesTitle;
          matchedReservation.seasonLabel =
            seasonLabel || matchedReservation.seasonLabel;
          matchedReservation.seasonIndex = placeholder.seasonIndex;
          matchedReservation.coverUrl =
            matchedReservation.coverUrl ||
            placeholder.coverUrl ||
            placeholderInfo.coverUrl;
          if (!matchedReservation.dateKey && scheduleDateKey) {
            matchedReservation.dateKey = scheduleDateKey;
            matchedReservation.datePrecision = "day";
            matchedReservation.dateSource = "schedule";
            matchedReservation.occurredAt =
              placeholder.schedulePublishAt ||
              `${scheduleDateKey}T00:00:00+08:00`;
            matchedReservation.expectedText =
              placeholder.scheduleText ||
              matchedReservation.expectedText ||
              "官方预约档期";
          }
          continue;
        }
        const entry = {
          id: `placeholder-schedule:${subscription.id}:${
            placeholder.seriesId || `slot-${index + 1}`
          }`,
          type: scheduleDateKey ? "placeholder-schedule" : "placeholder",
          kind: "placeholder",
          dateKey: scheduleDateKey,
          datePrecision: scheduleDateKey ? "day" : null,
          dateSource: scheduleDateKey ? "schedule" : null,
          subscriptionId: String(subscription.id),
          seasonId: placeholder.seriesId || null,
          seriesTitle: placeholderInfo.seriesTitle,
          seasonTitle: "",
          seasonLabel,
          seasonIndex: placeholder.seasonIndex,
          episodeCount: null,
          previousEpisodeCount: null,
          addedEpisodeCount: null,
          occurredAt: scheduleDateKey
            ? placeholder.schedulePublishAt ||
              `${scheduleDateKey}T00:00:00+08:00`
            : null,
          coverUrl: placeholder.coverUrl || placeholderInfo.coverUrl,
          detailUrl: "",
          expectedText:
            placeholder.scheduleText ||
            (scheduleDateKey
              ? "收藏中的占位季已公布上线日期"
              : placeholder.scheduleError
                ? "档期暂未读取到，稍后自动重试"
                : placeholder.seriesId
                  ? "官方已建立占位季，等待上线日期"
                  : "等待官方公布上线日期"),
          source: "dashboard",
        };
        if (scheduleDateKey) {
          scheduledPlaceholderEntries.push(entry);
        } else {
          pending.push(entry);
        }
      }
    }
    pending.push(
      ...allReservations
        .filter((entry) => !entry.dateKey)
        .map((entry) => ({
          ...entry,
          expectedText:
            entry.expectedText || "等待官方公布上线日期",
        })),
    );
    const reservationEntries = allReservations.filter(
      (entry) => entry.dateKey,
    );

    const entries = [
      ...updateEntries.values(),
      ...estimatedUpdateEntries.values(),
      ...reservationEntries,
      ...scheduledPlaceholderEntries,
    ]
      .filter((entry) => entry.dateKey)
      .sort(compareDatedEntries);
    pending.sort(comparePendingEntries);
    return {
      entries,
      pending,
      reservations: allReservations,
      account: {
        authenticated,
        available: Boolean(accountPayload),
        name:
          account?.profile?.name ||
          account?.snapshot?.profile?.name ||
          "",
        snapshotFetchedAt: validIso(account?.snapshot?.fetchedAt),
      },
    };
  }

  function compareDatedEntries(left, right) {
    const timeDifference =
      (Date.parse(right.occurredAt || "") || 0) -
      (Date.parse(left.occurredAt || "") || 0);
    if (timeDifference !== 0) {
      return timeDifference;
    }
    const typeOrder = {
      reservation: 0,
      "placeholder-schedule": 0,
      episode: 1,
      season: 2,
    };
    return (typeOrder[left.type] ?? 9) - (typeOrder[right.type] ?? 9);
  }

  function comparePendingEntries(left, right) {
    const typeOrder = {
      reservation: 0,
      placeholder: 1,
    };
    const typeDifference =
      (typeOrder[left.type] ?? 9) - (typeOrder[right.type] ?? 9);
    if (typeDifference !== 0) {
      return typeDifference;
    }
    return left.seriesTitle.localeCompare(right.seriesTitle, "zh-CN");
  }

  function buildEntryIndex(entries) {
    const byDate = new Map();
    for (const entry of entries) {
      if (!entry.dateKey) {
        continue;
      }
      let bucket = byDate.get(entry.dateKey);
      if (!bucket) {
        bucket = {
          entries: [],
          total: 0,
          seasonUpdates: 0,
          episodeUpdates: 0,
          estimatedUpdates: 0,
          reservations: 0,
          placeholderSchedules: 0,
        };
        byDate.set(entry.dateKey, bucket);
      }
      bucket.entries.push(entry);
      bucket.total += 1;
      if (entry.type === "update" && entry.kind === "season") {
        bucket.seasonUpdates += 1;
      } else if (entry.type === "update" && entry.kind === "episode") {
        if (entry.estimated) {
          bucket.estimatedUpdates += 1;
        } else {
          bucket.episodeUpdates += 1;
        }
      } else if (entry.type === "reservation") {
        bucket.reservations += 1;
      } else if (entry.type === "placeholder-schedule") {
        bucket.placeholderSchedules += 1;
      }
    }
    for (const bucket of byDate.values()) {
      bucket.entries.sort(compareDatedEntries);
    }
    return byDate;
  }

  function bucketForDate(entryIndex, dateKey) {
    return (
      entryIndex.get(dateKey) || {
        entries: [],
        total: 0,
        seasonUpdates: 0,
        episodeUpdates: 0,
        estimatedUpdates: 0,
        reservations: 0,
      }
    );
  }

  function filterCalendarEntries(entries) {
    if (state.typeFilter === "all") {
      return entries;
    }
    if (state.typeFilter === "season") {
      return entries.filter(
        (entry) => entry.type === "update" && entry.kind === "season",
      );
    }
    if (state.typeFilter === "episode") {
      return entries.filter(
        (entry) => entry.type === "update" && entry.kind === "episode",
      );
    }
    return [];
  }

  function filterPendingEntries(entries) {
    return state.typeFilter === "all" ? entries : [];
  }

  function typeFilterLabel() {
    return (
      {
        season: "季更新",
        episode: "集更新",
      }[state.typeFilter] || "全部"
    );
  }

  function renderOverview(entryIndex) {
    const isInitialLoad = !state.hasLoaded;
    const today = todayDateKey();
    const selected = state.selectedDate;
    const selectedBucket = bucketForDate(entryIndex, selected);
    const overviewDates = weekDates(selected);
    const overviewEntries = overviewDates.flatMap(
      (dateKey) => bucketForDate(entryIndex, dateKey).entries,
    );
    const overviewSeasonUpdates = overviewEntries.filter(
      (entry) => entry.type === "update" && entry.kind === "season",
    ).length;
    const overviewEpisodeUpdates = overviewEntries.filter(
      (entry) =>
        entry.type === "update" &&
        entry.kind === "episode" &&
        !entry.estimated,
    ).length;
    const overviewEstimatedUpdates = overviewEntries.filter(
      (entry) => entry.estimated === true,
    ).length;
    const overviewReservations = overviewEntries.filter(
      (entry) =>
        entry.type === "reservation" ||
        entry.type === "placeholder-schedule",
    ).length;
    const todayCount = bucketForDate(entryIndex, today).total;
    const reservationCount = state.data.reservations.length;
    const currentWeek = startOfWeek(today) === startOfWeek(selected);
    const overviewScope = currentWeek ? "当前 7 天" : "所选周";

    elements.heroLabel.textContent = relativeDateLabel(selected);
    elements.heroDate.textContent = formatDotDate(selected);
    elements.heroSummary.textContent =
      overviewEntries.length > 0
        ? `${overviewScope}共 ${
            overviewEntries.length
          } 条日历项，今天命中 ${todayCount} 条；含 ${overviewSeasonUpdates} 条季更新、${overviewEpisodeUpdates} 条集更新、${overviewEstimatedUpdates} 条预计更新、${overviewReservations} 条预约。${
            state.typeFilter === "all"
              ? ""
              : `当前筛选：${typeFilterLabel()}。`
          }`
        : `${overviewScope}暂时没有${state.typeFilter === "all" ? "追更更新或账号预约" : typeFilterLabel()}。`;

    if (isInitialLoad) {
      elements.accountSummary.textContent = "正在读取账号预约信息…";
    } else if (!state.data.account.available) {
      elements.accountSummary.textContent =
        "账号预约暂不可用，追更更新仍可正常查看。";
    } else if (!state.data.account.authenticated) {
      elements.accountSummary.textContent =
        "账号未登录，当前仅展示追更更新和官方占位季。";
    } else {
      const name = state.data.account.name || "红果账号";
      const fetched = state.data.account.snapshotFetchedAt
        ? ` · 快照 ${formatFullDateTime(
            state.data.account.snapshotFetchedAt,
          )}`
        : "";
      elements.accountSummary.textContent = `${name} · ${reservationCount} 条预约${fetched}`;
    }

    const selectedSeasonUpdateText = selectedBucket.seasonUpdates
      ? `${selectedBucket.seasonUpdates} 条季更新`
      : "";
    const selectedEpisodeUpdateText = selectedBucket.episodeUpdates
      ? `${selectedBucket.episodeUpdates} 条集更新`
      : "";
    const selectedEstimatedUpdateText = selectedBucket.estimatedUpdates
      ? `${selectedBucket.estimatedUpdates} 条预计更新`
      : "";
    const selectedReservationCount =
      selectedBucket.reservations + selectedBucket.placeholderSchedules;
    const selectedReservationText = selectedReservationCount
      ? `${selectedReservationCount} 条预约档期`
      : "";
    elements.selectedDate.textContent = `${formatMonthDay(selected)} · ${WEEKDAY_NAMES[dayOfWeek(selected)]}`;
    elements.selectedToday.hidden = selected !== today;
    elements.entryCount.hidden = selectedBucket.total === 0;
    elements.entryCount.textContent = `${selectedBucket.total} 项`;
    elements.selectedSummary.textContent =
      selectedBucket.total > 0
        ? [
            selectedSeasonUpdateText,
            selectedEpisodeUpdateText,
            selectedEstimatedUpdateText,
            selectedReservationText,
          ]
            .filter(Boolean)
            .join(" · ")
        : "这一天没有短剧更新或预约档期。";
  }

  function renderPeriodControls() {
    if (state.view === "month") {
      elements.periodTitle.textContent = formatMonthTitle(
        state.selectedDate,
      );
      elements.previous.setAttribute("aria-label", "查看上个月");
      elements.previous.setAttribute("title", "上个月");
      elements.next.setAttribute("aria-label", "查看下个月");
      elements.next.setAttribute("title", "下个月");
      return;
    }
    const dates = weekDates(state.selectedDate);
    const isCurrentWeek =
      startOfWeek(state.selectedDate) === startOfWeek(todayDateKey());
    elements.periodTitle.textContent = `${formatMonthDay(
      dates[0],
    )} - ${formatMonthDay(dates[6])}`;
    elements.previous.setAttribute("aria-label", "查看上一周");
    elements.previous.setAttribute("title", "上一周");
    elements.next.setAttribute("aria-label", "查看下一周");
    elements.next.setAttribute("title", "下一周");
    elements.weekStrip.setAttribute(
      "aria-label",
      `${formatMonthDay(dates[0])}至${formatMonthDay(dates[6])}日期`,
    );
  }

  function dateMarkerHtml(bucket) {
    return [
      bucket.seasonUpdates
        ? '<span class="calendar-date-dot calendar-date-dot--season" aria-hidden="true"></span>'
        : "",
      bucket.episodeUpdates
        ? '<span class="calendar-date-dot calendar-date-dot--episode" aria-hidden="true"></span>'
        : "",
      bucket.estimatedUpdates
        ? '<span class="calendar-date-dot calendar-date-dot--estimated" aria-hidden="true"></span>'
        : "",
      bucket.reservations || bucket.placeholderSchedules
        ? '<span class="calendar-date-dot calendar-date-dot--reservation" aria-hidden="true"></span>'
        : "",
    ].join("");
  }

  function timelineDateKeys(entryIndex, today) {
    const currentWeekDates = weekDates(today);
    const futureDates = [...entryIndex.keys()].filter(
      (dateKey) => dateKey > today && !currentWeekDates.includes(dateKey),
    );
    return [...new Set([...currentWeekDates, ...futureDates])]
      .filter(
        (dateKey) => bucketForDate(entryIndex, dateKey).entries.length > 0,
      )
      .sort();
  }

  function renderWeekStrip(entryIndex, visibleTimelineDates) {
    if (state.loading && !state.hasLoaded) {
      elements.weekStrip.innerHTML = Array.from(
        { length: 7 },
        () =>
          '<span class="calendar-week-skeleton" aria-hidden="true"></span>',
      ).join("");
      elements.weekStrip.setAttribute("aria-busy", "true");
      return;
    }
    const today = todayDateKey();
    const timelineDateSet = new Set(visibleTimelineDates);
    elements.weekStrip.innerHTML = weekDates(state.selectedDate)
      .map((dateKey) => {
        const parts = parseDateKey(dateKey);
        const bucket = bucketForDate(entryIndex, dateKey);
        const classes = ["calendar-week-day"];
        if (dateKey === today) {
          classes.push("is-today");
        }
        if (dateKey === state.selectedDate) {
          classes.push("is-selected");
        }
        if (
          bucket.seasonUpdates ||
          bucket.episodeUpdates ||
          bucket.estimatedUpdates
        ) {
          classes.push("has-updates");
        }
        if (bucket.reservations || bucket.placeholderSchedules) {
          classes.push("has-reservations");
        }
        return `
          <button
            class="${classes.join(" ")}"
            type="button"
            data-date-key="${dateKey}"
            ${
              timelineDateSet.has(dateKey)
                ? `aria-controls="calendar-day-${dateKey}"`
                : ""
            }
            aria-label="${formatMonthDay(dateKey)}，${
              WEEKDAY_NAMES[dayOfWeek(dateKey)]
            }，${
              bucket.total ? `${bucket.total} 项日历记录` : "暂无记录"
            }"
            aria-pressed="${dateKey === state.selectedDate}"
          >
            <span class="calendar-week-day__name">${
              dateKey === today ? "今天" : WEEKDAY_NAMES[dayOfWeek(dateKey)]
            }</span>
            <strong class="calendar-week-day__number">${parts?.day ?? "--"}</strong>
            <span class="calendar-week-day__count">${
              bucket.total ? `${bucket.total} 项` : "暂无"
            }</span>
            <span class="calendar-week-day__markers">${dateMarkerHtml(
              bucket,
            )}</span>
          </button>
        `;
      })
      .join("");
    elements.weekStrip.setAttribute("aria-busy", "false");
  }

  function renderWeekTimeline(entryIndex, visibleTimelineDates) {
    if (state.loading && !state.hasLoaded) {
      elements.weekTimeline.innerHTML = Array.from(
        { length: 3 },
        () => `
          <div class="calendar-week-timeline-skeleton" aria-hidden="true">
            <span class="calendar-week-timeline-skeleton__date"></span>
            <span class="calendar-week-timeline-skeleton__card"></span>
          </div>
        `,
      ).join("");
      elements.weekTimeline.setAttribute("aria-busy", "true");
      return;
    }

    const today = todayDateKey();
    elements.weekTimeline.setAttribute(
      "aria-label",
      "当前周有更新的日期，以及未来全部更新",
    );
    elements.weekTimeline.innerHTML = visibleTimelineDates
      .map((dateKey) => {
        const bucket = bucketForDate(entryIndex, dateKey);
        const dateClasses = ["calendar-week-timeline__date"];
        if (dateKey === today) {
          dateClasses.push("is-today");
        }
        if (dateKey === state.selectedDate) {
          dateClasses.push("is-selected");
        }
        const dateLabel = relativeDateLabel(dateKey);
        const countLabel = `${bucket.total} 项`;
        return `
          <section
            class="calendar-week-timeline__group"
            id="calendar-day-${dateKey}"
            data-timeline-date="${dateKey}"
            role="listitem"
            tabindex="-1"
            aria-labelledby="calendar-timeline-date-${dateKey}"
          >
            <div class="${dateClasses.join(" ")}">
              <strong id="calendar-timeline-date-${dateKey}">${dateLabel}</strong>
              <time datetime="${dateKey}">${formatMonthDay(dateKey)}</time>
              <span>${WEEKDAY_NAMES[dayOfWeek(dateKey)]} · ${countLabel}</span>
            </div>
            <div class="calendar-week-timeline__entries">
              ${bucket.entries.map(entryCardHtml).join("")}
            </div>
          </section>
        `;
      })
      .join("");
    if (visibleTimelineDates.length === 0) {
      elements.weekTimeline.innerHTML =
        '<p class="calendar-week-timeline__empty" role="status">当前周和未来日期暂时都没有短剧更新排期或预约档期。</p>';
    }
    elements.weekTimeline.setAttribute("aria-busy", "false");
  }

  function scrollWeekTimelineTo(dateKey) {
    const target = elements.weekTimeline.querySelector(
      `[data-timeline-date="${dateKey}"]`,
    );
    if (!target) {
      return;
    }
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    target.focus({ preventScroll: true });
  }

  function syncWeekTimelineSelection() {
    for (const group of elements.weekTimeline.querySelectorAll(
      "[data-timeline-date]",
    )) {
      group
        .querySelector(".calendar-week-timeline__date")
        ?.classList.toggle(
          "is-selected",
          group.dataset.timelineDate === state.selectedDate,
        );
    }
  }

  function renderMonthGrid(entryIndex) {
    if (state.loading && !state.hasLoaded) {
      elements.monthGrid.innerHTML = Array.from(
        { length: 42 },
        () =>
          '<span class="calendar-month-skeleton" aria-hidden="true"></span>',
      ).join("");
      elements.monthGrid.setAttribute("aria-busy", "true");
      return;
    }
    const selectedParts = parseDateKey(state.selectedDate);
    const firstDateKey = `${selectedParts.year}-${padNumber(
      selectedParts.month,
    )}-01`;
    const firstGridDate = startOfWeek(firstDateKey);
    const today = todayDateKey();
    const weeks = [];
    for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
      const days = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const dateKey = addDays(firstGridDate, weekIndex * 7 + dayIndex);
        const parts = parseDateKey(dateKey);
        const bucket = bucketForDate(entryIndex, dateKey);
        const isOutside = parts.month !== selectedParts.month;
        const classes = ["calendar-month-day"];
        if (isOutside) {
          classes.push("is-outside");
        }
        if (dateKey === today) {
          classes.push("is-today");
        }
        if (dateKey === state.selectedDate) {
          classes.push("is-selected");
        }
        if (
          bucket.seasonUpdates ||
          bucket.episodeUpdates ||
          bucket.estimatedUpdates
        ) {
          classes.push("has-updates");
        }
        if (bucket.reservations || bucket.placeholderSchedules) {
          classes.push("has-reservations");
        }
        days.push(`
          <button
            class="${classes.join(" ")}"
            type="button"
            role="gridcell"
            data-date-key="${dateKey}"
            tabindex="${dateKey === state.selectedDate ? "0" : "-1"}"
            aria-selected="${dateKey === state.selectedDate}"
            aria-label="${formatMonthDay(dateKey)}，${
              bucket.total ? `${bucket.total} 项日历记录` : "暂无记录"
            }"
          >
            <span class="calendar-month-day__number">${parts.day}</span>
            <span class="calendar-month-day__markers">${dateMarkerHtml(
              bucket,
            )}</span>
            <span class="calendar-month-day__count">${
              bucket.total ? `${bucket.total} 项` : ""
            }</span>
          </button>
        `);
      }
      weeks.push(
        `<div class="calendar-month-week" role="row">${days.join("")}</div>`,
      );
    }
    elements.monthGrid.innerHTML = weeks.join("");
    elements.monthGrid.setAttribute("aria-busy", "false");
  }

  function typeMeta(type) {
    return (
      {
        update: null,
        reservation: {
          label: "账号预约",
          icon: "bookmark",
        },
        "placeholder-schedule": {
          label: "预约档期",
          icon: "calendar",
        },
        placeholder: {
          label: "待公布",
          icon: "hourglass",
        },
      }[type] || {
        label: "更新",
        icon: "play",
      }
    );
  }

  function updateTypeMeta(entry) {
    if (entry.estimated) {
      return {
        label: "预计更新",
        icon: "clock",
      };
    }
    return entry.kind === "season"
      ? {
          label: "新季上线",
          icon: "calendar",
        }
      : {
          label: "集数更新",
          icon: "play",
        };
  }

  function entryMetaText(entry) {
    if (entry.type === "reservation") {
      if (finiteNumber(entry.episodeCount)) {
        return entry.dateKey
          ? `官方预约档期 · 全 ${entry.episodeCount} 集`
          : `等待上线日期 · 全 ${entry.episodeCount} 集`;
      }
      return entry.dateKey ? "官方预约档期" : "等待官方上线日期";
    }
    if (entry.type === "placeholder-schedule") {
      return "收藏占位季档期";
    }
    if (entry.type === "placeholder") {
      return "官方占位季";
    }
    const parts = [];
    if (finiteNumber(entry.episodeCount)) {
      parts.push(
        entry.kind === "episode"
          ? `${entry.estimated ? "预计" : ""}更新至 ${
              entry.episodeCount
            } 集`
          : `当前 ${entry.episodeCount} 集`,
      );
    }
    if (finiteNumber(entry.addedEpisodeCount) && entry.addedEpisodeCount > 0) {
      parts.push(
        `${entry.estimated ? "预计 +" : "+"}${
          entry.addedEpisodeCount
        } 集`,
      );
    }
    return parts.join(" · ");
  }

  function coverHtml(entry) {
    const coverUrl = safeImageUrl(entry.coverUrl);
    const coverSrc =
      window.DramaCover?.url(coverUrl, entry.seasonId) || coverUrl;
    const coverAttributes =
      window.DramaCover?.attributes(coverUrl, entry.seasonId) || "";
    return `
      <div class="calendar-entry__cover ${coverSrc ? "has-image" : ""}" data-cover-container>
        ${
          coverSrc
            ? `<img src="${escapeHtml(
                coverSrc,
              )}" ${coverAttributes} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : ""
        }
        <span class="calendar-entry__cover-fallback" data-cover-fallback ${
          coverSrc ? "hidden" : ""
        }>${icon("image")}</span>
      </div>
    `;
  }

  function entryCardHtml(entry) {
    const type = entry.type === "update"
      ? updateTypeMeta(entry)
      : typeMeta(entry.type);
    const seasonSubtitle =
      entry.seasonTitle && entry.seasonTitle !== entry.seriesTitle
        ? entry.seasonTitle
        : "";
    const metaText = entryMetaText(entry);
    const linkUrl = safeLinkUrl(entry.detailUrl);
    const timeText =
      entry.estimated && entry.dateKey
        ? `预计 ${formatMonthDay(entry.dateKey)}${
            entry.scheduleTimeKnown && entry.scheduleTimeLabel
              ? ` ${entry.scheduleTimeLabel}`
              : ""
          }更新`
        : ["reservation", "placeholder-schedule"].includes(entry.type) &&
            entry.dateKey
          ? `预计 ${formatMonthDay(entry.dateKey)}上线`
          : !["reservation", "placeholder-schedule"].includes(entry.type) &&
              entry.occurredAt
          ? formatInstantTime(entry.occurredAt)
          : "";
    return `
      <article
        class="calendar-entry calendar-entry--${escapeHtml(entry.type)} calendar-entry--${escapeHtml(
          entry.kind,
        )}${entry.estimated ? " calendar-entry--estimated" : ""}"
        aria-label="${escapeHtml(`${type.label}：${entry.seriesTitle}`)}"
      >
        ${coverHtml(entry)}
        <div class="calendar-entry__body">
          <div class="calendar-entry__topline">
            <span class="calendar-entry__type">
              ${icon(type.icon)}
              <span>${escapeHtml(type.label)}</span>
            </span>
            ${
              entry.seasonLabel
                ? `<span class="calendar-entry__season">${escapeHtml(
                    entry.seasonLabel,
                  )}</span>`
                : ""
            }
          </div>
          <h3 class="calendar-entry__title">${escapeHtml(
            entry.seriesTitle,
          )}</h3>
          ${
            seasonSubtitle
              ? `<p class="calendar-entry__subtitle">${escapeHtml(
                  seasonSubtitle,
                )}</p>`
              : ""
          }
          ${
            metaText
              ? `<p class="calendar-entry__meta">${escapeHtml(
                  metaText,
                )}</p>`
              : ""
          }
          ${
            entry.expectedText
              ? `<p class="calendar-entry__note">${escapeHtml(
                  entry.expectedText,
                )}</p>`
              : ""
          }
          <div class="calendar-entry__footer">
            ${
              timeText
                ? `<time datetime="${escapeHtml(
                    entry.datePrecision === "day"
                      ? entry.dateKey
                      : entry.occurredAt,
                  )}">${escapeHtml(timeText)}</time>`
                : `<span>官方日期待公布</span>`
            }
            ${
              linkUrl
                ? `<a href="${escapeHtml(
                    linkUrl,
                  )}" target="_blank" rel="noopener noreferrer">红果查看${icon(
                    "arrow-up-right",
                  )}</a>`
                : ""
            }
          </div>
        </div>
      </article>
    `;
  }

  function emptyStateHtml({
    title,
    description,
    iconName = "calendar-check",
    className = "",
  }) {
    return `
      <div class="calendar-empty ${className}">
        <span class="calendar-empty__icon">${icon(iconName)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
      </div>
    `;
  }

  function skeletonCardsHtml(count = 3) {
    return Array.from(
      { length: count },
      () => `
        <div class="calendar-entry-skeleton" aria-hidden="true">
          <span class="calendar-entry-skeleton__cover"></span>
          <span class="calendar-entry-skeleton__body">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
      `,
    ).join("");
  }

  function renderSelectedDay(entryIndex) {
    if (state.loading && !state.hasLoaded) {
      elements.entryList.innerHTML = skeletonCardsHtml();
      elements.entryList.setAttribute("aria-busy", "true");
      return;
    }
    const bucket = bucketForDate(entryIndex, state.selectedDate);
    elements.entryList.innerHTML =
      bucket.entries.length > 0
        ? bucket.entries.map(entryCardHtml).join("")
        : emptyStateHtml({
            title: "这一天还没有日历项",
            description:
              "追更发现新季、新集，官方更新规则产生预计排期，或账号预约出现可靠上线日期后，会自动出现在这里。",
          });
    elements.entryList.setAttribute("aria-busy", "false");
  }

  function renderPending() {
    if (state.loading && !state.hasLoaded) {
      elements.pendingSection.hidden = true;
      return;
    }
    const pending = filterPendingEntries(state.data.pending);
    const hasPending = pending.length > 0;
    if (!hasPending) {
      state.pendingExpanded = false;
    }
    elements.pendingSection.hidden = !hasPending;
    elements.pendingToggle.setAttribute(
      "aria-expanded",
      String(state.pendingExpanded),
    );
    elements.pendingBody.hidden = !hasPending || !state.pendingExpanded;
    elements.pendingSection.classList.toggle(
      "is-expanded",
      hasPending && state.pendingExpanded,
    );
    elements.pendingCount.hidden = !hasPending;
    elements.pendingCount.textContent = pending.length
      ? `${pending.length} 项`
      : "";
    elements.pendingList.innerHTML = pending.length
      ? pending.map(entryCardHtml).join("")
      : "";
  }

  function renderStatus() {
    if (state.loading) {
      elements.status.hidden = false;
      elements.status.className = "calendar-status is-loading";
      elements.status.innerHTML = `${icon(
        "refresh",
        "icon calendar-status__icon",
      )}<span>${
        state.hasLoaded ? "正在刷新更新日历…" : "正在读取追更与预约信息…"
      }</span>`;
      return;
    }
    if (state.errors.length > 0) {
      elements.status.hidden = false;
      elements.status.className = "calendar-status is-warning";
      elements.status.innerHTML = `
        ${icon("alert", "icon calendar-status__icon")}
        <span>${escapeHtml(state.errors.join(" "))}</span>
        <button class="calendar-status__retry" type="button" data-retry-calendar>重试</button>
      `;
      return;
    }
    elements.status.hidden = true;
    elements.status.className = "calendar-status";
    elements.status.replaceChildren();
  }

  function render() {
    const visibleEntries = filterCalendarEntries(state.data.entries);
    const entryIndex = buildEntryIndex(visibleEntries);
    const visibleTimelineDates = timelineDateKeys(
      entryIndex,
      todayDateKey(),
    );
    elements.workspace.dataset.view = state.view;
    elements.workspace.dataset.type = state.typeFilter;
    elements.weekView.hidden = state.view !== "week";
    elements.monthView.hidden = state.view !== "month";
    elements.dayPanel.hidden = state.view === "week";
    for (const button of elements.viewButtons) {
      const active = button.dataset.calendarView === state.view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    for (const button of elements.typeButtons) {
      const active = button.dataset.calendarType === state.typeFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    renderOverview(entryIndex);
    renderPeriodControls();
    renderWeekStrip(entryIndex, visibleTimelineDates);
    renderWeekTimeline(entryIndex, visibleTimelineDates);
    syncWeekTimelineSelection();
    renderMonthGrid(entryIndex);
    renderSelectedDay(entryIndex);
    renderPending();
    renderStatus();
  }

  function updateWeekView({ focus = false, scrollTimeline = false } = {}) {
    const visibleEntries = filterCalendarEntries(state.data.entries);
    const entryIndex = buildEntryIndex(visibleEntries);
    const visibleTimelineDates = timelineDateKeys(
      entryIndex,
      todayDateKey(),
    );
    renderOverview(entryIndex);
    renderPeriodControls();
    renderWeekStrip(entryIndex, visibleTimelineDates);
    syncWeekTimelineSelection();
    if (scrollTimeline) {
      scrollWeekTimelineTo(state.selectedDate);
    }
    if (focus) {
      elements.weekStrip
        .querySelector(`[data-date-key="${state.selectedDate}"]`)
        ?.focus({ preventScroll: true });
    }
  }

  function selectDate(dateKey, { focus = false } = {}) {
    if (!parseDateKey(dateKey)) {
      return;
    }
    state.selectedDate = dateKey;
    if (state.view === "week") {
      updateWeekView({ focus });
      return;
    }
    render();
    if (focus) {
      const container =
        state.view === "month" ? elements.monthGrid : elements.weekStrip;
      const target = container.querySelector(
        `[data-date-key="${dateKey}"]`,
      );
      target?.focus({ preventScroll: true });
    }
  }

  function switchView(view, { focus = false } = {}) {
    if (view !== "week" && view !== "month") {
      return;
    }
    state.view = view;
    storeView(view);
    render();
    if (focus) {
      const activeButton = elements.viewButtons.find(
        (button) => button.dataset.calendarView === view,
      );
      activeButton?.focus({ preventScroll: true });
    }
  }

  function switchType(type, { focus = false } = {}) {
    if (!["all", "season", "episode"].includes(type)) {
      return;
    }
    state.typeFilter = type;
    storeType(type);
    render();
    if (focus) {
      const activeButton = elements.typeButtons.find(
        (button) => button.dataset.calendarType === type,
      );
      activeButton?.focus({ preventScroll: true });
    }
  }

  function togglePending() {
    if (!state.data.pending.length) {
      return;
    }
    state.pendingExpanded = !state.pendingExpanded;
    renderPending();
  }

  function movePeriod(direction) {
    state.selectedDate =
      state.view === "month"
        ? addMonthsClamped(state.selectedDate, direction)
        : addDays(state.selectedDate, direction * 7);
    if (state.view === "week") {
      updateWeekView();
      return;
    }
    render();
  }

  function handleCalendarKeydown(event) {
    const focusedDay = event.target.closest?.("[data-date-key]");
    if (!focusedDay) {
      return;
    }
    const anchorDate = parseDateKey(focusedDay.dataset.dateKey)
      ? focusedDay.dataset.dateKey
      : state.selectedDate;
    let nextDate = null;
    if (event.key === "ArrowLeft") {
      nextDate = addDays(anchorDate, -1);
    } else if (event.key === "ArrowRight") {
      nextDate = addDays(anchorDate, 1);
    } else if (event.key === "ArrowUp") {
      nextDate = addDays(anchorDate, -7);
    } else if (event.key === "ArrowDown") {
      nextDate = addDays(anchorDate, 7);
    } else if (event.key === "Home") {
      nextDate = startOfWeek(anchorDate);
    } else if (event.key === "End") {
      nextDate = addDays(startOfWeek(anchorDate), 6);
    }
    if (!nextDate) {
      return;
    }
    event.preventDefault();
    selectDate(nextDate, { focus: true });
  }

  function upcomingReservationCategory(accountPayload) {
    return (
      accountPayload?.account?.snapshot?.categories?.reservationsUpcoming ||
      null
    );
  }

  function shouldRefreshAccountSnapshot(accountPayload, { manual }) {
    const account = accountPayload?.account;
    if (!account?.authenticated || account.refreshing) {
      return false;
    }
    const category = upcomingReservationCategory(accountPayload);
    if (!category || category.status !== "ok") {
      return true;
    }
    if (manual) {
      return true;
    }
    const fetchedAt = Date.parse(
      account?.snapshot?.fetchedAt ||
        category.fetchedAt ||
        category.updatedAt ||
        "",
    );
    return (
      !Number.isFinite(fetchedAt) ||
      Date.now() - fetchedAt >= ACCOUNT_SNAPSHOT_MAX_AGE_MS
    );
  }

  async function loadAccountPayload() {
    return {
      payload: await requestJson("/api/account/status"),
      warning: "",
    };
  }

  function refreshAccountSnapshotInBackground({ reportError = false } = {}) {
    if (state.accountRefreshPromise) {
      return state.accountRefreshPromise;
    }
    if (!state.accountPayload?.account?.authenticated) {
      return Promise.resolve();
    }
    state.accountRefreshPromise = (async () => {
      try {
        const refreshed = await requestJson("/api/account/refresh", {
          method: "POST",
          body: {},
          timeoutMs: 30_000,
        });
        if (!refreshed?.account) {
          return;
        }
        state.accountPayload = {
          ...state.accountPayload,
          account: refreshed.account,
        };
        if (state.dashboard && state.hasLoaded) {
          state.data = buildCalendarData(
            state.dashboard,
            state.logPayload,
            state.accountPayload,
          );
          state.errors = state.errors.filter(
            (message) => !message.startsWith("账号预约"),
          );
          render();
        }
      } catch (error) {
        if (reportError) {
          state.errors = [
            ...state.errors.filter(
              (message) => !message.startsWith("账号预约"),
            ),
            `账号预约刷新失败：${
              error?.message || "请稍后重试"
            } 追更更新仍可正常查看。`,
          ];
          renderStatus();
        }
      } finally {
        state.accountRefreshPromise = null;
      }
    })();
    return state.accountRefreshPromise;
  }

  async function refreshCalendar({ silent = false, manual = false } = {}) {
    if (state.fetching) {
      return;
    }
    state.fetching = true;
    const requestToken = ++state.requestToken;
    state.loading = true;
    state.errors = [];
    elements.refresh.disabled = true;
    elements.refresh.classList.add("is-busy");
    elements.refresh.setAttribute("aria-busy", "true");
    if (!state.hasLoaded) {
      render();
    } else {
      renderStatus();
    }

    let shouldRefreshAccountSnapshotInBackground = false;
    try {
      const offset = 0;
      const shouldRefreshAccount = !silent || !state.accountPayload;
      const accountRequest = shouldRefreshAccount
        ? loadAccountPayload()
        : Promise.resolve({
            payload: state.accountPayload,
            warning: "",
          });
      const results = await Promise.allSettled([
        requestJson("/api/state"),
        requestJson(`/api/logs?offset=${offset}&limit=${LOG_PAGE_SIZE}`),
        accountRequest,
      ]);
      if (requestToken !== state.requestToken) {
        return;
      }

      const stateResult = results[0];
      const logResult = results[1];
      const accountResult = results[2];
      const accountOutcome =
        accountResult.status === "fulfilled" ? accountResult.value : null;
      const accountPayload =
        accountOutcome?.payload || state.accountPayload;
      const errors = [];
      if (stateResult.status === "fulfilled") {
        const dashboard = stateResult.value;
        const logPayload =
          logResult.status === "fulfilled" ? logResult.value : null;
        if (accountOutcome) {
          state.accountPayload = accountOutcome.payload;
        }
        state.dashboard = dashboard;
        state.logPayload = logPayload;
        state.data = buildCalendarData(
          dashboard,
          logPayload,
          accountPayload,
        );
        shouldRefreshAccountSnapshotInBackground =
          shouldRefreshAccount &&
          shouldRefreshAccountSnapshot(accountPayload, { manual });
        state.hasLoaded = true;
        state.lastRefreshAt = Date.now();
        if (logResult.status === "rejected") {
          errors.push("追更日志未加载，当前使用季数据生成日历。");
        }
        if (accountResult.status === "rejected") {
          errors.push("账号预约暂未读取，其他日历内容不受影响。");
        } else if (accountOutcome?.warning) {
          errors.push(accountOutcome.warning);
        }
      } else {
        const message =
          stateResult.reason?.message || "追更信息读取失败，请稍后重试。";
        errors.push(
          state.hasLoaded
            ? `刷新失败，继续显示上次数据。${message}`
            : message,
        );
      }
      state.errors = errors;
    } catch (error) {
      state.errors = [
        state.hasLoaded
          ? `刷新失败，继续显示上次数据。${
              error?.message || "未知错误"
            }`
          : error?.message || "更新日历读取失败，请稍后重试。",
      ];
    } finally {
      if (requestToken === state.requestToken) {
        state.loading = false;
        state.fetching = false;
        elements.refresh.disabled = false;
        elements.refresh.classList.remove("is-busy");
        elements.refresh.setAttribute("aria-busy", "false");
        render();
        if (shouldRefreshAccountSnapshotInBackground) {
          void refreshAccountSnapshotInBackground({
            reportError: manual,
          });
        }
      }
    }
  }

  function handleListImageError(event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) {
      return;
    }
    const fallback = image.nextElementSibling;
    image.hidden = true;
    if (fallback) {
      fallback.hidden = false;
    }
  }

  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchView(button.dataset.calendarView, { focus: true });
    });
  });
  elements.typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchType(button.dataset.calendarType, { focus: true });
    });
  });

  elements.previous.addEventListener("click", () => movePeriod(-1));
  elements.next.addEventListener("click", () => movePeriod(1));
  elements.today.addEventListener("click", () => {
    const today = todayDateKey();
    if (state.view !== "week") {
      selectDate(today, { focus: true });
      return;
    }
    selectDate(today);
    scrollWeekTimelineTo(today);
  });
  elements.refresh.addEventListener("click", () => {
    void refreshCalendar({ manual: true });
  });
  elements.pendingToggle.addEventListener("click", togglePending);
  elements.status.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-calendar]")) {
      void refreshCalendar({ manual: true });
    }
  });
  elements.weekStrip.addEventListener("click", (event) => {
    const day = event.target.closest("[data-date-key]");
    if (day) {
      const dateKey = day.dataset.dateKey;
      selectDate(dateKey);
      scrollWeekTimelineTo(dateKey);
    }
  });
  elements.monthGrid.addEventListener("click", (event) => {
    const day = event.target.closest("[data-date-key]");
    if (day) {
      selectDate(day.dataset.dateKey, { focus: true });
    }
  });
  elements.weekStrip.addEventListener("keydown", handleCalendarKeydown);
  elements.monthGrid.addEventListener("keydown", handleCalendarKeydown);
  elements.entryList.addEventListener("error", handleListImageError, true);
  elements.pendingList.addEventListener("error", handleListImageError, true);

  window.setInterval(() => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - state.lastRefreshAt >= AUTO_REFRESH_MS
    ) {
      void refreshCalendar({ silent: true });
    }
  }, AUTO_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - state.lastRefreshAt >= AUTO_REFRESH_MS
    ) {
      void refreshCalendar({ silent: true });
    }
  });

  render();
  void refreshCalendar();
})();
