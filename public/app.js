const elements = {
  mainContent: document.querySelector("#main-content"),
  openAddDialog: document.querySelector("#open-add-dialog"),
  addDialog: document.querySelector("#add-dialog"),
  addForm: document.querySelector("#add-form"),
  addSubmit: document.querySelector("#add-submit"),
  seriesSearchField: document.querySelector("#series-search-field"),
  shareInput: document.querySelector("#share-input"),
  shareInputClear: document.querySelector("#share-input-clear"),
  shareFeedback: document.querySelector("#share-feedback"),
  seriesSearchPanel: document.querySelector("#series-search-panel"),
  seriesSearchStatus: document.querySelector("#series-search-status"),
  seriesSearchList: document.querySelector("#series-search-list"),
  subscriptionList: document.querySelector("#subscription-list"),
  watchlistTitle: document.querySelector("#watchlist-title"),
  watchlistSummary: document.querySelector("#watchlist-summary"),
  watchlistSearch: document.querySelector("#watchlist-search"),
  watchlistSearchInput: document.querySelector("#watchlist-search-input"),
  watchlistSearchClear: document.querySelector("#watchlist-search-clear"),
  watchlistSearchPanel: document.querySelector("#watchlist-search-panel"),
  watchlistSearchStatus: document.querySelector("#watchlist-search-status"),
  watchlistSearchList: document.querySelector("#watchlist-search-list"),
  watchlistUpdateFilter: document.querySelector("#watchlist-update-filter"),
  watchlistUpdateFilterBadge: document.querySelector(
    "#watchlist-update-filter-badge",
  ),
  checkAll: document.querySelector("#check-all"),
  checkIndicator: document.querySelector("#check-indicator"),
  openEvents: document.querySelector("#open-events"),
  eventCount: document.querySelector("#event-count"),
  eventList: document.querySelector("#event-list"),
  eventsDialog: document.querySelector("#events-dialog"),
  statSeries: document.querySelector("#stat-series"),
  statSeasons: document.querySelector("#stat-seasons"),
  statLastCheck: document.querySelector("#stat-last-check"),
  notificationState: document.querySelector("#notification-state"),
  openScreenshotImport: document.querySelector("#open-screenshot-import"),
  screenshotDialog: document.querySelector("#screenshot-import-dialog"),
  screenshotContent: document.querySelector("#screenshot-import-content"),
  screenshotFiles: document.querySelector("#screenshot-files"),
  screenshotPickerLabel: document.querySelector("#screenshot-picker-label"),
  screenshotPickerStatus: document.querySelector("#screenshot-picker-status"),
  screenshotSelection: document.querySelector("#screenshot-selection"),
  screenshotFileCount: document.querySelector("#screenshot-file-count"),
  screenshotFileList: document.querySelector("#screenshot-file-list"),
  screenshotFeedback: document.querySelector("#screenshot-feedback"),
  screenshotResults: document.querySelector("#screenshot-results"),
  screenshotResultsTitle: document.querySelector("#screenshot-results-title"),
  screenshotResultsSummary: document.querySelector(
    "#screenshot-results-summary",
  ),
  screenshotSelectionCount: document.querySelector(
    "#screenshot-selection-count",
  ),
  selectAllScreenshots: document.querySelector("#screenshot-select-all"),
  clearScreenshotSelection: document.querySelector(
    "#screenshot-clear-selection",
  ),
  screenshotResultList: document.querySelector("#screenshot-result-list"),
  screenshotImportOutcomes: document.querySelector(
    "#screenshot-import-outcomes",
  ),
  screenshotOutcomeTitle: document.querySelector("#screenshot-outcomes-title"),
  screenshotOutcomeList: document.querySelector("#screenshot-outcome-list"),
  analyzeScreenshots: document.querySelector("#analyze-screenshots"),
  importScreenshots: document.querySelector("#import-screenshots"),
  openAccountImport: document.querySelector("#open-account-import"),
  accountDialog: document.querySelector("#account-import-dialog"),
  accountContent: document.querySelector("#account-import-content"),
  accountLoginView: document.querySelector("#account-login-view"),
  accountQrImage: document.querySelector("#account-qr-image"),
  accountQrPlaceholder: document.querySelector("#account-qr-placeholder"),
  accountQrSpinner: document.querySelector(".account-qr-spinner"),
  accountQrPlaceholderText: document.querySelector(
    "#account-qr-placeholder-text",
  ),
  accountQrExpiry: document.querySelector("#account-qr-expiry"),
  accountLoginStatus: document.querySelector("#account-login-status"),
  accountLoginRetry: document.querySelector("#account-login-retry"),
  accountLoginTabs: [
    ...document.querySelectorAll("[data-account-login-method]"),
  ],
  accountLoginPanels: [
    ...document.querySelectorAll("[data-account-login-panel]"),
  ],
  accountSmsForm: document.querySelector("#account-sms-form"),
  accountSmsCountryCode: document.querySelector("#account-sms-country-code"),
  accountSmsMobile: document.querySelector("#account-sms-mobile"),
  accountSmsCode: document.querySelector("#account-sms-code"),
  accountSmsSendCode: document.querySelector("#account-sms-send-code"),
  accountSmsSubmit: document.querySelector("#account-sms-submit"),
  accountSmsUseQr: document.querySelector("#account-sms-use-qr"),
  accountSmsLoginStatus: document.querySelector("#account-sms-login-status"),
  accountProfileView: document.querySelector("#account-profile-view"),
  accountProfileName: document.querySelector("#account-profile-name"),
  accountSnapshotTime: document.querySelector("#account-snapshot-time"),
  accountFavoriteCount: document.querySelector("#account-favorite-count"),
  accountReservationCount: document.querySelector(
    "#account-reservation-count",
  ),
  accountSyncLastTime: document.querySelector("#account-sync-last-time"),
  accountSyncMessage: document.querySelector("#account-sync-message"),
  accountSyncState: document.querySelector("#account-sync-state"),
  accountSyncDetails: document.querySelector("#account-sync-details"),
  accountRefresh: document.querySelector("#account-refresh"),
  accountLogout: document.querySelector("#account-logout"),
  accountFeedback: document.querySelector("#account-import-feedback"),
  openSettings: document.querySelector("#open-settings"),
  settingsDialog: document.querySelector("#settings-dialog"),
  settingsForm: document.querySelector("#settings-form"),
  settingsTabs: [
    ...document.querySelectorAll("[data-settings-tab]"),
  ],
  settingsPanels: [
    ...document.querySelectorAll("[data-settings-panel]"),
  ],
  saveSettingsLabel: document.querySelector(
    "[data-save-settings-label]",
  ),
  settingsAccountName: document.querySelector("#settings-account-name"),
  settingsAccountDescription: document.querySelector(
    "#settings-account-description",
  ),
  settingsAccountSnapshotTime: document.querySelector(
    "#settings-account-snapshot-time",
  ),
  settingsAccountSummary: document.querySelector(
    "#settings-account-summary",
  ),
  settingsAccountFavoriteCount: document.querySelector(
    "#settings-account-favorite-count",
  ),
  settingsAccountReservationCount: document.querySelector(
    "#settings-account-reservation-count",
  ),
  settingsAccountLastTime: document.querySelector(
    "#settings-account-last-time",
  ),
  settingsAccountLogin: document.querySelector("#settings-account-login"),
  settingsAccountSync: document.querySelector("#settings-account-sync"),
  settingsAccountSyncDetailsPanel: document.querySelector(
    "#settings-account-sync-details-panel",
  ),
  settingsAccountSyncDetails: document.querySelector(
    "#settings-account-sync-details",
  ),
  settingsAccountLogout: document.querySelector("#settings-account-logout"),
  settingsAccountStatus: document.querySelector("#settings-account-status"),
  settingsAccountStatusTitle: document.querySelector(
    "#settings-account-status-title",
  ),
  settingsAccountStatusSummary: document.querySelector(
    "#settings-account-status-summary",
  ),
  accountSyncCron: document.querySelector("#account-sync-cron"),
  notificationTemplates: [
    ...document.querySelectorAll("[data-notification-template]"),
  ],
  proxySettings: {
    root: document.querySelector("[data-proxy-settings]"),
    enabled: document.querySelector("#proxy-enabled"),
    config: document.querySelector("[data-proxy-config]"),
    status: document.querySelector("[data-proxy-status]"),
    url: document.querySelector("#proxy-url"),
    clear: document.querySelector("#clear-proxy"),
  },
  proxyChannelInputs: [
    ...document.querySelectorAll("[data-proxy-channel]"),
  ],
  notificationChannels: {
    bark: {
      root: document.querySelector('[data-notification-channel="bark"]'),
      enabled: document.querySelector("#enabled-bark"),
      config: document.querySelector(
        '[data-notification-channel="bark"] [data-channel-config]',
      ),
      status: document.querySelector(
        '[data-notification-channel="bark"] [data-channel-status]',
      ),
      key: document.querySelector("#bark-key"),
      clear: document.querySelector("#clear-bark"),
    },
    ntfy: {
      root: document.querySelector('[data-notification-channel="ntfy"]'),
      enabled: document.querySelector("#enabled-ntfy"),
      config: document.querySelector(
        '[data-notification-channel="ntfy"] [data-channel-config]',
      ),
      status: document.querySelector(
        '[data-notification-channel="ntfy"] [data-channel-status]',
      ),
      topic: document.querySelector("#ntfy-topic"),
      token: document.querySelector("#ntfy-token"),
      clear: document.querySelector("#clear-ntfy"),
    },
    telegram: {
      root: document.querySelector('[data-notification-channel="telegram"]'),
      enabled: document.querySelector("#enabled-telegram"),
      config: document.querySelector(
        '[data-notification-channel="telegram"] [data-channel-config]',
      ),
      status: document.querySelector(
        '[data-notification-channel="telegram"] [data-channel-status]',
      ),
      botToken: document.querySelector("#telegram-bot-token"),
      chatId: document.querySelector("#telegram-chat-id"),
      clear: document.querySelector("#clear-telegram"),
    },
    wecom: {
      root: document.querySelector('[data-notification-channel="wecom"]'),
      enabled: document.querySelector("#enabled-wecom"),
      config: document.querySelector(
        '[data-notification-channel="wecom"] [data-channel-config]',
      ),
      status: document.querySelector(
        '[data-notification-channel="wecom"] [data-channel-status]',
      ),
      key: document.querySelector("#wecom-key"),
      clear: document.querySelector("#clear-wecom"),
    },
    dingtalk: {
      root: document.querySelector('[data-notification-channel="dingtalk"]'),
      enabled: document.querySelector("#enabled-dingtalk"),
      config: document.querySelector(
        '[data-notification-channel="dingtalk"] [data-channel-config]',
      ),
      status: document.querySelector(
        '[data-notification-channel="dingtalk"] [data-channel-status]',
      ),
      accessToken: document.querySelector("#dingtalk-access-token"),
      secret: document.querySelector("#dingtalk-secret"),
      clear: document.querySelector("#clear-dingtalk"),
    },
  },
  checkCron: document.querySelector("#check-cron"),
  staleCompletionDays: document.querySelector("#stale-completion-days"),
  episodeNotificationWindow: document.querySelector(
    "#episode-notification-window",
  ),
  discoveryReminderDuration: document.querySelector(
    "#discovery-reminder-duration",
  ),
  discoveryReminderUnit: document.querySelector(
    "#discovery-reminder-unit",
  ),
  discoveryReminderCron: document.querySelector(
    "#discovery-reminder-cron",
  ),
  discoveryReminderStatus: document.querySelector(
    "[data-discovery-reminder-status]",
  ),
  settingsFeedback: document.querySelector("#settings-feedback"),
  testNotifications: document.querySelector("#test-notifications"),
  saveSettings: document.querySelector("#save-settings"),
  seasonDialog: document.querySelector("#season-dialog"),
  seasonForm: document.querySelector("#season-form"),
  seasonShareInput: document.querySelector("#season-share-input"),
  seasonFeedback: document.querySelector("#season-feedback"),
  seasonContext: document.querySelector("#season-context"),
  seasonGroupId: document.querySelector("#season-group-id"),
  seasonSubmit: document.querySelector("#season-submit"),
  statusDialog: document.querySelector("#status-dialog"),
  statusForm: document.querySelector("#status-form"),
  statusContext: document.querySelector("#status-context"),
  statusFeedback: document.querySelector("#status-feedback"),
  statusSubmit: document.querySelector("#status-submit"),
  deleteDialog: document.querySelector("#delete-dialog"),
  deleteForm: document.querySelector("#delete-form"),
  deleteContext: document.querySelector("#delete-context"),
  deleteFeedback: document.querySelector("#delete-feedback"),
  deleteSubmit: document.querySelector("#delete-submit"),
  scrollControls: document.querySelector("#scroll-controls"),
  scrollToTop: document.querySelector("#scroll-to-top"),
  scrollToBottom: document.querySelector("#scroll-to-bottom"),
  toast: document.querySelector("#toast"),
  pageProgress: document.querySelector("#page-progress"),
};

const appState = {
  dashboard: null,
  activeSubscriptionId: null,
  expandedSubscriptionIds: new Set(),
  statusGlowObserver: null,
  subscriptionLoadObserver: null,
  subscriptionRenderLimit: 20,
  subscriptionRenderContext: "",
  subscriptionVisibleCount: 0,
  scrollControlsFrame: null,
  scrollControlsResizeObserver: null,
  loading: false,
  toastTimer: null,
  toastHideTimer: null,
  listMotionTimer: null,
  hasRenderedSubscriptionList: false,
  screenshotFiles: [],
  screenshotItems: [],
  screenshotPreparing: false,
  screenshotAnalyzing: false,
  screenshotImporting: false,
  screenshotFinished: false,
  screenshotSequence: 0,
  screenshotRunId: 0,
  screenshotReturnFocus: null,
  account: {
    controller: null,
    pollTimer: null,
    loginRetryTimer: null,
    qrImageRetryTimer: null,
    pollFailures: 0,
    requestGeneration: 0,
    loginId: "",
    loginExpiresAt: "",
    loginStatus: "idle",
    loginMethod: "qr",
    smsLoginId: "",
    smsStatus: "idle",
    smsRetryAfterSeconds: 0,
    smsPollTimer: null,
    smsCountdownTimer: null,
    smsBusy: false,
    smsQrFallbackRequired: false,
    data: null,
    sync: null,
    busy: false,
    returnFocus: null,
  },
  addDialogReturnFocus: null,
  settingsTab: "account",
  templateFocusedField: null,
  templateSelection: { start: 0, end: 0 },
  watchlistUpdateFilter: false,
  watchlistSearch: {
    activeIndex: -1,
    open: false,
    query: "",
    results: [],
    selectedId: null,
  },
  seriesSearch: {
    activeIndex: -1,
    controller: null,
    lastQuery: "",
    loading: false,
    open: false,
    requestId: 0,
    results: [],
    selected: null,
    timer: null,
  },
};

const SERIES_SEARCH_DELAY_MS = 320;
const SERIES_SEARCH_MAX_QUERY_LENGTH = 30;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DASHBOARD_REQUEST_TIMEOUT_MS = 12_000;
const SETTINGS_REQUEST_TIMEOUT_MS = 15_000;
const SCREENSHOT_ANALYZE_TIMEOUT_MS = 70_000;
const SCREENSHOT_IMPORT_TIMEOUT_MS = 180_000;
const LONG_ACTION_TIMEOUT_MS = 120_000;
const CHECK_ALL_TIMEOUT_MS = 300_000;
const ACCOUNT_POLL_INTERVAL_MS = 2_000;
const ACCOUNT_LOGIN_RETRY_DELAY_MS = 700;
const ACCOUNT_QR_IMAGE_RETRY_DELAY_MS = 500;
const ACCOUNT_SMS_DEFAULT_RETRY_SECONDS = 60;
const ACCOUNT_STATUS_TIMEOUT_MS = 20_000;
const ACCOUNT_SYNC_TIMEOUT_MS = 180_000;
const DEFAULT_CHECK_CRON = "11 0,6,10,12,18 * * *";
const DEFAULT_STALE_COMPLETION_DAYS = 90;
const DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES = 0;
const DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES = 2 * 24 * 60;
const DEFAULT_DISCOVERY_REMINDER_CRON = "0 */4 * * *";
const DEFAULT_ACCOUNT_SYNC_CRON = "0 3 * * *";
const DEFAULT_SUBSCRIPTION_RENDER_LIMIT = 20;
const SUBSCRIPTION_LOAD_MORE_SIZE = 10;
const MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH = 80;
const MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH = 1_200;

const notificationTemplateLabels = Object.freeze({
  detailed: "单系列详情",
  batch: "批量汇总",
  reminder: "持续提醒",
});
const notificationTemplateVariables = Object.freeze({
  detailed: [
    "appName",
    "seriesTitle",
    "checkTime",
    "updates",
    "seasonCount",
  ],
  batch: ["appName", "checkTime", "updateCount", "updates"],
  reminder: [
    "appName",
    "reminderTime",
    "updateCount",
    "updates",
  ],
});
const notificationTemplateFieldLabels = Object.freeze({
  title: "标题",
  body: "正文",
});
const notificationTemplateExamples = Object.freeze({
  detailed: {
    defaultTitle: "《万妖图录传》更新详情",
    defaultBody:
      "检查时间：2026-11-01 08:30\n\n• 发现新季：《万妖图录传第七季》，当前 80 集。\n  季上线：2026-11-01 00:04\n\n当前共收录 7 季。",
    variables: {
      appName: "短剧助手",
      seriesTitle: "万妖图录传",
      checkTime: "2026-11-01 08:30",
      updates:
        "• 发现新季：《万妖图录传第七季》，当前 80 集。\n  季上线：2026-11-01 00:04",
      seasonCount: 7,
    },
  },
  batch: {
    defaultTitle: "短剧助手 · 2 个系列有更新",
    defaultBody:
      "检查时间：2026-11-01 08:30\n\n1. 《万妖图录传》第七季 · 新季 80 集\n2. 《太玄胎珠传》 · 第 42 集（新增 2 集）",
    variables: {
      appName: "短剧助手",
      checkTime: "2026-11-01 08:30",
      updateCount: 2,
      updates:
        "1. 《万妖图录传》第七季 · 新季 80 集\n2. 《太玄胎珠传》 · 第 42 集（新增 2 集）",
    },
  },
  reminder: {
    defaultTitle: "短剧助手新内容提醒",
    defaultBody:
      "提醒时间：2026-11-01 12:00\n\n1. 《万妖图录传》第七季 · 新季 80 集 · 提醒有效至：2026-11-03 00:04",
    variables: {
      appName: "短剧助手",
      reminderTime: "2026-11-01 12:00",
      updateCount: 1,
      updates:
        "1. 《万妖图录传》第七季 · 新季 80 集 · 提醒有效至：2026-11-03 00:04",
    },
  },
});
const notificationTemplateVariablePattern =
  /\{([A-Za-z][A-Za-z0-9]*)\}/g;

const notificationChannelOrder = [
  "bark",
  "ntfy",
  "telegram",
  "wecom",
  "dingtalk",
];
const notificationChannelLabels = {
  bark: "Bark",
  ntfy: "ntfy",
  telegram: "Telegram",
  wecom: "企业微信",
  dingtalk: "钉钉",
};
const episodeNotificationWindowOptions = new Set([
  0,
  60,
  120,
  360,
  720,
  1440,
]);
const discoveryReminderUnitMinutes = Object.freeze({
  minutes: 1,
  hours: 60,
  days: 1440,
});
const APP_TIME_ZONE = "Asia/Shanghai";
const MAX_RECENT_EVENTS = 100;
const MAX_WATCHLIST_SEARCH_CANDIDATES = 8;
const SETTINGS_TABS = Object.freeze([
  "account",
  "general",
  "notification",
  "templates",
]);

const icon = (name, className = "icon") =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: APP_TIME_ZONE,
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

function formatRelativeTime(value) {
  if (!value) {
    return "尚未检查";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("zh-CN", {
    numeric: "auto",
  });
  const ranges = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of ranges) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return "刚刚";
}

function statusMarkup(status) {
  const label =
    status === "updating"
      ? "系列未完结"
      : status === "completed"
        ? "系列已完结"
        : status === "inactive"
          ? "系列已停更"
        : "系列状态未知";
  const iconName =
    status === "completed"
      ? "check"
      : status === "updating"
        ? "layers"
        : status === "inactive"
          ? "pause"
          : "alert";
  return `<span class="status status--${escapeHtml(status)}">${icon(
    iconName,
  )}${label}</span>`;
}

function reminderToggleMarkup(subscription) {
  const reminderMode =
    subscription.reminderMode ||
    (subscription.reminderEnabled === false
      ? "disabled"
      : subscription.reminderMutedForCurrentUpdate === true
        ? "muted"
        : "enabled");
  const hasCurrentUpdate =
    subscription.hasUnreadUpdate === true ||
    subscription.reminderActive === true;
  const nextMode =
    reminderMode === "enabled"
      ? hasCurrentUpdate
        ? "muted"
        : "disabled"
      : reminderMode === "muted"
        ? "disabled"
        : "enabled";
  const reminderActive =
    reminderMode === "enabled" && subscription.reminderActive === true;
  const displayTitle = subscriptionDisplayTitle(subscription);
  const expiresAt = reminderActive
    ? formatDateTime(subscription.reminderExpiresAt)
    : "";
  const actionLabel = {
    enabled: hasCurrentUpdate
      ? `关闭《${displayTitle}》本次更新的提醒`
      : `关闭《${displayTitle}》的全部更新提醒`,
    muted: `关闭《${displayTitle}》的全部更新提醒`,
    disabled: `开启《${displayTitle}》的更新提醒`,
  }[nextMode];
  const stateHint = reminderActive
    ? `提醒已开启，当前提醒有效至 ${expiresAt}`
    : reminderMode === "enabled"
      ? "提醒已开启，当前没有生效中的持续提醒"
      : reminderMode === "muted"
        ? "本次更新已静音，下次有新集或新季时自动恢复"
        : "已关闭全部更新提醒，有更新状态仍会保留";
  const title = `${actionLabel}；当前状态：${stateHint}`;
  const stateClass = reminderActive
    ? "is-active"
    : {
        enabled: "is-enabled",
        muted: "is-muted",
        disabled: "is-off",
      }[reminderMode];
  const iconName = {
    enabled: "bell",
    muted: "bell-minus",
    disabled: "bell-off",
  }[reminderMode];

  return `
    <button
      class="reminder-toggle ${stateClass}"
      type="button"
      data-action="reminder"
      data-reminder-mode="${reminderMode}"
      data-next-reminder-mode="${nextMode}"
      aria-label="${escapeHtml(title)}"
      title="${escapeHtml(title)}"
    >
      ${icon(iconName)}
      <span class="sr-only" data-button-label>${escapeHtml(actionLabel)}</span>
    </button>
  `;
}

function updateStatusMarkup(subscription) {
  const hasUnreadUpdate = subscription.hasUnreadUpdate === true;
  const label = hasUnreadUpdate ? "有更新" : "已观看";
  const hint = hasUnreadUpdate ? "点按标记已看" : "点按恢复更新";
  const iconName = hasUnreadUpdate ? "play" : "check";
  const lastWatchedNote = subscription.lastWatchedAt
    ? `；最后标记已看：${formatDate(subscription.lastWatchedAt)}`
    : "";
  const title = hasUnreadUpdate
    ? `将《${subscriptionDisplayTitle(subscription)}》标记为已观看${lastWatchedNote}`
    : `将《${subscriptionDisplayTitle(subscription)}》恢复为有更新${lastWatchedNote}`;
  return `
    <button
      class="status status-toggle status--${
        hasUnreadUpdate ? "unread" : "watched"
      }"
      type="button"
      data-action="watched"
      data-watched="${hasUnreadUpdate}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >
      <span class="status-toggle__icon">${icon(iconName)}</span>
      <span class="status-toggle__copy">
        <span class="status-toggle__label" data-button-label>${label}</span>
        <span class="status-toggle__hint">${hint}</span>
      </span>
    </button>
  `;
}

function subscriptionDisplayTitle(subscription) {
  return (
    subscription?.displayTitle ||
    subscription?.firstSeasonTitle ||
    subscription?.title ||
    "未命名短剧"
  );
}

function normalizeWatchlistSearchValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replaceAll("ü", "v")
    .replace(/[\s·・'’]+/g, "");
}

function watchlistSearchTerms(value) {
  return String(value ?? "")
    .split(/\s+/)
    .map(normalizeWatchlistSearchValue)
    .filter(Boolean);
}

function watchlistSubsequenceScore(query, target, baseScore) {
  if (query.length < 2 || target.length < query.length) {
    return 0;
  }
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  for (let index = 0; index < target.length; index += 1) {
    if (target[index] !== query[queryIndex]) {
      continue;
    }
    if (firstMatch < 0) {
      firstMatch = index;
    }
    lastMatch = index;
    queryIndex += 1;
    if (queryIndex === query.length) {
      const span = lastMatch - firstMatch + 1;
      return Math.max(
        1,
        baseScore -
          (target.length - query.length) * 2 -
          (span - query.length) * 5,
      );
    }
  }
  return 0;
}

function watchlistFieldScore(field, query, scores) {
  let best = 0;
  for (const term of watchlistSearchTerms(field)) {
    if (term === query) {
      best = Math.max(best, scores.exact);
    } else if (term.startsWith(query)) {
      best = Math.max(best, scores.prefix);
    } else if (term.includes(query)) {
      best = Math.max(best, scores.contains);
    }
  }
  return best;
}

function watchlistSubscriptionScore(subscription, query) {
  const title = normalizeWatchlistSearchValue(
    subscriptionDisplayTitle(subscription),
  );
  const searchText =
    subscription.searchText || normalizeWatchlistSearchValue(title);
  const searchPinyin =
    subscription.searchPinyin || normalizeWatchlistSearchValue(title);
  const searchInitials =
    subscription.searchInitials || normalizeWatchlistSearchValue(title);

  let score = Math.max(
    watchlistFieldScore(title, query, {
      exact: 1200,
      prefix: 1100,
      contains: 1000,
    }),
    watchlistFieldScore(searchText, query, {
      exact: 980,
      prefix: 940,
      contains: 900,
    }),
    watchlistFieldScore(searchPinyin, query, {
      exact: 900,
      prefix: 850,
      contains: 800,
    }),
    watchlistFieldScore(searchInitials, query, {
      exact: 760,
      prefix: 720,
      contains: 680,
    }),
  );

  for (const term of watchlistSearchTerms(searchText)) {
    score = Math.max(
      score,
      watchlistSubsequenceScore(query, term, 480),
    );
  }
  for (const term of watchlistSearchTerms(searchPinyin)) {
    score = Math.max(
      score,
      watchlistSubsequenceScore(query, term, 430),
    );
  }
  for (const term of watchlistSearchTerms(searchInitials)) {
    score = Math.max(
      score,
      watchlistSubsequenceScore(query, term, 400),
    );
  }
  return score;
}

function watchlistSearchMatches(subscriptions) {
  const search = appState.watchlistSearch;
  const query = normalizeWatchlistSearchValue(search.query);
  if (!query) {
    return subscriptions.map((subscription) => ({
      score: 0,
      subscription,
    }));
  }

  if (search.selectedId) {
    const selected = subscriptions.find(
      (subscription) => subscription.id === search.selectedId,
    );
    if (selected) {
      return [{ score: 0, subscription: selected }];
    }
    search.selectedId = null;
  }

  return subscriptions
    .map((subscription) => ({
      score: watchlistSubscriptionScore(subscription, query),
      subscription,
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return (
        (latestSubscriptionUpdate(right.subscription)?.timestamp || 0) -
        (latestSubscriptionUpdate(left.subscription)?.timestamp || 0)
      );
    });
}

function setWatchlistSearchOpen(open) {
  const search = appState.watchlistSearch;
  const shouldOpen =
    Boolean(open) && Boolean(normalizeWatchlistSearchValue(search.query));
  search.open = shouldOpen;
  elements.watchlistSearchPanel.hidden = !shouldOpen;
  elements.watchlistSearchInput.setAttribute(
    "aria-expanded",
    String(shouldOpen),
  );
  if (!shouldOpen) {
    elements.watchlistSearchInput.removeAttribute("aria-activedescendant");
  }
}

function setWatchlistSearchActive(index, { scroll = false } = {}) {
  const search = appState.watchlistSearch;
  const options = [
    ...elements.watchlistSearchList.querySelectorAll("[role='option']"),
  ];
  if (!options.length) {
    search.activeIndex = -1;
    elements.watchlistSearchInput.removeAttribute("aria-activedescendant");
    return;
  }
  const requestedIndex = Number(index);
  const nextIndex = Number.isFinite(requestedIndex)
    ? (requestedIndex + options.length) % options.length
    : 0;
  search.activeIndex = nextIndex;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === nextIndex;
    option.dataset.active = active ? "true" : "false";
    option.setAttribute("aria-selected", String(active));
  });
  elements.watchlistSearchInput.setAttribute(
    "aria-activedescendant",
    options[nextIndex].id,
  );
  if (scroll) {
    options[nextIndex].scrollIntoView({ block: "nearest" });
  }
}

function renderWatchlistSearchCandidate(subscription, index) {
  const displayTitle = subscriptionDisplayTitle(subscription);
  const latestSeason =
    subscription.seasons?.find(
      (season) => season.seriesId === subscription.latestSeasonId,
    ) || subscription.seasons?.[0];
  const latestUpdate = latestSubscriptionUpdate(subscription);
  const coverUrl = safeHttpsUrl(subscription.coverUrl);
  const cover = coverUrl
    ? `<img class="watchlist-search-result__cover" src="${escapeHtml(
        coverUrl,
      )}" alt="" loading="lazy">`
    : `<span class="watchlist-search-result__placeholder" aria-hidden="true">${icon(
        "tv",
      )}</span>`;
  const meta = [
    latestSeason?.title ? `最新 ${latestSeason.title}` : "季信息未知",
    latestUpdate
      ? formatDateTime(latestUpdate.value)
      : "更新时间未知",
  ].join(" · ");

  return `
    <li
      class="watchlist-search-result"
      id="watchlist-search-option-${index}"
      role="option"
      aria-selected="false"
      data-active="false"
      data-watchlist-search-index="${index}"
      title="只显示《${escapeHtml(displayTitle)}》"
    >
      ${cover}
      <span class="watchlist-search-result__body">
        <span class="watchlist-search-result__title">${escapeHtml(
          displayTitle,
        )}</span>
        <span class="watchlist-search-result__meta">${escapeHtml(
          meta,
        )}</span>
      </span>
      ${icon("chevron-right", "icon watchlist-search-result__arrow")}
    </li>
  `;
}

function renderWatchlistSearchCandidates(matches) {
  const search = appState.watchlistSearch;
  const query = normalizeWatchlistSearchValue(search.query);
  elements.watchlistSearchClear.hidden = !search.query;
  if (!query) {
    search.activeIndex = -1;
    search.results = [];
    elements.watchlistSearchStatus.textContent = "";
    elements.watchlistSearchList.replaceChildren();
    elements.watchlistSearchList.hidden = true;
    setWatchlistSearchOpen(false);
    return;
  }

  search.results = matches
    .slice(0, MAX_WATCHLIST_SEARCH_CANDIDATES)
    .map((match) => match.subscription);
  if (!search.results.length) {
    search.activeIndex = -1;
    elements.watchlistSearchStatus.textContent =
      "没有找到匹配的追更短剧，请换个剧名、全拼或首字母。";
    elements.watchlistSearchList.replaceChildren();
    elements.watchlistSearchList.hidden = true;
    setWatchlistSearchOpen(search.open);
    return;
  }

  elements.watchlistSearchStatus.textContent =
    matches.length > search.results.length
      ? `找到 ${matches.length} 个系列，优先显示前 ${search.results.length} 个。`
      : `找到 ${matches.length} 个系列。`;
  elements.watchlistSearchList.innerHTML = search.results
    .map(renderWatchlistSearchCandidate)
    .join("");
  elements.watchlistSearchList.hidden = false;
  if (search.activeIndex >= search.results.length) {
    search.activeIndex = -1;
  }
  setWatchlistSearchOpen(search.open);
  if (search.open && search.activeIndex >= 0) {
    setWatchlistSearchActive(search.activeIndex);
  }
}

function selectWatchlistSearchCandidate(index) {
  const search = appState.watchlistSearch;
  const subscription = search.results[Number(index)];
  if (!subscription) {
    return;
  }
  const title = subscriptionDisplayTitle(subscription);
  search.query = title;
  search.selectedId = subscription.id;
  search.activeIndex = -1;
  search.open = false;
  elements.watchlistSearchInput.value = title;
  renderDashboard({ listMotion: "search" });
  elements.watchlistSearchInput.focus({ preventScroll: true });
}

function clearWatchlistSearch({ focus = true } = {}) {
  const search = appState.watchlistSearch;
  search.query = "";
  search.selectedId = null;
  search.activeIndex = -1;
  search.open = false;
  search.results = [];
  elements.watchlistSearchInput.value = "";
  renderDashboard({ listMotion: "search" });
  if (focus) {
    elements.watchlistSearchInput.focus({ preventScroll: true });
  }
}

function sourceLabel(source) {
  if (source === "album") {
    return "官方多季";
  }
  if (source === "recommendation") {
    return "自动发现";
  }
  if (source === "manual") {
    return "手动确认";
  }
  return "分享添加";
}

function enabledNotificationLabels(settings) {
  const notifications = settings?.notifications;
  return notificationChannelOrder
    .filter((channel) => notifications?.[channel]?.enabled)
    .map((channel) => notificationChannelLabels[channel]);
}

function notificationStateLabel(settings) {
  const labels = enabledNotificationLabels(settings);
  if (!labels.length) {
    return "未配置";
  }
  if (labels.length <= 2) {
    return labels.join("、");
  }
  return `${labels[0]} +${labels.length - 1}`;
}

function hasEnabledNotifications(settings) {
  return enabledNotificationLabels(settings).length > 0;
}

async function requestJson(path, options = {}) {
  const {
    headers = {},
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    signal: callerSignal,
    ...requestOptions
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
  const abortFromCaller = () => controller.abort();
  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, {
      once: true,
    });
  }

  try {
    const response = await fetch(path, {
      ...requestOptions,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...headers,
      },
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // The status code still gives the caller a useful failure path.
    }
    if (!response.ok) {
      const error = new Error(
        payload?.error?.message || `请求失败（HTTP ${response.status}）。`,
      );
      error.code = payload?.error?.code || "REQUEST_FAILED";
      error.status = response.status;
      error.retryAfterSeconds =
        payload?.error?.retryAfterSeconds ??
        Number(response.headers.get("retry-after")) ??
        null;
      throw error;
    }
    return payload;
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error("请求超时，请检查网络后重试。");
      timeoutError.code = "REQUEST_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function setPageBusy(isBusy) {
  appState.loading = isBusy;
  elements.pageProgress.hidden = !isBusy;
  elements.checkAll.disabled =
    isBusy || !appState.dashboard?.subscriptions?.length;
}

function setFormFeedback(element, message = "", type = "error") {
  element.textContent = message;
  element.classList.toggle("is-visible", Boolean(message));
  element.classList.toggle("is-success", type === "success");
}

function setFieldError(input, hasError) {
  input.closest(".field")?.classList.toggle("has-error", hasError);
  input.setAttribute("aria-invalid", hasError ? "true" : "false");
}

function showToast(message, type = "success") {
  clearTimeout(appState.toastTimer);
  clearTimeout(appState.toastHideTimer);
  elements.toast.classList.remove("is-hiding", "is-refreshing");
  elements.toast.textContent = message;
  elements.toast.classList.toggle("toast--error", type === "error");
  elements.toast.hidden = false;
  void elements.toast.offsetWidth;
  elements.toast.classList.add("is-refreshing");
  appState.toastTimer = setTimeout(() => {
    elements.toast.classList.add("is-hiding");
    appState.toastHideTimer = setTimeout(() => {
      elements.toast.hidden = true;
      elements.toast.classList.remove("is-hiding", "is-refreshing");
    }, 160);
  }, 4200);
}

function updateScrollControls() {
  appState.scrollControlsFrame = null;
  const scroller = document.scrollingElement || document.documentElement;
  const maxScrollTop = Math.max(
    0,
    scroller.scrollHeight - window.innerHeight,
  );
  const scrollTop = Math.max(0, scroller.scrollTop);
  const isScrollable = maxScrollTop > 8;

  elements.scrollControls.hidden = !isScrollable;
  if (!isScrollable) {
    return;
  }

  elements.scrollToTop.disabled = scrollTop <= 2;
  elements.scrollToBottom.disabled = scrollTop >= maxScrollTop - 2;
}

function scheduleScrollControlsUpdate() {
  if (appState.scrollControlsFrame !== null) {
    return;
  }
  appState.scrollControlsFrame = window.requestAnimationFrame(
    updateScrollControls,
  );
}

function scrollPageTo(position) {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  window.scrollTo({
    top: position,
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

function setButtonBusy(button, busy, busyLabel = "处理中…") {
  if (!button) {
    return;
  }
  const label =
    button.querySelector("[data-button-label]") ||
    button.querySelector("span:last-child");
  if (busy) {
    if (!button.dataset.idleLabel) {
      button.dataset.idleLabel = label?.textContent || button.textContent.trim();
    }
    button.disabled = true;
    button.classList.add("is-busy");
    button.setAttribute("aria-busy", "true");
    if (label) {
      label.textContent = busyLabel;
    } else {
      button.textContent = busyLabel;
    }
    return;
  }
  button.disabled = false;
  button.classList.remove("is-busy");
  button.removeAttribute("aria-busy");
  if (label && button.dataset.idleLabel) {
    label.textContent = button.dataset.idleLabel;
  }
  delete button.dataset.idleLabel;
}

function normalizeSeriesSearchQuery(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDirectSeriesInput(value) {
  const text = String(value || "").trim();
  return (
    /^\d{8,25}$/.test(text) ||
    /(?:https?:\/\/|(?:novelquickapp|hongguoduanju)\.com\/)/i.test(text)
  );
}

function candidateStatusLabel(status) {
  if (status === "completed") {
    return "本季已完结";
  }
  if (status === "updating") {
    return "本季更新中";
  }
  return "本季状态未知";
}

function currentSeriesSearchSelection() {
  const selected = appState.seriesSearch.selected;
  if (
    !selected ||
    normalizeSeriesSearchQuery(elements.shareInput.value) !==
      normalizeSeriesSearchQuery(selected.title)
  ) {
    return null;
  }
  return selected;
}

function updateSeriesSearchClear() {
  elements.shareInputClear.hidden = !elements.shareInput.value;
}

function updateAddButtonMode() {
  const search = appState.seriesSearch;
  if (search.loading) {
    return;
  }
  const input = elements.shareInput.value.trim();
  const addMode =
    Boolean(currentSeriesSearchSelection()) || isDirectSeriesInput(input);
  const label = elements.addSubmit.querySelector("span:last-child");
  const use = elements.addSubmit.querySelector("use");
  if (label) {
    label.textContent = addMode ? "加入追更" : "搜索短剧";
  }
  if (use) {
    use.setAttribute("href", addMode ? "#icon-plus" : "#icon-search");
  }
  delete elements.addSubmit.dataset.idleLabel;
}

function setSeriesSearchExpanded(expanded) {
  const search = appState.seriesSearch;
  search.open = Boolean(expanded);
  elements.seriesSearchPanel.hidden = !expanded;
  elements.shareInput.setAttribute("aria-expanded", String(Boolean(expanded)));
  if (!expanded) {
    elements.shareInput.removeAttribute("aria-activedescendant");
  }
}

function setSeriesSearchActive(index) {
  const search = appState.seriesSearch;
  const options = [
    ...elements.seriesSearchList.querySelectorAll("[role='option']"),
  ];
  if (!options.length) {
    search.activeIndex = -1;
    elements.shareInput.removeAttribute("aria-activedescendant");
    return;
  }
  const requestedIndex = Number(index);
  const nextIndex = Number.isFinite(requestedIndex)
    ? Math.max(0, Math.min(requestedIndex, options.length - 1))
    : 0;
  search.activeIndex = nextIndex;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === nextIndex;
    option.dataset.active = active ? "true" : "false";
    option.setAttribute("aria-selected", String(active));
  });
  elements.shareInput.setAttribute(
    "aria-activedescendant",
    options[nextIndex].id,
  );
}

function hideSeriesSearchPanel() {
  setSeriesSearchExpanded(false);
}

function renderSeriesSearchResults(status, results = []) {
  const search = appState.seriesSearch;
  elements.seriesSearchStatus.textContent = status;
  elements.seriesSearchList.replaceChildren();
  if (!results.length) {
    elements.seriesSearchList.hidden = true;
    search.activeIndex = -1;
    setSeriesSearchExpanded(true);
    return;
  }

  const markup = results
    .map((candidate, index) => {
      const coverUrl = safeHttpsUrl(candidate.coverUrl);
      const cover = coverUrl
        ? `<img class="series-search-option__cover" src="${escapeHtml(
            coverUrl,
          )}" alt="" loading="lazy">`
        : `<span class="series-search-option__placeholder" aria-hidden="true">${icon(
            "play",
          )}</span>`;
      const episodeCount = Number(candidate.episodeCount) || 0;
      const meta = [
        episodeCount > 0 ? `${episodeCount} 集` : "集数未知",
        candidateStatusLabel(candidate.status),
      ].join(" · ");
      return `
        <li
          class="series-search-option"
          id="series-search-option-${index}"
          role="option"
          aria-selected="false"
          data-active="false"
          data-series-search-index="${index}"
          title="${escapeHtml(candidate.title)}"
        >
          ${cover}
          <span class="series-search-option__body">
            <span class="series-search-option__title">${escapeHtml(
              candidate.title,
            )}</span>
            <span class="series-search-option__meta">${escapeHtml(meta)}</span>
          </span>
          <span class="series-search-option__action" aria-hidden="true">选择</span>
        </li>
      `;
    })
    .join("");
  elements.seriesSearchList.innerHTML = markup;
  elements.seriesSearchList.hidden = false;
  setSeriesSearchExpanded(true);

  const selectedIndex = results.findIndex(
    (candidate) => candidate.seriesId === search.selected?.seriesId,
  );
  setSeriesSearchActive(selectedIndex >= 0 ? selectedIndex : 0);
}

function cancelSeriesSearchRequest() {
  const search = appState.seriesSearch;
  clearTimeout(search.timer);
  search.timer = null;
  search.requestId += 1;
  search.controller?.abort();
  search.controller = null;
  if (search.loading) {
    search.loading = false;
    setButtonBusy(elements.addSubmit, false);
    updateAddButtonMode();
  }
  elements.shareInput.removeAttribute("aria-busy");
}

function resetSeriesSearch({ clearInput = false } = {}) {
  cancelSeriesSearchRequest();
  const search = appState.seriesSearch;
  search.activeIndex = -1;
  search.lastQuery = "";
  search.results = [];
  search.selected = null;
  elements.seriesSearchStatus.textContent = "";
  elements.seriesSearchList.replaceChildren();
  elements.seriesSearchList.hidden = true;
  hideSeriesSearchPanel();
  if (clearInput) {
    elements.shareInput.value = "";
  }
  updateSeriesSearchClear();
  setFieldError(elements.shareInput, false);
  setFormFeedback(elements.shareFeedback);
  updateAddButtonMode();
}

async function searchSeriesByName(query, { explicit = false } = {}) {
  const search = appState.seriesSearch;
  const normalizedQuery = normalizeSeriesSearchQuery(query);
  if (!normalizedQuery || isDirectSeriesInput(normalizedQuery)) {
    hideSeriesSearchPanel();
    updateAddButtonMode();
    return [];
  }
  if ([...normalizedQuery].length > SERIES_SEARCH_MAX_QUERY_LENGTH) {
    hideSeriesSearchPanel();
    setFieldError(elements.shareInput, true);
    setFormFeedback(
      elements.shareFeedback,
      `剧名请控制在 ${SERIES_SEARCH_MAX_QUERY_LENGTH} 个字以内，或粘贴分享链接。`,
    );
    return [];
  }

  clearTimeout(search.timer);
  search.timer = null;
  search.controller?.abort();
  const controller = new AbortController();
  search.controller = controller;
  const requestId = ++search.requestId;
  search.loading = true;
  search.lastQuery = normalizedQuery;
  search.results = [];
  search.selected = null;
  elements.shareInput.setAttribute("aria-busy", "true");
  setFieldError(elements.shareInput, false);
  setFormFeedback(elements.shareFeedback);
  setButtonBusy(elements.addSubmit, true, "搜索中…");
  renderSeriesSearchResults(`正在搜索《${normalizedQuery}》…`);

  try {
    const payload = await requestJson(
      `/api/series/search?query=${encodeURIComponent(normalizedQuery)}`,
      { method: "GET", signal: controller.signal },
    );
    if (
      requestId !== search.requestId ||
      elements.shareInput.value.trim() !== query.trim()
    ) {
      return [];
    }
    const results = Array.isArray(payload.results) ? payload.results : [];
    search.results = results;
    if (!results.length) {
      renderSeriesSearchResults(
        `没有找到《${normalizedQuery}》的官方结果，请换个名称再试。`,
      );
      if (explicit) {
        elements.shareInput.focus();
      }
      return [];
    }
    if (results.length === 1) {
      renderSeriesSearchResults(
        `找到《${results[0].title}》，已自动选中。`,
        results,
      );
      selectSeriesCandidate(0);
      return results;
    }
    renderSeriesSearchResults(
      `找到 ${results.length} 个官方结果，请选择要追更的剧集。`,
      results,
    );
    if (explicit) {
      elements.shareInput.focus();
    }
    return results;
  } catch (error) {
    if (requestId !== search.requestId || error?.name === "AbortError") {
      return [];
    }
    search.results = [];
    setFieldError(elements.shareInput, true);
    setFormFeedback(elements.shareFeedback, error.message);
    renderSeriesSearchResults("搜索失败，请稍后重试。");
    if (explicit) {
      elements.shareInput.focus();
    }
    return [];
  } finally {
    if (requestId === search.requestId) {
      if (search.controller === controller) {
        search.controller = null;
      }
      search.loading = false;
      elements.shareInput.removeAttribute("aria-busy");
      setButtonBusy(elements.addSubmit, false);
      updateAddButtonMode();
    }
  }
}

function selectSeriesCandidate(index) {
  const search = appState.seriesSearch;
  const candidateIndex = Number(index);
  const candidate = Number.isInteger(candidateIndex)
    ? search.results[candidateIndex]
    : null;
  if (!candidate) {
    return;
  }
  search.selected = candidate;
  search.activeIndex = candidateIndex;
  elements.shareInput.value = candidate.title;
  updateSeriesSearchClear();
  setFieldError(elements.shareInput, false);
  setFormFeedback(
    elements.shareFeedback,
    `已选择《${candidate.title}》，按回车加入追更。`,
    "success",
  );
  hideSeriesSearchPanel();
  updateAddButtonMode();
  elements.shareInput.focus({ preventScroll: true });
}

function focusSubscriptionAction(subscriptionId, action) {
  const row = [...elements.subscriptionList.querySelectorAll(
    "[data-subscription-id]",
  )].find((item) => item.dataset.subscriptionId === subscriptionId);
  const button = row?.querySelector(`[data-action="${action}"]`);
  button?.focus();
  if (button) {
    button.classList.add("is-state-changed");
    window.setTimeout(() => {
      button.classList.remove("is-state-changed");
    }, 420);
  }
}

function renderCover(coverUrl, title) {
  const safeCover = safeHttpsUrl(coverUrl);
  if (safeCover) {
    return `
      <div class="cover">
        <img src="${escapeHtml(safeCover)}" alt="${escapeHtml(
          title,
        )}封面" width="78" height="104" loading="lazy">
      </div>
    `;
  }
  return `
    <div class="cover">
      <div class="cover-placeholder">
        ${icon("tv")}
        <span class="sr-only">${escapeHtml(title)}没有封面</span>
      </div>
    </div>
  `;
}

function seasonTimeMarkup(label, value, emptyLabel = "时间未知") {
  const date = value ? new Date(value) : null;
  const valid = date && !Number.isNaN(date.getTime());
  return `
    <span class="season-time">
      <span class="season-time__label">${escapeHtml(label)}</span>
      ${
        valid
          ? `<time datetime="${escapeHtml(
              date.toISOString(),
            )}">${escapeHtml(formatDateTime(date))}</time>`
          : `<span>${escapeHtml(emptyLabel)}</span>`
      }
    </span>
  `;
}

function renderSeasonTimes(season) {
  return `
    <div class="season-times">
      ${seasonTimeMarkup("季上线", season?.firstVisibleTime)}
      ${seasonTimeMarkup(
        "检测到更新",
        season?.lastEpisodeChangedAt,
        "暂无记录",
      )}
    </div>
  `;
}

function latestSubscriptionUpdate(subscription) {
  return (subscription?.seasons || [])
    .flatMap((season) => [
      {
        value: season.lastEpisodeChangedAt,
        timestamp: Date.parse(season.lastEpisodeChangedAt || ""),
      },
      {
        value: season.firstVisibleTime,
        timestamp: Date.parse(season.firstVisibleTime || ""),
      },
    ])
    .filter(({ value, timestamp }) => value && Number.isFinite(timestamp))
    .sort((left, right) => right.timestamp - left.timestamp)[0] || null;
}

function renderLatestSubscriptionUpdate(subscription) {
  const latest = latestSubscriptionUpdate(subscription);
  return `
    <span class="subscription-row__latest-update">
      ${icon("clock")}
      <span>最新更新</span>
      ${
        latest
          ? `<time datetime="${escapeHtml(
              new Date(latest.timestamp).toISOString(),
            )}">${escapeHtml(formatDateTime(latest.value))}</time>`
          : "<span>暂无记录</span>"
      }
    </span>
  `;
}

function sortSubscriptionsByLatestUpdate(subscriptions) {
  return [...subscriptions].sort((left, right) => {
    const leftLatest = latestSubscriptionUpdate(left);
    const rightLatest = latestSubscriptionUpdate(right);
    return (
      (rightLatest?.timestamp || 0) - (leftLatest?.timestamp || 0) ||
      String(subscriptionDisplayTitle(left)).localeCompare(
        subscriptionDisplayTitle(right),
        "zh-CN",
      )
    );
  });
}

function datePartsInAppTimeZone(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function subscriptionUpdateGroup(subscription, now = new Date()) {
  const latest = latestSubscriptionUpdate(subscription);
  const parts = datePartsInAppTimeZone(
    latest ? new Date(latest.timestamp) : null,
  );
  if (!parts) {
    return {
      key: "unknown",
      label: "时间未知",
    };
  }

  const key = `${parts.year}-${parts.month}-${parts.day}`;
  const todayParts = datePartsInAppTimeZone(now);
  const yesterdayParts = datePartsInAppTimeZone(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
  );
  const todayKey = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  const yesterdayKey = `${yesterdayParts.year}-${yesterdayParts.month}-${yesterdayParts.day}`;
  if (key === todayKey) {
    return { key, label: "今天" };
  }
  if (key === yesterdayKey) {
    return { key, label: "昨天" };
  }
  return {
    key,
    label:
      parts.year === todayParts.year
        ? `${Number(parts.month)}月${Number(parts.day)}日`
        : `${parts.year}年${Number(parts.month)}月${Number(parts.day)}日`,
  };
}

function groupSubscriptionsByLatestUpdate(subscriptions) {
  const groups = [];
  const groupsByKey = new Map();
  for (const subscription of sortSubscriptionsByLatestUpdate(subscriptions)) {
    const group = subscriptionUpdateGroup(subscription);
    let entry = groupsByKey.get(group.key);
    if (!entry) {
      entry = {
        ...group,
        subscriptions: [],
      };
      groupsByKey.set(group.key, entry);
      groups.push(entry);
    }
    entry.subscriptions.push(subscription);
  }
  return groups;
}

function renderSubscriptionGroups(
  subscriptions,
  { shownCount = subscriptions.length, totalCount = subscriptions.length } = {},
) {
  const groupsMarkup = groupSubscriptionsByLatestUpdate(subscriptions)
    .map((group, index) => {
      const headingId = `subscription-group-${index}`;
      return `
        <section class="subscription-group" aria-labelledby="${headingId}">
          <h3 class="subscription-group__heading" id="${headingId}">
            <span>${escapeHtml(group.label)}</span>
            <span class="subscription-group__count">${group.subscriptions.length} 部</span>
          </h3>
          <div class="subscription-group__items">
            ${group.subscriptions.map(renderSubscription).join("")}
          </div>
        </section>
      `;
    })
    .join("");
  const remainingCount = Math.max(0, totalCount - shownCount);
  if (!remainingCount) {
    return groupsMarkup;
  }
  const nextBatchSize = Math.min(
    SUBSCRIPTION_LOAD_MORE_SIZE,
    remainingCount,
  );
  return `
    ${groupsMarkup}
    <div class="subscription-load-more" data-subscription-load-more>
      <button
        class="button button--secondary subscription-load-more__button"
        type="button"
        data-action="load-more"
        aria-label="继续加载 ${nextBatchSize} 部短剧，剩余 ${remainingCount} 部"
      >
        <span>继续加载 ${nextBatchSize} 部</span>
        ${icon("chevron-down")}
      </button>
      <p class="subscription-load-more__meta">
        已显示 ${shownCount} / ${totalCount} 部
      </p>
    </div>
  `;
}

function seasonDetailUrl(season) {
  const storedUrl = safeHttpsUrl(season?.detailUrl);
  if (storedUrl) {
    return storedUrl;
  }
  const seriesId = String(season?.seriesId || "").trim();
  return /^\d{8,25}$/.test(seriesId)
    ? `https://hongguoduanju.com/detail?series_id=${encodeURIComponent(
        seriesId,
      )}`
    : "";
}

function renderSeasonItem(season) {
  const detailUrl = seasonDetailUrl(season);
  const content = `
    <span class="season-item__title">
      <span>${escapeHtml(season.title)}</span>
      ${detailUrl ? icon("external") : ""}
    </span>
    <span class="season-item__meta">
      ${season.highWaterEpisodeCount} 集 · ${escapeHtml(
        sourceLabel(season.source),
      )}
    </span>
    ${renderSeasonTimes(season)}
    ${
      season.lastError
        ? `<span class="season-item__error">${escapeHtml(
            season.lastError,
          )}</span>`
        : ""
    }
  `;
  if (!detailUrl) {
    return `<div class="season-item">${content}</div>`;
  }
  const linkLabel = `打开《${season.title}》官方详情`;
  return `
    <a
      class="season-item season-item--link"
      href="${escapeHtml(detailUrl)}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="${escapeHtml(linkLabel)}"
      title="${escapeHtml(linkLabel)}"
    >
      ${content}
    </a>
  `;
}

function renderSeasonDetails(seasons, latestSeason) {
  const otherSeasons = seasons.filter(
    (season) => season.seriesId !== latestSeason.seriesId,
  );
  if (!otherSeasons.length) {
    return "";
  }

  return `
    <details class="season-details">
      <summary>查看其余 ${otherSeasons.length} 个已确认季</summary>
      <div class="season-list">
        ${otherSeasons.map(renderSeasonItem).join("")}
      </div>
    </details>
  `;
}

function renderSubscription(subscription) {
  const displayTitle = subscriptionDisplayTitle(subscription);
  const latestSeason =
    subscription.seasons.find(
      (season) => season.seriesId === subscription.latestSeasonId,
    ) || subscription.seasons[0];
  const latestSeasonUrl = safeHttpsUrl(latestSeason?.detailUrl);
  const latestSeasonTitleMarkup = latestSeason
    ? latestSeasonUrl
      ? `<a class="latest-season__title" href="${escapeHtml(
          latestSeasonUrl,
        )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          latestSeason.title,
        )}${icon("external")}</a>`
      : `<span class="latest-season__title">${escapeHtml(
          latestSeason.title,
        )}</span>`
    : "";
  const statusReason = String(subscription.seriesStatusReason || "").trim();
  const showSubscriptionError =
    subscription.lastError &&
    subscription.lastError.trim() !== statusReason;
  const detailsId = `subscription-details-${subscription.id}`;
  const isExpanded = appState.expandedSubscriptionIds.has(subscription.id);
  const toggleLabel = `${isExpanded ? "收起" : "展开"}《${displayTitle}》详情`;

  return `
    <article class="subscription-row" data-subscription-id="${escapeHtml(
      subscription.id,
    )}">
      ${renderCover(subscription.coverUrl, displayTitle)}
      <div class="subscription-row__summary">
        <div class="subscription-row__header">
          <h3 class="subscription-row__title">
            <button
              class="subscription-row__toggle"
              type="button"
              data-action="toggle-details"
              aria-expanded="${isExpanded}"
              aria-controls="${escapeHtml(detailsId)}"
              aria-label="${escapeHtml(toggleLabel)}"
              title="${escapeHtml(toggleLabel)}"
            >
              <span>${escapeHtml(displayTitle)}</span>
              ${icon("chevron-down")}
            </button>
          </h3>
          ${renderLatestSubscriptionUpdate(subscription)}
          ${
            latestSeason
              ? `
                <span class="subscription-row__season">
                  <span class="subscription-row__season-label">最新季</span>
                  ${latestSeasonTitleMarkup}
                  <span class="subscription-row__episode-count">${latestSeason.highWaterEpisodeCount} 集</span>
                </span>
              `
              : ""
          }
        </div>
        <div class="status-group">
          ${statusMarkup(subscription.seriesStatus)}
          <span class="status status--count">${subscription.seasonCount} 季已确认</span>
        </div>
        <div class="subscription-row__actions">
          ${reminderToggleMarkup(subscription)}
          ${updateStatusMarkup(subscription)}
        </div>
      </div>
      <div
        class="subscription-row__details"
        id="${escapeHtml(detailsId)}"
        ${isExpanded ? "" : "hidden"}
      >
        ${
          latestSeason
            ? `
              <div class="latest-season">
                <span class="latest-season__label">最近季</span>
                ${latestSeasonTitleMarkup}
                <span class="latest-season__meta">${latestSeason.highWaterEpisodeCount} 集${
                  latestSeason.episodeCount !==
                  latestSeason.highWaterEpisodeCount
                    ? ` · 页面当前 ${latestSeason.episodeCount} 集`
                    : ""
                }</span>
                ${renderSeasonTimes(latestSeason)}
              </div>
            `
            : ""
        }
        ${
          statusReason
            ? `<p class="series-status-reason">${escapeHtml(
                statusReason,
              )}</p>`
            : ""
        }
        ${
          latestSeason
            ? renderSeasonDetails(subscription.seasons, latestSeason)
            : ""
        }
        ${
          showSubscriptionError
            ? `<p class="subscription-error">${icon(
                "alert",
              )}<span>${escapeHtml(subscription.lastError)}</span></p>`
            : ""
        }
        <div class="subscription-meta">
          <span>${icon("clock")} ${escapeHtml(
            formatRelativeTime(subscription.lastCheckedAt),
          )}检查</span>
        </div>
        <div class="subscription-actions">
          <button class="text-button" type="button" data-action="check">
            ${icon("refresh")}<span>立即检查</span>
          </button>
          <button class="text-button" type="button" data-action="add-season">
            ${icon("list-plus")}<span>追加同系列季</span>
          </button>
          <button
            class="text-button subscription-status-button"
            type="button"
            data-action="status"
            aria-label="切换《${escapeHtml(displayTitle)}》的系列状态"
            title="切换系列状态"
          >
            ${icon("activity")}<span>切换状态</span>
          </button>
          <button
            class="text-button subscription-tracking-button"
            type="button"
            data-action="tracking"
            aria-label="${
              subscription.trackingPaused
                ? `恢复追更《${escapeHtml(displayTitle)}》`
                : `停止追更《${escapeHtml(displayTitle)}》`
            }"
            title="${subscription.trackingPaused ? "恢复追更" : "停止追更"}"
          >
            ${icon(subscription.trackingPaused ? "play" : "pause")}
            <span>${subscription.trackingPaused ? "恢复追更" : "停止追更"}</span>
          </button>
          <button
            class="text-button text-button--danger subscription-delete-button"
            type="button"
            data-action="delete"
            aria-label="删除《${escapeHtml(displayTitle)}》"
            title="删除追更"
          >
            ${icon("trash")}<span>删除</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderEmptyState() {
  elements.subscriptionList.innerHTML = `
    <div class="empty-state">
      <span class="empty-state__icon">${icon("inbox")}</span>
      <h3>还没有追更条目</h3>
      <p>在上方粘贴一条红果分享链接，首次添加只会记录当前集数，不会立即提醒。</p>
    </div>
  `;
}

function renderWatchlistSearchEmptyState({ searching = true, updateOnly = false } = {}) {
  const title =
    searching && updateOnly
      ? "没有找到既匹配又有更新的短剧"
      : updateOnly
        ? "没有处于有更新状态的短剧"
        : "没有找到匹配的短剧";
  const description =
    searching && updateOnly
      ? "可以清除搜索查看全部有更新的系列，或显示全部追更。"
      : updateOnly
        ? "更新状态可能已经变化，可以显示全部追更。"
        : "可以尝试更短的剧名、全拼或拼音首字母。";
  const actions = [
    searching
      ? `
        <button
          class="button button--secondary"
          type="button"
          data-action="clear-watchlist-search"
        >
          清除搜索
        </button>
      `
      : "",
    updateOnly
      ? `
        <button
          class="button button--secondary"
          type="button"
          data-action="clear-watchlist-update-filter"
        >
          显示全部追更
        </button>
      `
      : "",
  ].join("");

  elements.subscriptionList.innerHTML = `
    <div class="empty-state empty-state--search">
      <span class="empty-state__icon">${icon(
        updateOnly ? "filter" : "search",
      )}</span>
      <h3>${title}</h3>
      <p>${description}</p>
      ${actions ? `<div class="empty-state__actions">${actions}</div>` : ""}
    </div>
  `;
}

function eventIcon(type) {
  if (type === "episode" || type === "season") {
    return "bell";
  }
  if (type === "completed") {
    return "check";
  }
  if (type === "error") {
    return "alert";
  }
  return "clock";
}

function eventDeliveryLabel(event, settings) {
  if (event.notified) {
    return "已通知";
  }
  if (event.notificationDueAt) {
    if (!hasEnabledNotifications(settings)) {
      return "待汇总，配置通知后发送";
    }
    return `${
      event.notificationError ? "等待重试" : "待汇总"
    }：${formatDate(event.notificationDueAt)}`;
  }
  return hasEnabledNotifications(settings) ? "通知未送达" : "未配置通知";
}

function renderEvents(events) {
  const displayedEvents = events.slice(0, MAX_RECENT_EVENTS);
  const displayedEventCount = displayedEvents.length;
  elements.eventCount.textContent = String(displayedEventCount);
  elements.eventCount.hidden = displayedEventCount === 0;
  elements.openEvents.setAttribute(
    "aria-label",
    displayedEventCount
      ? `最近动态，共 ${displayedEventCount} 条`
      : "最近动态，暂无记录",
  );
  if (!events.length) {
    elements.eventList.innerHTML =
      '<p class="muted-copy">还没有动态。更新、完结和检查异常会显示在这里。</p>';
    return;
  }

  elements.eventList.innerHTML = displayedEvents
    .map(
      (event) => `
        <article class="event-item event-item--${escapeHtml(event.type)}">
          <span class="event-item__icon">${icon(eventIcon(event.type))}</span>
          <div>
            <p class="event-item__message">${escapeHtml(event.message)}</p>
            <div class="event-item__meta">
              <time datetime="${escapeHtml(event.createdAt)}">${escapeHtml(
                formatRelativeTime(event.createdAt),
              )}</time>
              ${
                event.type !== "baseline" && event.type !== "error"
                  ? `<span>${escapeHtml(
                      eventDeliveryLabel(
                        event,
                        appState.dashboard?.settings,
                      ),
                    )}</span>`
                  : ""
              }
              ${
                event.notificationError
                  ? `<span class="event-warning">${escapeHtml(
                      event.notificationError,
                    )}</span>`
                  : ""
              }
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function observeStatusGlowButtons() {
  const buttons = [
    ...elements.subscriptionList.querySelectorAll(
      ".status-toggle.status--unread, .reminder-toggle.is-active",
    ),
    ...(elements.watchlistUpdateFilter.classList.contains("has-updates")
      ? [elements.watchlistUpdateFilter]
      : []),
  ];
  appState.statusGlowObserver?.disconnect();
  if (!buttons.length) {
    return;
  }
  if (typeof IntersectionObserver !== "function") {
    buttons.forEach((button) => button.classList.add("is-glow-visible"));
    return;
  }
  appState.statusGlowObserver ||= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle(
          "is-glow-visible",
          entry.isIntersecting,
        );
      }
    },
    { threshold: 0.2 },
  );
  buttons.forEach((button) => appState.statusGlowObserver.observe(button));
}

function observeSubscriptionLoadMore() {
  appState.subscriptionLoadObserver?.disconnect();
  const trigger = elements.subscriptionList.querySelector(
    "[data-subscription-load-more]",
  );
  if (!trigger || typeof IntersectionObserver !== "function") {
    return;
  }
  appState.subscriptionLoadObserver ||= new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMoreSubscriptions();
      }
    },
    { rootMargin: "0px 0px 320px 0px" },
  );
  appState.subscriptionLoadObserver.observe(trigger);
}

function loadMoreSubscriptions() {
  if (
    appState.subscriptionRenderLimit >= appState.subscriptionVisibleCount
  ) {
    return;
  }
  appState.subscriptionRenderLimit = Math.min(
    appState.subscriptionRenderLimit + SUBSCRIPTION_LOAD_MORE_SIZE,
    appState.subscriptionVisibleCount,
  );
  renderDashboard();
}

function setAnimatedText(element, value) {
  const nextValue = String(value);
  if (!element || element.textContent === nextValue) {
    return;
  }
  clearTimeout(element.motionTimer);
  element.textContent = nextValue;
  element.classList.remove("is-value-changing");
  void element.offsetWidth;
  element.classList.add("is-value-changing");
  element.motionTimer = window.setTimeout(() => {
    element.classList.remove("is-value-changing");
  }, 320);
}

function renderDashboard({ listMotion = "" } = {}) {
  const dashboard = appState.dashboard;
  if (!dashboard) {
    return;
  }

  const allSubscriptions = sortSubscriptionsByLatestUpdate(
    dashboard.subscriptions || [],
  );
  const updatedSubscriptions = allSubscriptions.filter(
    (subscription) => subscription.hasUnreadUpdate === true,
  );
  const hasUpdates = updatedSubscriptions.length > 0;
  if (!hasUpdates) {
    appState.watchlistUpdateFilter = false;
  }
  const filteringUpdates =
    hasUpdates && appState.watchlistUpdateFilter === true;
  elements.watchlistUpdateFilter.disabled = !hasUpdates;
  elements.watchlistUpdateFilter.classList.toggle("has-updates", hasUpdates);
  elements.watchlistUpdateFilter.classList.toggle(
    "is-active",
    filteringUpdates,
  );
  elements.watchlistUpdateFilter.setAttribute(
    "aria-pressed",
    String(filteringUpdates),
  );
  const filterLabel = hasUpdates
    ? `${
        filteringUpdates ? "取消筛选" : "筛选"
      }有更新的系列，共 ${updatedSubscriptions.length} 部`
    : "筛选有更新的系列，当前没有更新";
  elements.watchlistUpdateFilter.setAttribute("aria-label", filterLabel);
  elements.watchlistUpdateFilter.title = filterLabel;
  elements.watchlistUpdateFilterBadge.textContent = String(
    updatedSubscriptions.length,
  );
  elements.watchlistUpdateFilterBadge.hidden = !hasUpdates;

  const visibleSubscriptions = filteringUpdates
    ? updatedSubscriptions
    : allSubscriptions;
  const searchMatches = watchlistSearchMatches(visibleSubscriptions);
  const subscriptions = sortSubscriptionsByLatestUpdate(
    searchMatches.map((match) => match.subscription),
  );
  const searchQuery = normalizeWatchlistSearchValue(
    appState.watchlistSearch.query,
  );
  const searching = Boolean(searchQuery);
  const renderContext = [
    filteringUpdates ? "updates" : "all",
    searchQuery,
    appState.watchlistSearch.selectedId || "",
  ].join("\u0000");
  if (appState.subscriptionRenderContext !== renderContext) {
    appState.subscriptionRenderContext = renderContext;
    appState.subscriptionRenderLimit = DEFAULT_SUBSCRIPTION_RENDER_LIMIT;
  }
  appState.subscriptionVisibleCount = subscriptions.length;
  const displayedSubscriptions = subscriptions.slice(
    0,
    appState.subscriptionRenderLimit,
  );
  const seasonCount = allSubscriptions.reduce(
    (sum, item) => sum + item.seasonCount,
    0,
  );
  setAnimatedText(elements.statSeries, allSubscriptions.length);
  setAnimatedText(elements.statSeasons, seasonCount);
  setAnimatedText(
    elements.statLastCheck,
    formatRelativeTime(dashboard.settings.lastCheckAt),
  );
  const pendingSummary = dashboard.settings.pendingNotificationCount
    ? ` · 待发送提醒 ${dashboard.settings.pendingNotificationCount} 条`
    : "";
  const filterSummary = filteringUpdates
    ? `有更新 ${updatedSubscriptions.length} 部`
    : "";
  const listSummary = searching
    ? `找到 ${subscriptions.length} 部${
        filteringUpdates ? "有更新的短剧" : ""
      }`
    : filteringUpdates
      ? filterSummary
      : `追更 ${allSubscriptions.length} 部`;
  elements.watchlistSummary.textContent = allSubscriptions.length
    ? `${listSummary}${
        searching || filteringUpdates
          ? ` · 共追更 ${allSubscriptions.length} 部`
          : ""
      } · 已收录 ${seasonCount} 季 · 自动检查已开启${pendingSummary}`
    : "粘贴红果分享内容，开始追更";
  elements.notificationState.textContent = notificationStateLabel(
    dashboard.settings,
  );
  elements.checkIndicator.hidden = !dashboard.app.checking;
  elements.checkAll.disabled =
    appState.loading ||
    dashboard.app.checking ||
    allSubscriptions.length === 0;

  if (!allSubscriptions.length) {
    renderEmptyState();
  } else if (!subscriptions.length) {
    renderWatchlistSearchEmptyState({
      searching,
      updateOnly: filteringUpdates,
    });
  } else {
    const shouldAnimateList =
      Boolean(listMotion) || !appState.hasRenderedSubscriptionList;
    clearTimeout(appState.listMotionTimer);
    elements.subscriptionList.classList.remove("is-list-entering");
    elements.subscriptionList.removeAttribute("data-motion");
    elements.subscriptionList.innerHTML = renderSubscriptionGroups(
      displayedSubscriptions,
      {
        shownCount: displayedSubscriptions.length,
        totalCount: subscriptions.length,
      },
    );
    appState.hasRenderedSubscriptionList = true;
    if (shouldAnimateList) {
      elements.subscriptionList.dataset.motion = listMotion || "initial";
      elements.subscriptionList.classList.add("is-list-entering");
      appState.listMotionTimer = window.setTimeout(() => {
        elements.subscriptionList.classList.remove("is-list-entering");
        elements.subscriptionList.removeAttribute("data-motion");
      }, 650);
    }
  }
  renderWatchlistSearchCandidates(searchMatches);
  observeStatusGlowButtons();
  observeSubscriptionLoadMore();
  renderEvents(dashboard.events || []);
  scheduleScrollControlsUpdate();
}

async function loadDashboard({ silent = false } = {}) {
  if (!silent) {
    setPageBusy(true);
  }
  try {
    appState.dashboard = await requestJson("/api/state", {
      method: "GET",
      timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
    });
    renderDashboard();
  } catch (error) {
    if (!appState.dashboard) {
      elements.subscriptionList.innerHTML = `
        <div class="empty-state">
          <span class="empty-state__icon">${icon("alert")}</span>
          <h3>无法读取我的追更</h3>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }
    showToast(error.message, "error");
  } finally {
    if (!silent) {
      setPageBusy(false);
      renderDashboard();
    }
  }
}

function openDialog(dialog) {
  if (!dialog) {
    return;
  }
  clearTimeout(dialog.closeMotionTimer);
  dialog.classList.remove("is-closing");
  if (!dialog.open) {
    dialog.showModal();
  }
}

function closeDialog(dialog) {
  if (!dialog?.open || dialog.classList.contains("is-closing")) {
    return;
  }
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion) {
    dialog.close();
    dialog.classList.remove("is-closing");
    return;
  }
  dialog.classList.add("is-closing");
  dialog.closeMotionTimer = window.setTimeout(() => {
    dialog.close();
    dialog.classList.remove("is-closing");
  }, 160);
}

function revealSubscriptionDetails(details) {
  if (!details) {
    return;
  }
  clearTimeout(details.detailsMotionTimer);
  details.classList.remove("is-collapsing");
  details.hidden = false;
  details.classList.remove("is-revealing");
  void details.offsetWidth;
  details.classList.add("is-revealing");
  details.detailsMotionTimer = window.setTimeout(() => {
    details.classList.remove("is-revealing");
  }, 300);
}

function hideSubscriptionDetails(details) {
  if (!details) {
    return;
  }
  clearTimeout(details.detailsMotionTimer);
  details.classList.remove("is-revealing");
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reduceMotion) {
    details.classList.remove("is-collapsing");
    details.hidden = true;
    return;
  }
  details.classList.add("is-collapsing");
  details.detailsMotionTimer = window.setTimeout(() => {
    details.hidden = true;
    details.classList.remove("is-collapsing");
  }, 160);
}

function dialogFocusableElements(dialog) {
  return [...dialog.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.getClientRects().length > 0);
}

for (const dialog of [
  elements.addDialog,
  elements.screenshotDialog,
  elements.accountDialog,
  elements.settingsDialog,
  elements.seasonDialog,
  elements.statusDialog,
  elements.deleteDialog,
  elements.eventsDialog,
]) {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog);
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = dialogFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });
}

const MAX_SCREENSHOTS = 6;
const SCREENSHOT_ANALYZE_CONCURRENCY = 2;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_SCREENSHOT_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_IMAGE_PIXELS = 24_000_000;
const SCREENSHOT_OUTPUT_SIDE = 1800;
const SCREENSHOT_OUTPUT_PIXELS = 4_500_000;
const SCREENSHOT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function screenshotMimeType(file) {
  const declaredType = String(file?.type || "").toLowerCase();
  if (SCREENSHOT_TYPES.has(declaredType)) {
    return declaredType;
  }
  const extension = String(file?.name || "")
    .toLowerCase()
    .split(".")
    .pop();
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return "";
}

function loadScreenshotImage(file) {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;
  return new Promise((resolve, reject) => {
    image.addEventListener(
      "load",
      () => {
        resolve({
          image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          release: () => URL.revokeObjectURL(objectUrl),
        });
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("图片无法解码，请改用 JPG、PNG 或 WebP 截图。"));
      },
      { once: true },
    );
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("截图压缩失败，请换一张图片重试。"));
        }
      },
      type,
      quality,
    );
  });
}

async function prepareScreenshot(file) {
  const mimeType = screenshotMimeType(file);
  if (!mimeType) {
    throw new Error("仅支持 JPG、PNG 或 WebP 截图。");
  }
  if (file.size > MAX_SOURCE_SCREENSHOT_BYTES) {
    throw new Error("原图不能超过 25 MB，请先在相册中裁切后再试。");
  }

  const source = await loadScreenshotImage(file);
  let blob = file;
  let width = source.width;
  let height = source.height;
  let compressed = false;
  try {
    if (
      !source.width ||
      !source.height ||
      source.width * source.height > MAX_SOURCE_IMAGE_PIXELS
    ) {
      throw new Error("截图像素过大，请先裁切掉无关区域后再试。");
    }

    const scale = Math.min(
      1,
      SCREENSHOT_OUTPUT_SIDE / Math.max(source.width, source.height),
      Math.sqrt(
        SCREENSHOT_OUTPUT_PIXELS / (source.width * source.height),
      ),
    );
    const shouldCompress = scale < 1 || file.size > 6 * 1024 * 1024;
    if (shouldCompress) {
      width = Math.max(1, Math.round(source.width * scale));
      height = Math.max(1, Math.round(source.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("浏览器无法准备截图，请更换浏览器后重试。");
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(source.image, 0, 0, width, height);
      blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      compressed = true;
    }
  } finally {
    source.release();
  }

  if (blob.size > MAX_SCREENSHOT_BYTES) {
    throw new Error("截图处理后仍超过 8 MB，请先裁切掉无关区域。");
  }
  return {
    blob,
    mimeType: compressed ? "image/jpeg" : mimeType,
    width,
    height,
    compressed,
  };
}

function screenshotCandidateStatus(status) {
  if (status === "updating") {
    return "更新中";
  }
  if (status === "completed") {
    return "已完结";
  }
  return "状态未知";
}

function normalizeScreenshotCandidate(candidate) {
  const seriesId = String(candidate?.seriesId || "");
  if (!/^\d{8,25}$/.test(seriesId)) {
    return null;
  }
  return {
    seriesId,
    title: String(candidate?.title || "").trim(),
    episodeCount: Math.max(0, Number(candidate?.episodeCount) || 0),
    status: String(candidate?.status || "unknown"),
    coverUrl: String(candidate?.coverUrl || ""),
    seriesGroupId: /^\d{8,25}$/.test(
      String(candidate?.seriesGroupId || ""),
    )
      ? String(candidate.seriesGroupId)
      : null,
    firstVisibleTime: candidate?.firstVisibleTime
      ? String(candidate.firstVisibleTime)
      : null,
  };
}

function screenshotItemDedupeKey(item) {
  const selectedCandidate = Array.isArray(item?.candidates)
    ? item.candidates.find(
        (candidate) => candidate.seriesId === item?.selectedSeriesId,
      )
    : null;
  const suggestedCandidate = Array.isArray(item?.candidates)
    ? item.candidates.find(
        (candidate) => candidate.seriesId === item?.suggestedSeriesId,
      )
    : null;
  const seriesGroupId =
    selectedCandidate?.seriesGroupId ||
    item?.seriesGroupId ||
    suggestedCandidate?.seriesGroupId;
  if (seriesGroupId) {
    return `group:${seriesGroupId}`;
  }
  const titleKey = String(
    item?.dedupeKey?.replace(/^title:/u, "") ||
      item?.title ||
      item?.rawTitle ||
      "",
  )
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return `title:${titleKey}`;
}

function candidatePriority(title, candidate) {
  const normalizedTitle = String(title || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]/gu, "");
  const normalizedCandidate = String(candidate?.title || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (!normalizedTitle || !normalizedCandidate) {
    return 0;
  }
  if (normalizedTitle === normalizedCandidate) {
    return 3;
  }
  if (
    normalizedTitle.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedTitle)
  ) {
    return 2;
  }
  return 1;
}

function screenshotSelectedCandidate(item) {
  return Array.isArray(item?.candidates)
    ? item.candidates.find(
        (candidate) => candidate.seriesId === item.selectedSeriesId,
      ) || null
    : null;
}

function screenshotReliableCandidate(item) {
  const suggested = Array.isArray(item?.candidates)
    ? item.candidates.find(
        (candidate) => candidate.seriesId === item.suggestedSeriesId,
      )
    : null;
  if (suggested) {
    return suggested;
  }
  if (
    item?.tutorialLike ||
    item?.searchError ||
    item?.candidates?.length !== 1
  ) {
    return null;
  }
  const soleCandidate = item.candidates[0];
  return candidatePriority(item.title, soleCandidate) >= 2
    ? soleCandidate
    : null;
}

function screenshotCandidateFreshness(candidate) {
  const timestamp = Date.parse(candidate?.firstVisibleTime || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function preferredScreenshotCandidate(current, next) {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  return screenshotCandidateFreshness(next) >
    screenshotCandidateFreshness(current)
    ? next
    : current;
}

function mergeScreenshotCandidateMetadata(current, next) {
  return {
    ...current,
    title: next.title || current.title,
    episodeCount: next.episodeCount || current.episodeCount,
    status:
      next.status && next.status !== "unknown"
        ? next.status
        : current.status,
    coverUrl: next.coverUrl || current.coverUrl,
    seriesGroupId: next.seriesGroupId || current.seriesGroupId,
    firstVisibleTime:
      next.firstVisibleTime || current.firstVisibleTime,
  };
}

function setScreenshotItemCandidate(
  item,
  candidate,
  { checked = true, automatic = false } = {},
) {
  item.selectedSeriesId = candidate?.seriesId || "";
  item.seriesGroupId = candidate?.seriesGroupId || null;
  item.checked = Boolean(candidate && checked);
  item.autoSelected = Boolean(candidate && checked && automatic);
  item.dedupeKey = screenshotItemDedupeKey(item);
}

function applyScreenshotAutomaticSelection(item) {
  const candidate = screenshotReliableCandidate(item);
  if (!candidate) {
    return false;
  }
  setScreenshotItemCandidate(item, candidate, {
    checked: true,
    automatic: true,
  });
  return true;
}

function screenshotSelectionStats(items = appState.screenshotItems) {
  const selectableItems = items.filter((item) =>
    screenshotSelectedCandidate(item),
  );
  const selectedItems = selectableItems.filter((item) => item.checked);
  const selectedIds = new Set(
    selectedItems.map((item) => item.selectedSeriesId),
  );
  const selectableIds = new Set(
    selectableItems.map((item) => item.selectedSeriesId),
  );
  const excludedCount = selectableItems.filter((item) => !item.checked).length;
  const reviewCount = items.length - selectableItems.length;
  return {
    selectedCount: selectedIds.size,
    selectableCount: selectableIds.size,
    excludedCount,
    reviewCount,
    allSelectableChecked:
      selectableItems.length > 0 &&
      selectableItems.every((item) => item.checked),
  };
}

function screenshotResultSelectionState(item) {
  const candidate = screenshotSelectedCandidate(item);
  if (!candidate) {
    return {
      className: "screenshot-result__selection-state--pending",
      label: "待核对",
    };
  }
  if (!item.checked) {
    return {
      className: "screenshot-result__selection-state--excluded",
      label: "已排除",
    };
  }
  return {
    className: "screenshot-result__selection-state--selected",
    label: item.autoSelected ? "已自动选择" : "已选择",
  };
}

function syncScreenshotResultRow(row, item) {
  if (!row || !item) {
    return;
  }
  const candidate = screenshotSelectedCandidate(item);
  const selectionState = screenshotResultSelectionState(item);
  row.classList.toggle(
    "screenshot-result--selected",
    Boolean(candidate && item.checked),
  );
  const state = row.querySelector("[data-screenshot-selection-state]");
  if (state) {
    state.className =
      `screenshot-result__selection-state ${selectionState.className}`;
    state.textContent = selectionState.label;
  }
  const checkbox = row.querySelector("[data-check-screenshot]");
  if (checkbox) {
    checkbox.disabled = !candidate || appState.screenshotFinished;
    checkbox.checked = Boolean(candidate && item.checked);
    checkbox.setAttribute(
      "aria-label",
      `加入本次导入：${candidate?.title || "所选官方短剧"}`,
    );
  }
  const reason = row.querySelector("[data-screenshot-reason]");
  if (reason) {
    const querySuffix =
      item.queryTruncated && item.query
        ? `搜索结果使用前 30 个字：${item.query}`
        : "";
    reason.classList.toggle(
      "screenshot-result__reason--error",
      Boolean(item.searchError),
    );
    reason.textContent = `${screenshotResultReason(item)}${querySuffix}`;
  }
}

function updateScreenshotControls() {
  const searching = appState.screenshotItems.some((item) => item.searching);
  const running =
    appState.screenshotPreparing ||
    appState.screenshotAnalyzing ||
    appState.screenshotImporting ||
    searching;
  const hasFiles = appState.screenshotFiles.length > 0;
  const stats = screenshotSelectionStats();

  elements.screenshotFiles.disabled =
    running || appState.screenshotFiles.length >= MAX_SCREENSHOTS;
  elements.screenshotPickerLabel.textContent = hasFiles
    ? appState.screenshotFiles.length >= MAX_SCREENSHOTS
      ? "已达上限"
      : "继续选择"
    : "选择截图";
  elements.screenshotPickerStatus.textContent = appState.screenshotPreparing
    ? "正在读取并准备图片…"
    : appState.screenshotFiles.length >= MAX_SCREENSHOTS
      ? `已添加 ${MAX_SCREENSHOTS} 张，达到本次上限`
      : hasFiles
        ? `已添加 ${appState.screenshotFiles.length} 张，可继续选择`
        : "可一次选择多张图片";
  elements.screenshotFiles
    .closest(".screenshot-file-field")
    ?.classList.toggle("is-disabled", elements.screenshotFiles.disabled);
  elements.analyzeScreenshots.disabled = running || !hasFiles;
  elements.importScreenshots.hidden =
    !appState.screenshotItems.length || appState.screenshotFinished;
  elements.importScreenshots.disabled =
    running || stats.selectedCount === 0 || appState.screenshotFinished;
  elements.selectAllScreenshots.disabled =
    running ||
    stats.selectableCount === 0 ||
    stats.allSelectableChecked ||
    appState.screenshotFinished;
  elements.clearScreenshotSelection.disabled =
    running || stats.selectedCount === 0 || appState.screenshotFinished;
  elements.screenshotContent.setAttribute("aria-busy", String(running));

  const analyzeBusy =
    appState.screenshotPreparing || appState.screenshotAnalyzing;
  elements.analyzeScreenshots.dataset.state = analyzeBusy
    ? appState.screenshotAnalyzing
      ? "running"
      : "busy"
    : appState.screenshotItems.length
      ? "rerun"
      : hasFiles && !running
        ? "ready"
        : "idle";
  elements.analyzeScreenshots.setAttribute(
    "aria-busy",
    String(analyzeBusy),
  );

  const analyzeLabel =
    elements.analyzeScreenshots.querySelector("[data-button-label]");
  if (analyzeLabel) {
    analyzeLabel.textContent = appState.screenshotAnalyzing
      ? "正在识别…"
      : appState.screenshotPreparing
        ? "正在准备…"
        : appState.screenshotItems.length
          ? "重新识别"
          : hasFiles
            ? `识别 ${appState.screenshotFiles.length} 张截图`
            : "识别截图";
  }

  if (!running) {
    const importLabel =
      elements.importScreenshots.querySelector("span:last-child");
    if (importLabel) {
      importLabel.textContent = stats.selectedCount
        ? `一次导入 ${stats.selectedCount} 部`
        : "一次导入";
    }
    const selectAllLabel =
      elements.selectAllScreenshots.querySelector("span:last-child");
    if (selectAllLabel) {
      selectAllLabel.textContent = stats.selectableCount
        ? `全选已匹配 ${stats.selectableCount} 部`
        : "全选已匹配";
    }
  }

  if (!appState.screenshotItems.length) {
    elements.screenshotResultsSummary.textContent = "";
    elements.screenshotSelectionCount.textContent = "";
    return;
  }

  const summaryParts = [
    `${appState.screenshotItems.length} 项 OCR 结果`,
    `${stats.selectedCount} 部已选择`,
  ];
  if (stats.reviewCount) {
    summaryParts.push(`${stats.reviewCount} 项待核对`);
  }
  if (stats.excludedCount) {
    summaryParts.push(`${stats.excludedCount} 项已排除`);
  }
  elements.screenshotResultsSummary.textContent = `${summaryParts.join("，")}。`;
  elements.screenshotSelectionCount.textContent = stats.selectedCount
    ? `已选择 ${stats.selectedCount} 部，可在底部一次导入。`
    : stats.selectableCount
      ? "已匹配项当前均未选择，请勾选后再导入。"
      : "还没有可导入的匹配项，请先核对下方结果。";
}

function renderScreenshotFiles() {
  elements.screenshotSelection.hidden = appState.screenshotFiles.length === 0;
  elements.screenshotFileCount.textContent = `${appState.screenshotFiles.length} / ${MAX_SCREENSHOTS} 张`;
  if (!appState.screenshotFiles.length) {
    elements.screenshotFileList.innerHTML = "";
    return;
  }

  const running =
    appState.screenshotPreparing ||
    appState.screenshotAnalyzing ||
    appState.screenshotImporting;
  elements.screenshotFileList.innerHTML = appState.screenshotFiles
    .map((file) => {
      const status =
        file.status === "analyzing"
          ? "正在识别"
          : file.status === "done"
            ? "识别完成"
            : file.status === "error"
              ? "识别失败"
              : "等待识别";
      return `
        <li class="screenshot-file" data-screenshot-file-id="${escapeHtml(
          file.id,
        )}">
          <img
            class="screenshot-file__preview"
            src="${escapeHtml(file.previewUrl)}"
            alt=""
            width="54"
            height="72"
          >
          <div class="screenshot-file__body">
            <strong>${escapeHtml(file.name)}</strong>
            <span>${file.width} × ${file.height}${file.compressed ? " · 已缩小" : ""}</span>
            <span class="screenshot-file__status screenshot-file__status--${escapeHtml(
              file.status,
            )}">${status}</span>
            ${
              file.error
                ? `<span class="screenshot-file__error">${escapeHtml(
                    file.error,
                  )}</span>`
                : ""
            }
          </div>
          <button
            class="icon-button screenshot-file__remove"
            type="button"
            data-remove-screenshot="${escapeHtml(file.id)}"
            aria-label="移除截图 ${escapeHtml(file.name)}"
            ${running ? "disabled" : ""}
          >
            ${icon("close")}
          </button>
        </li>
      `;
    })
    .join("");
}

function screenshotResultReason(item) {
  if (item.searchError) {
    return item.searchError;
  }
  if (item.tutorialLike) {
    return "疑似教程内容，默认不导入。确认是短剧时可手动搜索并勾选。";
  }
  if (!item.candidates.length) {
    return "没有找到官方候选。修改 OCR 标题后再搜索一次。";
  }
  if (!item.selectedSeriesId) {
    return item.selectionReason || "请核对候选并选择正确剧集。";
  }
  const selected = item.candidates.find(
    (candidate) => candidate.seriesId === item.selectedSeriesId,
  );
  return selected
    ? item.checked
      ? `已选择《${selected.title}》并加入本次导入。导入后会按官方分组核对并发现最新已发布季。`
      : `已匹配《${selected.title}》，当前未加入本次导入。`
    : item.selectionReason;
}

function renderScreenshotResults() {
  const items = appState.screenshotItems;
  elements.screenshotResults.hidden = items.length === 0;
  if (!items.length) {
    elements.screenshotResultList.innerHTML = "";
    elements.screenshotResultsSummary.textContent = "";
    updateScreenshotControls();
    return;
  }

  elements.screenshotResultList.innerHTML = items
    .map((item, index) => {
      const selectedCandidate = item.candidates.find(
        (candidate) => candidate.seriesId === item.selectedSeriesId,
      );
      const selectionState = screenshotResultSelectionState(item);
      const candidateOptions = item.candidates
        .map(
          (candidate) => `
            <option value="${escapeHtml(candidate.seriesId)}" ${
              candidate.seriesId === item.selectedSeriesId ? "selected" : ""
            }>
              ${escapeHtml(candidate.title)} · ${candidate.episodeCount} 集 · ${screenshotCandidateStatus(
                candidate.status,
              )}
            </option>
          `,
        )
        .join("");
      const controlsDisabled =
        item.searching ||
        appState.screenshotImporting ||
        appState.screenshotFinished;
      const reasonId = `screenshot-reason-${index + 1}`;
      return `
        <article
          class="screenshot-result ${
            item.checked && selectedCandidate
              ? "screenshot-result--selected"
              : ""
          }"
          data-item-key="${escapeHtml(item.key)}"
          aria-labelledby="screenshot-result-title-${index + 1}"
        >
          <div class="screenshot-result__header">
            <div>
              <h4 id="screenshot-result-title-${index + 1}">
                OCR 第 ${index + 1} 项
              </h4>
              <div class="screenshot-result__meta">
                <span>${escapeHtml(item.progress?.label || "集数未识别")}</span>
                <span>置信度 ${Math.round(item.confidence || 0)}%</span>
                ${
                  item.tutorialLike
                    ? '<span class="screenshot-result__tag">疑似教程</span>'
                    : ""
                }
                <span
                  class="screenshot-result__selection-state ${selectionState.className}"
                  data-screenshot-selection-state
                >${selectionState.label}</span>
              </div>
            </div>
            ${
              item.searching
                ? '<span class="screenshot-result__searching"><span class="spinner" aria-hidden="true"></span>搜索中</span>'
                : ""
            }
          </div>

          <div class="screenshot-title-row">
            <div class="field">
              <label for="screenshot-title-${index + 1}">OCR 识别标题（可修改）</label>
              <input
                id="screenshot-title-${index + 1}"
                type="text"
                value="${escapeHtml(item.title)}"
                maxlength="80"
                data-screenshot-title="${escapeHtml(item.key)}"
                ${controlsDisabled ? "disabled" : ""}
              >
            </div>
            <button
              class="button button--secondary screenshot-search-button"
              type="button"
              data-search-screenshot="${escapeHtml(item.key)}"
              ${controlsDisabled ? "disabled" : ""}
            >
              ${icon("search")}
              <span>重新搜索</span>
            </button>
          </div>

          <div class="field">
            <label for="screenshot-candidate-${index + 1}">匹配的官方短剧</label>
            <select
              id="screenshot-candidate-${index + 1}"
              data-screenshot-candidate="${escapeHtml(item.key)}"
              aria-describedby="${reasonId}"
              ${controlsDisabled || !item.candidates.length ? "disabled" : ""}
            >
              <option value="">请选择官方短剧</option>
              ${candidateOptions}
            </select>
          </div>

          <p
            class="screenshot-result__reason ${
              item.searchError ? "screenshot-result__reason--error" : ""
            }"
            id="${reasonId}"
            data-screenshot-reason
          >
            ${escapeHtml(screenshotResultReason(item))}
            ${
              item.queryTruncated
                ? `搜索结果使用前 30 个字：${escapeHtml(item.query)}`
                : ""
            }
          </p>

          <label
            class="check-field screenshot-result__confirm"
            for="screenshot-import-${index + 1}"
          >
            <input
              id="screenshot-import-${index + 1}"
              type="checkbox"
              data-check-screenshot="${escapeHtml(item.key)}"
              aria-label="加入本次导入：${
                selectedCandidate
                  ? escapeHtml(selectedCandidate.title)
                  : "所选官方短剧"
              }"
              ${item.checked ? "checked" : ""}
              ${!item.selectedSeriesId || controlsDisabled ? "disabled" : ""}
            >
            <span>加入本次导入</span>
          </label>
        </article>
      `;
    })
    .join("");
  updateScreenshotControls();
}

function clearScreenshotPreviewUrls() {
  for (const file of appState.screenshotFiles) {
    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }
  }
}

function invalidateScreenshotResults() {
  appState.screenshotItems = [];
  appState.screenshotFinished = false;
  elements.screenshotResults.hidden = true;
  elements.screenshotImportOutcomes.hidden = true;
  elements.screenshotResultList.innerHTML = "";
  elements.screenshotOutcomeList.innerHTML = "";
  updateScreenshotControls();
}

function resetScreenshotImport() {
  clearScreenshotPreviewUrls();
  appState.screenshotFiles = [];
  appState.screenshotItems = [];
  appState.screenshotPreparing = false;
  appState.screenshotAnalyzing = false;
  appState.screenshotImporting = false;
  appState.screenshotFinished = false;
  elements.screenshotFiles.value = "";
  elements.screenshotSelection.hidden = true;
  elements.screenshotFileList.innerHTML = "";
  elements.screenshotResults.hidden = true;
  elements.screenshotResultList.innerHTML = "";
  elements.screenshotImportOutcomes.hidden = true;
  elements.screenshotOutcomeList.innerHTML = "";
  setFormFeedback(elements.screenshotFeedback);
  renderScreenshotFiles();
  updateScreenshotControls();
}

async function handleScreenshotFiles() {
  if (
    appState.screenshotPreparing ||
    appState.screenshotAnalyzing ||
    appState.screenshotImporting
  ) {
    return;
  }
  const available = MAX_SCREENSHOTS - appState.screenshotFiles.length;
  const chosen = [...(elements.screenshotFiles.files || [])];
  elements.screenshotFiles.value = "";
  if (!chosen.length) {
    return;
  }
  if (available <= 0) {
    setFormFeedback(
      elements.screenshotFeedback,
      `一次最多选择 ${MAX_SCREENSHOTS} 张截图。`,
    );
    return;
  }

  const accepted = chosen.slice(0, available);
  const limitMessage =
    chosen.length > available
      ? `一次最多 ${MAX_SCREENSHOTS} 张，本次只处理前 ${available} 张。`
      : "";
  invalidateScreenshotResults();
  setFormFeedback(elements.screenshotFeedback);
  appState.screenshotPreparing = true;
  updateScreenshotControls();

  const errors = [];
  let addedCount = 0;
  for (let index = 0; index < accepted.length; index += 1) {
    const file = accepted[index];
    setFormFeedback(
      elements.screenshotFeedback,
      `正在准备第 ${index + 1} / ${accepted.length} 张截图…`,
      "success",
    );
    try {
      const prepared = await prepareScreenshot(file);
      appState.screenshotFiles.push({
        id: `screenshot-file-${++appState.screenshotSequence}`,
        name: file.name || `截图 ${appState.screenshotFiles.length + 1}`,
        previewUrl: URL.createObjectURL(prepared.blob),
        blob: prepared.blob,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        compressed: prepared.compressed,
        status: "ready",
        error: "",
      });
      addedCount += 1;
      renderScreenshotFiles();
    } catch (error) {
      errors.push(`${file.name || "未命名截图"}：${error.message}`);
    }
  }

  appState.screenshotPreparing = false;
  renderScreenshotFiles();
  updateScreenshotControls();
  const messages = [];
  if (limitMessage) {
    messages.push(limitMessage);
  }
  if (errors.length) {
    messages.push(...errors);
  }
  if (messages.length) {
    setFormFeedback(
      elements.screenshotFeedback,
      `${addedCount ? `已添加 ${addedCount} 张。` : ""}${messages.join(" ")}`,
    );
  } else if (addedCount) {
    setFormFeedback(
      elements.screenshotFeedback,
      `已添加 ${addedCount} 张截图，可以开始识别。`,
      "success",
    );
  }
}

function screenshotItemByKey(key) {
  return appState.screenshotItems.find((item) => item.key === key);
}

function mergeScreenshotResultItems(payloadItems) {
  const byKey = new Map(
    appState.screenshotItems.map((item) => [item.dedupeKey, item]),
  );
  for (const rawItem of Array.isArray(payloadItems) ? payloadItems : []) {
    const title = String(rawItem?.title || rawItem?.rawTitle || "").trim();
    const titleKey = `title:${String(
      rawItem?.dedupeKey || title,
    )
      .toLocaleLowerCase("zh-CN")
      .replace(/[^\p{L}\p{N}]/gu, "")}`;
    if (!title || titleKey === "title:") {
      continue;
    }
    const candidates = [];
    const candidateIds = new Set();
    for (const rawCandidate of Array.isArray(rawItem.candidates)
      ? rawItem.candidates
      : []) {
      const candidate = normalizeScreenshotCandidate(rawCandidate);
      if (candidate && !candidateIds.has(candidate.seriesId)) {
        candidateIds.add(candidate.seriesId);
        candidates.push(candidate);
      }
    }

    const suggestedCandidate = candidates.find(
      (candidate) => candidate.seriesId === rawItem.suggestedSeriesId,
    );
    const rawSeriesGroupId = String(rawItem.seriesGroupId || "");
    const seriesGroupId =
      (/^\d{8,25}$/.test(rawSeriesGroupId) ? rawSeriesGroupId : "") ||
      suggestedCandidate?.seriesGroupId ||
      null;
    const dedupeKey = seriesGroupId
      ? `group:${seriesGroupId}`
      : titleKey;
    const sameGroupItem = byKey.get(dedupeKey);
    const sameTitleItem = seriesGroupId ? byKey.get(titleKey) : null;
    let existing = sameGroupItem;
    if (
      !existing &&
      sameTitleItem &&
      (!sameTitleItem.seriesGroupId ||
        sameTitleItem.seriesGroupId === seriesGroupId)
    ) {
      existing = sameTitleItem;
    }
    if (existing) {
      const existingCandidates = new Map(
        existing.candidates.map((candidate) => [
          candidate.seriesId,
          candidate,
        ]),
      );
      for (const candidate of candidates) {
        const current = existingCandidates.get(candidate.seriesId);
        if (current) {
          const merged = mergeScreenshotCandidateMetadata(current, candidate);
          existingCandidates.set(candidate.seriesId, merged);
          const index = existing.candidates.findIndex(
            (item) => item.seriesId === candidate.seriesId,
          );
          if (index >= 0) {
            existing.candidates[index] = merged;
          }
        } else {
          existing.candidates.push(candidate);
          existingCandidates.set(candidate.seriesId, candidate);
        }
      }
      existing.confidence = Math.max(
        existing.confidence,
        Number(rawItem.confidence) || 0,
      );
      existing.seriesGroupId ||= seriesGroupId;
      const currentSuggested = existing.candidates.find(
        (candidate) =>
          candidate.seriesId === existing.suggestedSeriesId,
      );
      const nextSuggested = existing.candidates.find(
        (candidate) => candidate.seriesId === suggestedCandidate?.seriesId,
      );
      existing.suggestedSeriesId =
        preferredScreenshotCandidate(currentSuggested, nextSuggested)
          ?.seriesId || "";
      if (seriesGroupId) {
        byKey.delete(existing.dedupeKey);
        existing.dedupeKey = dedupeKey;
        byKey.set(dedupeKey, existing);
      }
      if (!existing.selectedSeriesId || existing.autoSelected) {
        applyScreenshotAutomaticSelection(existing);
      }
      continue;
    }

    const item = {
      key: `screenshot-item-${appState.screenshotItems.length + 1}`,
      dedupeKey,
      seriesGroupId,
      title,
      rawTitle: String(rawItem.rawTitle || title),
      confidence: Number(rawItem.confidence) || 0,
      progress: rawItem.progress || null,
      tutorialLike: Boolean(rawItem.tutorialLike),
      candidates,
      suggestedSeriesId: suggestedCandidate?.seriesId || "",
      selectedSeriesId: "",
      checked: false,
      autoSelected: false,
      searching: false,
      selectionReason: String(rawItem.selectionReason || ""),
      searchError: String(rawItem.searchError || ""),
      query: String(rawItem.query || ""),
      queryTruncated: Boolean(rawItem.queryTruncated),
    };
    applyScreenshotAutomaticSelection(item);
    appState.screenshotItems.push(item);
    byKey.set(dedupeKey, item);
  }
}

let screenshotWarmupPromise = null;

function warmupScreenshotOcr() {
  if (screenshotWarmupPromise) {
    return screenshotWarmupPromise;
  }
  screenshotWarmupPromise = requestJson(
    "/api/screenshot-import/warmup",
    {
      method: "POST",
      timeoutMs: SCREENSHOT_ANALYZE_TIMEOUT_MS,
    },
  )
    .catch(() => null)
    .finally(() => {
      screenshotWarmupPromise = null;
    });
  return screenshotWarmupPromise;
}

async function analyzeScreenshots() {
  if (
    !appState.screenshotFiles.length ||
    appState.screenshotPreparing ||
    appState.screenshotAnalyzing ||
    appState.screenshotImporting
  ) {
    return;
  }

  const runId = ++appState.screenshotRunId;
  appState.screenshotAnalyzing = true;
  appState.screenshotFinished = false;
  appState.screenshotItems = [];
  elements.screenshotResults.hidden = true;
  elements.screenshotImportOutcomes.hidden = true;
  elements.screenshotResultList.innerHTML = "";
  elements.screenshotOutcomeList.innerHTML = "";
  for (const file of appState.screenshotFiles) {
    file.status = "ready";
    file.error = "";
  }
  renderScreenshotFiles();
  updateScreenshotControls();

  let failedCount = 0;
  let completedCount = 0;
  let nextIndex = 0;
  const total = appState.screenshotFiles.length;
  warmupScreenshotOcr();

  async function analyzeNextFile() {
    while (nextIndex < total) {
      if (runId !== appState.screenshotRunId) {
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      const file = appState.screenshotFiles[index];
      file.status = "analyzing";
      renderScreenshotFiles();
      setFormFeedback(
        elements.screenshotFeedback,
        `正在本机识别截图 ${completedCount + 1} / ${total}…`,
        "success",
      );
      try {
        const payload = await requestJson("/api/screenshot-import/analyze", {
          method: "POST",
          headers: {
            "content-type": file.mimeType || file.blob.type,
          },
          body: file.blob,
          timeoutMs: SCREENSHOT_ANALYZE_TIMEOUT_MS,
        });
        if (runId !== appState.screenshotRunId) {
          return;
        }
        mergeScreenshotResultItems(payload.items);
        file.status = "done";
      } catch (error) {
        if (runId !== appState.screenshotRunId) {
          return;
        }
        failedCount += 1;
        file.status = "error";
        file.error = error.message;
      }
      completedCount += 1;
      renderScreenshotFiles();
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(SCREENSHOT_ANALYZE_CONCURRENCY, total) },
      () => analyzeNextFile(),
    ),
  );
  if (runId !== appState.screenshotRunId) {
    return;
  }

  appState.screenshotAnalyzing = false;
  renderScreenshotFiles();
  renderScreenshotResults();
  if (!appState.screenshotItems.length) {
    setFormFeedback(
      elements.screenshotFeedback,
      failedCount
        ? "截图识别失败。请检查图片格式，或裁切出包含剧名和集数的区域后重试。"
        : "没有识别到可导入的剧集。请上传露出剧名和集数的收藏页截图。",
    );
    return;
  }

  const stats = screenshotSelectionStats();
  const recognitionSummary = failedCount
    ? `${failedCount} 张截图识别失败。`
    : "";
  const selectionSummary = stats.selectedCount
    ? `已自动选择 ${stats.selectedCount} 部，确认无误后可在底部一次导入。`
    : "暂未自动选择短剧，请核对下方结果后选择。";
  const reviewSummary = stats.reviewCount
    ? `另有 ${stats.reviewCount} 项需要人工核对。`
    : "";
  setFormFeedback(
    elements.screenshotFeedback,
    `识别完成。${recognitionSummary}${selectionSummary}${reviewSummary}`,
    failedCount ? "error" : "success",
  );
  elements.screenshotResultsTitle.focus();
}

async function searchScreenshotItem(key) {
  const item = screenshotItemByKey(key);
  const row = elements.screenshotResultList.querySelector(
    `[data-item-key="${key}"]`,
  );
  const input = row?.querySelector(`[data-screenshot-title="${key}"]`);
  if (!item || !input || item.searching || appState.screenshotFinished) {
    return;
  }

  const title = input.value.trim();
  setFieldError(input, false);
  if (!title) {
    setFieldError(input, true);
    setFormFeedback(elements.screenshotFeedback, "请先填写要搜索的剧名。");
    input.focus();
    return;
  }

  item.title = title;
  item.searching = true;
  item.searchError = "";
  item.suggestedSeriesId = "";
  item.selectionReason = "正在重新匹配官方短剧，请稍候。";
  setScreenshotItemCandidate(item, null, {
    checked: false,
    automatic: false,
  });
  renderScreenshotResults();
  setFormFeedback(
    elements.screenshotFeedback,
    `正在搜索《${title}》…`,
    "success",
  );
  const query = [...title].slice(0, 30).join("");
  try {
    const payload = await requestJson(
      `/api/series/search?query=${encodeURIComponent(query)}`,
      { method: "GET" },
    );
    const candidates = (Array.isArray(payload.results) ? payload.results : [])
      .map(normalizeScreenshotCandidate)
      .filter(Boolean)
      .sort(
        (left, right) =>
          candidatePriority(title, right) -
          candidatePriority(title, left),
      );
    item.candidates = candidates;
    const exact = candidates.find(
      (candidate) => candidatePriority(title, candidate) === 3,
    );
    const automaticCandidate =
      exact ||
      (candidates.length === 1 &&
      candidatePriority(title, candidates[0]) >= 2
        ? candidates[0]
        : null);
    item.suggestedSeriesId = automaticCandidate?.seriesId || "";
    setScreenshotItemCandidate(item, automaticCandidate, {
      checked: Boolean(automaticCandidate),
      automatic: Boolean(automaticCandidate),
    });
    item.query = query;
    item.queryTruncated = [...query].length < [...title].length;
    item.selectionReason = automaticCandidate
      ? "已自动匹配到较可信的官方候选。"
      : candidates.length
        ? "匹配度不足，请从官方候选中手动选择。"
      : "没有找到官方候选，请修改标题后重试。";
    setFormFeedback(
      elements.screenshotFeedback,
      candidates.length
        ? `《${title}》找到 ${candidates.length} 个官方候选。`
        : `没有找到《${title}》的官方候选。`,
      candidates.length ? "success" : "error",
    );
  } catch (error) {
    item.searchError = error.message;
    item.selectionReason = "搜索失败，请稍后修改标题重试。";
    setFormFeedback(elements.screenshotFeedback, error.message);
  } finally {
    item.searching = false;
    renderScreenshotResults();
    requestAnimationFrame(() => {
      const nextRow = elements.screenshotResultList.querySelector(
        `[data-item-key="${key}"]`,
      );
      const select = nextRow?.querySelector(
        `[data-screenshot-candidate="${key}"]`,
      );
      (select && !select.disabled ? select : nextRow?.querySelector("input"))
        ?.focus();
    });
  }
}

function renderScreenshotOutcomes(result, selectedItems) {
  const itemBySeriesId = new Map(
    selectedItems.map((item) => [
      item.selectedSeriesId,
      item.candidates.find(
        (candidate) => candidate.seriesId === item.selectedSeriesId,
      ),
    ]),
  );
  const outcomes = Array.isArray(result?.outcomes) ? result.outcomes : [];
  elements.screenshotOutcomeList.innerHTML = outcomes
    .map((outcome) => {
      const candidate = itemBySeriesId.get(outcome.seriesId);
      const title = outcome.title || candidate?.title || "未知短剧";
      const statusLabel =
        outcome.status === "imported"
          ? "已导入"
          : outcome.status === "skipped"
            ? "已跳过"
            : "失败";
      return `
        <li class="screenshot-outcome screenshot-outcome--${escapeHtml(
          outcome.status,
        )}">
          <span class="screenshot-outcome__icon">${icon(
            outcome.status === "imported"
              ? "check"
              : outcome.status === "skipped"
                ? "clock"
                : "alert",
          )}</span>
          <div>
            <strong>${statusLabel} · ${escapeHtml(title)}</strong>
            <p>${escapeHtml(outcome.message || "")}</p>
          </div>
        </li>
      `;
    })
    .join("");
  elements.screenshotImportOutcomes.hidden = outcomes.length === 0;
}

async function importSelectedScreenshots() {
  if (
    appState.screenshotImporting ||
    appState.screenshotFinished ||
    appState.screenshotAnalyzing
  ) {
    return;
  }
  const selectedItems = appState.screenshotItems.filter(
    (item) => item.checked && item.selectedSeriesId,
  );
  const seriesIds = [
    ...new Set(selectedItems.map((item) => item.selectedSeriesId)),
  ];
  if (!seriesIds.length) {
    setFormFeedback(
      elements.screenshotFeedback,
      "请至少核对并勾选一部要导入的短剧。",
    );
    return;
  }

  appState.screenshotImporting = true;
  setButtonBusy(elements.importScreenshots, true, "正在导入…");
  updateScreenshotControls();
  setFormFeedback(
    elements.screenshotFeedback,
    `正在导入 ${seriesIds.length} 部短剧，并检查同系列最新已发布季…`,
    "success",
  );
  try {
    const payload = await requestJson("/api/screenshot-import/import", {
      method: "POST",
      body: JSON.stringify({ seriesIds }),
      timeoutMs: SCREENSHOT_IMPORT_TIMEOUT_MS,
    });
    const result = payload.result || {};
    const outcomeBySeriesId = new Map(
      (Array.isArray(result.outcomes) ? result.outcomes : []).map(
        (outcome) => [outcome.seriesId, outcome],
      ),
    );
    for (const item of selectedItems) {
      const outcome = outcomeBySeriesId.get(item.selectedSeriesId);
      if (outcome && outcome.status !== "failed") {
        item.checked = false;
        item.autoSelected = false;
      }
    }
    appState.screenshotFinished = !(Number(result.failedCount) > 0);
    const hasProblems =
      result.failedCount > 0 || result.checkErrors > 0;
    const resultMessage =
      Number(result.failedCount) > 0
        ? `${payload.message} 失败项已保留，可直接再次导入。`
        : payload.message;
    renderScreenshotOutcomes(result, selectedItems);
    renderScreenshotResults();
    setFormFeedback(
      elements.screenshotFeedback,
      resultMessage,
      hasProblems ? "error" : "success",
    );
    showToast(resultMessage, hasProblems ? "error" : "success");
    await loadDashboard({ silent: true });
    elements.screenshotOutcomeTitle.focus();
  } catch (error) {
    setFormFeedback(elements.screenshotFeedback, error.message);
  } finally {
    appState.screenshotImporting = false;
    setButtonBusy(elements.importScreenshots, false);
    updateScreenshotControls();
  }
}

elements.screenshotFiles.addEventListener("change", () => {
  void handleScreenshotFiles();
});

elements.screenshotFileList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-screenshot]");
  if (!removeButton) {
    return;
  }
  const fileId = removeButton.dataset.removeScreenshot;
  const file = appState.screenshotFiles.find((item) => item.id === fileId);
  if (file?.previewUrl) {
    URL.revokeObjectURL(file.previewUrl);
  }
  appState.screenshotFiles = appState.screenshotFiles.filter(
    (item) => item.id !== fileId,
  );
  invalidateScreenshotResults();
  setFormFeedback(
    elements.screenshotFeedback,
    appState.screenshotFiles.length
      ? "截图已移除，请重新识别剩余截图。"
      : "尚未添加截图。",
    appState.screenshotFiles.length ? "error" : "error",
  );
  renderScreenshotFiles();
});

elements.analyzeScreenshots.addEventListener("click", () => {
  void analyzeScreenshots();
});

elements.selectAllScreenshots.addEventListener("click", () => {
  let changedCount = 0;
  for (const item of appState.screenshotItems) {
    if (screenshotSelectedCandidate(item) && !item.checked) {
      item.checked = true;
      item.autoSelected = false;
      changedCount += 1;
    }
  }
  renderScreenshotResults();
  if (changedCount) {
    setFormFeedback(
      elements.screenshotFeedback,
      `已选择全部 ${screenshotSelectionStats().selectedCount} 部已匹配短剧。`,
      "success",
    );
  }
});

elements.clearScreenshotSelection.addEventListener("click", () => {
  let changedCount = 0;
  for (const item of appState.screenshotItems) {
    if (item.checked) {
      item.checked = false;
      item.autoSelected = false;
      changedCount += 1;
    }
  }
  renderScreenshotResults();
  if (changedCount) {
    setFormFeedback(
      elements.screenshotFeedback,
      "已取消全部选择。仍可单独勾选需要导入的短剧。",
      "success",
    );
  }
});

elements.screenshotResultList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-screenshot-title]");
  if (!input) {
    return;
  }
  const item = screenshotItemByKey(input.dataset.screenshotTitle);
  if (item) {
    item.title = input.value;
  }
  setFieldError(input, false);
});

elements.screenshotResultList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-screenshot-candidate]");
  if (select) {
    const item = screenshotItemByKey(select.dataset.screenshotCandidate);
    if (!item) {
      return;
    }
    const selectedCandidate = item.candidates.find(
      (option) => option.seriesId === select.value,
    );
    setScreenshotItemCandidate(item, selectedCandidate, {
      checked: Boolean(selectedCandidate),
      automatic: false,
    });
    const row = select.closest("[data-item-key]");
    syncScreenshotResultRow(row, item);
    updateScreenshotControls();
    return;
  }

  const checkbox = event.target.closest("[data-check-screenshot]");
  if (!checkbox) {
    return;
  }
  const item = screenshotItemByKey(checkbox.dataset.checkScreenshot);
  if (item) {
    item.checked = checkbox.checked;
    item.autoSelected = false;
    syncScreenshotResultRow(checkbox.closest("[data-item-key]"), item);
  }
  updateScreenshotControls();
});

elements.screenshotResultList.addEventListener("click", (event) => {
  const searchButton = event.target.closest("[data-search-screenshot]");
  if (searchButton) {
    void searchScreenshotItem(searchButton.dataset.searchScreenshot);
  }
});

elements.importScreenshots.addEventListener("click", () => {
  void importSelectedScreenshots();
});

elements.openScreenshotImport.addEventListener("click", () => {
  appState.screenshotReturnFocus = document.activeElement;
  resetScreenshotImport();
  openDialog(elements.screenshotDialog);
  void warmupScreenshotOcr();
  requestAnimationFrame(() => {
    elements.screenshotFiles.focus();
  });
});

elements.screenshotDialog.addEventListener("close", () => {
  const returnFocus = appState.screenshotReturnFocus;
  appState.screenshotReturnFocus = null;
  appState.screenshotRunId += 1;
  resetScreenshotImport();
  requestAnimationFrame(() => returnFocus?.focus());
});

function isAccountRequestAbort(error) {
  return error?.name === "AbortError";
}

function accountRunIsCurrent(generation) {
  return appState.account.requestGeneration === generation;
}

function clearAccountPollTimer() {
  if (appState.account.pollTimer !== null) {
    window.clearTimeout(appState.account.pollTimer);
    appState.account.pollTimer = null;
  }
}

function clearAccountLoginRetryTimer() {
  if (appState.account.loginRetryTimer !== null) {
    window.clearTimeout(appState.account.loginRetryTimer);
    appState.account.loginRetryTimer = null;
  }
}

function clearAccountQrImageRetryTimer() {
  if (appState.account.qrImageRetryTimer !== null) {
    window.clearTimeout(appState.account.qrImageRetryTimer);
    appState.account.qrImageRetryTimer = null;
  }
}

function clearSmsPollTimer() {
  if (appState.account.smsPollTimer !== null) {
    window.clearTimeout(appState.account.smsPollTimer);
    appState.account.smsPollTimer = null;
  }
}

function clearSmsCountdownTimer() {
  if (appState.account.smsCountdownTimer !== null) {
    window.clearInterval(appState.account.smsCountdownTimer);
    appState.account.smsCountdownTimer = null;
  }
}

function cancelAccountLoginSession(loginId) {
  if (!loginId) {
    return;
  }
  void fetch(`/api/account/login/${encodeURIComponent(loginId)}`, {
    method: "DELETE",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {});
}

function cancelAccountSmsLoginSession(loginId) {
  if (!loginId) {
    return;
  }
  void fetch(`/api/account/sms-login/${encodeURIComponent(loginId)}`, {
    method: "DELETE",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {});
}

function newAccountRun() {
  clearAccountPollTimer();
  clearAccountLoginRetryTimer();
  clearAccountQrImageRetryTimer();
  clearSmsPollTimer();
  appState.account.controller?.abort();
  appState.account.requestGeneration += 1;
  appState.account.controller = new AbortController();
  return {
    generation: appState.account.requestGeneration,
    controller: appState.account.controller,
  };
}

function setAccountFeedback(message = "", type = "error") {
  setFormFeedback(elements.accountFeedback, message, type);
}

function setAccountBusy(busy) {
  appState.account.busy = busy;
  elements.accountContent.setAttribute(
    "aria-busy",
    String(busy),
  );
  updateAccountControls();
}

function accountLoginMethodIsBusy(method) {
  if (method === "sms") {
    return appState.account.smsBusy;
  }
  return Boolean(
    appState.account.busy &&
      ["preparing", "pending", "profile_loading"].includes(
        appState.account.loginStatus,
      ),
  );
}

function resetAccountQrLoginState() {
  clearAccountPollTimer();
  clearAccountLoginRetryTimer();
  clearAccountQrImageRetryTimer();
  appState.account.loginId = "";
  appState.account.loginExpiresAt = "";
  appState.account.loginStatus = "idle";
  appState.account.pollFailures = 0;
}

function setAccountQrExpiry(expiresAt) {
  const timestamp = Date.parse(expiresAt || "");
  if (!Number.isFinite(timestamp)) {
    elements.accountQrExpiry.textContent = "";
    return;
  }
  elements.accountQrExpiry.textContent =
    timestamp <= Date.now()
      ? "二维码已过期"
      : `二维码有效期至 ${formatDateTime(
          new Date(timestamp).toISOString(),
        )}`;
}

function accountQrPollIsCurrent(generation, loginId) {
  return (
    accountRunIsCurrent(generation) &&
    (appState.account.loginId === loginId ||
      appState.account.loginStatus === "profile_loading")
  );
}

function resetAccountQr() {
  clearAccountQrImageRetryTimer();
  elements.accountQrImage.onload = null;
  elements.accountQrImage.onerror = null;
  elements.accountQrImage.hidden = true;
  elements.accountQrImage.removeAttribute("src");
  elements.accountQrPlaceholder.hidden = false;
  elements.accountQrSpinner.hidden = false;
  elements.accountLoginRetry.hidden = true;
  setAccountLoginRetryLabel("重新生成二维码");
  elements.accountQrExpiry.textContent = "";
}

function setAccountLoginRetryLabel(label) {
  const text = elements.accountLoginRetry.querySelector("span");
  if (text) {
    text.textContent = label;
  }
}

function setAccountLoginMethod(method, { focus = false } = {}) {
  const nextMethod = method === "sms" ? "sms" : "qr";
  appState.account.loginMethod = nextMethod;
  for (const tab of elements.accountLoginTabs) {
    const selected = tab.dataset.accountLoginMethod === nextMethod;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) {
      tab.focus();
    }
  }
  for (const panel of elements.accountLoginPanels) {
    panel.hidden = panel.dataset.accountLoginPanel !== nextMethod;
  }
}

function resetAccountSms({ clearInputs = false } = {}) {
  clearSmsPollTimer();
  clearSmsCountdownTimer();
  appState.account.smsLoginId = "";
  appState.account.smsStatus = "idle";
  appState.account.smsRetryAfterSeconds = 0;
  appState.account.smsBusy = false;
  appState.account.smsQrFallbackRequired = false;
  elements.accountSmsForm.removeAttribute("aria-busy");
  if (clearInputs) {
    elements.accountSmsForm.reset();
    setFieldError(elements.accountSmsMobile, false);
    setFieldError(elements.accountSmsCode, false);
  }
  elements.accountSmsLoginStatus.textContent =
    "输入手机号后获取验证码。";
  elements.accountSmsUseQr.hidden = true;
  elements.accountSmsSendCode.classList.remove("is-busy");
  elements.accountSmsSendCode.removeAttribute("aria-busy");
  const sendLabel = elements.accountSmsSendCode.querySelector(
    "[data-button-label]",
  );
  if (sendLabel) {
    sendLabel.textContent = "发送验证码";
  }
  delete elements.accountSmsSendCode.dataset.idleLabel;
  updateAccountControls();
}

function switchAccountLoginMethod(method, { focus = false } = {}) {
  const nextMethod = method === "sms" ? "sms" : "qr";
  if (appState.account.loginMethod === nextMethod) {
    setAccountLoginMethod(nextMethod, { focus });
    if (
      nextMethod === "qr" &&
      ["failed", "expired"].includes(appState.account.loginStatus)
    ) {
      restartAccountQrLogin();
    }
    return;
  }
  if (
    nextMethod === "sms" &&
    appState.account.loginMethod === "qr" &&
    appState.account.loginStatus === "profile_loading"
  ) {
    setAccountLoginMethod(nextMethod, { focus });
    elements.accountSmsLoginStatus.textContent =
      "登录已确认，正在读取账号资料…";
    return;
  }
  const qrLoginId = appState.account.loginId;
  const smsLoginId = appState.account.smsLoginId;
  const run = newAccountRun();
  resetAccountQrLoginState();
  cancelAccountLoginSession(qrLoginId);
  resetAccountSms();
  cancelAccountSmsLoginSession(smsLoginId);
  setAccountLoginMethod(nextMethod, { focus });
  if (nextMethod === "qr") {
    void beginAccountLogin(run);
    return;
  }
  elements.accountSmsMobile.focus({ preventScroll: true });
}

function maskSmsLoginNumber(countryCode, mobile) {
  const code = String(countryCode || "").replace(/^\+/, "");
  const digits = String(mobile || "").replace(/\D/g, "");
  const visible = digits.slice(-4);
  return `+${code} ${"*".repeat(Math.max(3, digits.length - 4))}${visible}`;
}

function validateSmsMobileInput() {
  const countryCode = elements.accountSmsCountryCode.value;
  const mobile = elements.accountSmsMobile.value.trim();
  const normalized = mobile.replace(/[\s()-]/g, "");
  let message = "";
  if (!/^\d{1,4}$/.test(countryCode) || countryCode === "0") {
    message = "手机号区号格式不正确。";
  } else if (!/^\d{5,15}$/.test(normalized) || normalized.startsWith("0")) {
    message = "手机号格式不正确，请检查后重试。";
  } else if (countryCode === "86" && !/^1\d{10}$/.test(normalized)) {
    message = "中国大陆手机号应为 1 开头的 11 位数字。";
  }
  setFieldError(elements.accountSmsMobile, Boolean(message));
  return {
    valid: !message,
    message,
    countryCode,
    mobile,
  };
}

function updateSmsCountdown() {
  const remaining = Math.max(
    0,
    Number(appState.account.smsRetryAfterSeconds) || 0,
  );
  const label = elements.accountSmsSendCode.querySelector(
    "[data-button-label]",
  );
  if (remaining > 0) {
    elements.accountSmsSendCode.disabled = true;
    if (label) {
      label.textContent = `${remaining} 秒后重发`;
    }
    return;
  }
  clearSmsCountdownTimer();
  elements.accountSmsSendCode.disabled =
    appState.account.smsBusy || appState.account.busy;
  if (label) {
    label.textContent = "重新发送";
  }
}

function startSmsCountdown(seconds) {
  clearSmsCountdownTimer();
  const initial = Math.max(
    0,
    Number(seconds) || ACCOUNT_SMS_DEFAULT_RETRY_SECONDS,
  );
  appState.account.smsRetryAfterSeconds = initial;
  updateSmsCountdown();
  if (initial <= 0) {
    return;
  }
  appState.account.smsCountdownTimer = window.setInterval(() => {
    appState.account.smsRetryAfterSeconds = Math.max(
      0,
      appState.account.smsRetryAfterSeconds - 1,
    );
    updateSmsCountdown();
  }, 1_000);
}

function showAccountLoginPending(message = "正在生成登录二维码…") {
  elements.accountLoginView.hidden = false;
  elements.accountProfileView.hidden = true;
  resetAccountQr();
  elements.accountQrPlaceholderText.textContent = message;
  elements.accountLoginStatus.textContent = message;
  elements.accountLoginRetry.hidden = true;
  appState.account.loginStatus = "preparing";
  updateAccountControls();
}

function showAccountLoginFailure(
  message,
  {
    title = "二维码生成失败",
    retryLabel = "重新生成二维码",
  } = {},
) {
  const loginId = appState.account.loginId;
  clearAccountQrImageRetryTimer();
  elements.accountLoginView.hidden = false;
  elements.accountProfileView.hidden = true;
  elements.accountQrImage.hidden = true;
  elements.accountQrPlaceholder.hidden = false;
  elements.accountQrSpinner.hidden = true;
  elements.accountQrPlaceholderText.textContent = title;
  elements.accountQrExpiry.textContent = "";
  elements.accountLoginStatus.textContent = message;
  elements.accountLoginRetry.hidden = false;
  setAccountLoginRetryLabel(retryLabel);
  appState.account.loginStatus = "failed";
  appState.account.loginId = "";
  clearAccountPollTimer();
  updateAccountControls();
  cancelAccountLoginSession(loginId);
}

function showSmsLoginFailure(message, { offerQr = false } = {}) {
  const loginId = appState.account.smsLoginId;
  appState.account.smsLoginId = "";
  appState.account.smsStatus = "failed";
  appState.account.smsQrFallbackRequired = offerQr;
  clearSmsPollTimer();
  clearSmsCountdownTimer();
  cancelAccountSmsLoginSession(loginId);
  elements.accountSmsLoginStatus.textContent = message;
  elements.accountSmsSendCode.disabled =
    appState.account.busy || appState.account.smsBusy;
  elements.accountSmsSubmit.disabled = true;
  elements.accountSmsUseQr.hidden = !offerQr;
  setFieldError(elements.accountSmsCode, false);
  updateAccountControls();
  if (offerQr) {
    requestAnimationFrame(() => {
      elements.accountSmsUseQr.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches
          ? "auto"
          : "smooth",
      });
      elements.accountSmsUseQr.focus({ preventScroll: true });
    });
  }
}

function showAccountLoginExpired(message = "二维码已失效，请重新获取。") {
  clearAccountQrImageRetryTimer();
  elements.accountLoginView.hidden = false;
  elements.accountProfileView.hidden = true;
  elements.accountQrImage.hidden = true;
  elements.accountQrPlaceholder.hidden = false;
  elements.accountQrSpinner.hidden = true;
  elements.accountQrPlaceholderText.textContent = "二维码已失效";
  elements.accountLoginStatus.textContent = message;
  elements.accountLoginRetry.hidden = false;
  setAccountLoginRetryLabel("重新生成二维码");
  appState.account.loginStatus = "expired";
  appState.account.loginId = "";
  clearAccountPollTimer();
  updateAccountControls();
}

function accountSnapshotCount(snapshot, key) {
  const category = snapshot?.categories?.[key];
  if (category?.status !== "ok") {
    return "—";
  }
  return String(
    Number(category.count) || category.items?.length || 0,
  );
}

function accountSyncMessage(data) {
  const sync = appState.account.sync || {};
  const recordCount = Array.isArray(sync.latest?.items)
    ? sync.latest.items.length
    : 0;
  const recordText = recordCount ? `，共 ${recordCount} 条记录` : "";
  if (sync.running) {
    return "正在同步账号收藏、预约和我的追更…";
  }
  if (sync.lastResult === "error") {
    const message = sync.lastError || "上次同步未完成，请稍后重试。";
    return recordCount
      ? `${message} 已记录 ${recordCount} 条处理结果。`
      : message;
  }
  if (sync.lastResult === "partial") {
    return sync.lastError
      ? `部分同步完成${recordText}：${sync.lastError}`
      : `部分同步完成${recordText}，稍后会自动重试。`;
  }
  if (sync.lastResult === "success") {
    return `最近一次同步完成：导入 ${
      sync.importedCount || 0
    } 部，上传 ${sync.uploadedCount || 0} 部，移除 ${
      sync.removedRemoteCount || 0
    } 项，账号删除后移出 ${sync.removedLocalCount || 0} 部${recordText}。`;
  }
  return data?.authenticated
    ? "首次同步会合并账号与本地记录；之后按双方新增和删除进行双向同步。"
    : "登录后，账号收藏和预约会导入我的追更，我的追更会同步为收藏。";
}

function accountSyncTriggerLabel(trigger) {
  return (
    {
      login: "登录全量同步",
      manual: "手动同步",
      cron: "自动同步",
    }[trigger] || "账号同步"
  );
}

function accountSyncItemMeta(kind) {
  return (
    {
      imported: {
        label: "导入追更",
        icon: "plus",
        className: "is-imported",
      },
      uploaded: {
        label: "写入账号",
        icon: "check",
        className: "is-uploaded",
      },
      removed: {
        label: "账号移除",
        icon: "minus",
        className: "is-removed",
      },
      removedLocal: {
        label: "账号删除后移出",
        icon: "trash",
        className: "is-removed",
      },
      skipped: {
        label: "跳过",
        icon: "clock",
        className: "is-skipped",
      },
      failed: {
        label: "同步失败",
        icon: "alert",
        className: "is-failed",
      },
    }[kind] || {
      label: "处理",
      icon: "refresh",
      className: "is-neutral",
    }
  );
}

function accountSyncItemsMarkup(items) {
  return `<ul class="account-sync-details__list">
    ${items
      .map((item) => {
        const meta = accountSyncItemMeta(item.kind);
        return `
          <li class="account-sync-details__item ${meta.className}">
            <span class="account-sync-details__kind">
              <span class="account-sync-details__item-icon" aria-hidden="true">
                ${icon(meta.icon)}
              </span>
              ${escapeHtml(meta.label)}
            </span>
            <div class="account-sync-details__item-copy">
              <strong>《${escapeHtml(item.title || "未命名短剧")}》</strong>
              ${
                item.message
                  ? `<p>${escapeHtml(item.message)}</p>`
                  : ""
              }
            </div>
          </li>
        `;
      })
      .join("")}
  </ul>`;
}

function accountSyncDetailsMarkup(sync = {}) {
  if (sync.running) {
    return `
      <div class="account-sync-details__empty">
        <strong>正在同步</strong>
        <p>同步完成后会逐部列出本次有变化的短剧。</p>
      </div>
    `;
  }

  const latest = sync.latest;
  if (!latest) {
    return `
      <div class="account-sync-details__empty">
        <strong>还没有同步记录</strong>
        <p>完成一次账号同步后，这里会逐部显示导入和写入结果。</p>
      </div>
    `;
  }

  const items = Array.isArray(latest.items) ? latest.items : [];
  const changedCount =
    Number(latest.importedCount || 0) +
    Number(latest.uploadedCount || 0) +
    Number(latest.removedRemoteCount || 0) +
    Number(latest.removedLocalCount || 0);
  const resultLabel =
    latest.result === "success"
      ? "同步完成"
      : latest.result === "partial"
        ? "部分完成"
        : "同步失败";
  const emptyTitle = changedCount
    ? "本次同步未记录逐部明细"
    : latest.result === "error"
      ? "同步未完成，本次未处理短剧变化"
      : "本次没有短剧变化";
  const emptyDescription = changedCount
    ? "这条记录来自旧版本，下次同步会显示逐部短剧结果。"
    : latest.result === "error"
      ? "请根据下方错误信息重试，成功后会逐部显示同步结果。"
      : "账号收藏、预约与我的追更已经一致，无需新增或移除。";
  const itemMarkup = items.length
    ? accountSyncItemsMarkup(items)
    : `<div class="account-sync-details__empty account-sync-details__empty--inline">
        <strong>${emptyTitle}</strong>
        <p>${emptyDescription}</p>
      </div>`;

  return `
    <div class="account-sync-details__header">
      <div>
        <span class="account-sync-details__trigger">
          ${escapeHtml(accountSyncTriggerLabel(latest.trigger))}
        </span>
        <strong>${escapeHtml(resultLabel)}</strong>
      </div>
      <time datetime="${escapeHtml(latest.completedAt || "")}">
        ${escapeHtml(formatDateTime(latest.completedAt))}
      </time>
    </div>
    ${itemMarkup}
    ${
      latest.errors?.length
        ? `<p class="account-sync-details__error">${escapeHtml(
            latest.errors.slice(0, 3).join("；"),
          )}</p>`
        : ""
    }
  `;
}

function renderAccountSyncDetails(sync = {}) {
  const markup = accountSyncDetailsMarkup(sync);
  elements.accountSyncDetails.innerHTML = markup;
  elements.settingsAccountSyncDetails.innerHTML = markup;
}

function renderAccountProfile() {
  const data = appState.account.data;
  const sync = appState.account.sync || {};
  elements.accountLoginView.hidden = true;
  elements.accountProfileView.hidden = false;
  elements.accountProfileName.textContent =
    data?.profile?.name || data?.snapshot?.profile?.name || "红果用户";
  elements.accountFavoriteCount.textContent = accountSnapshotCount(
    data?.snapshot,
    "favorites",
  );
  const onlineReservations = accountSnapshotCount(
    data?.snapshot,
    "reservationsOnline",
  );
  const upcomingReservations = accountSnapshotCount(
    data?.snapshot,
    "reservationsUpcoming",
  );
  elements.accountReservationCount.textContent =
    onlineReservations === "—" || upcomingReservations === "—"
      ? "—"
      : String(Number(onlineReservations) + Number(upcomingReservations));
  elements.accountSnapshotTime.textContent = data?.snapshot?.fetchedAt
    ? `账号内容更新于 ${formatDateTime(data.snapshot.fetchedAt)}`
    : "尚未读取账号内容";
  elements.accountSyncLastTime.textContent = sync.lastCompletedAt
    ? formatRelativeTime(sync.lastCompletedAt)
    : "尚未同步";
  elements.accountSyncMessage.textContent = accountSyncMessage(data);
  elements.accountSyncState.dataset.state =
    sync.running
      ? "running"
      : sync.lastResult || "idle";
  renderAccountSyncDetails(sync);
  updateAccountControls();
}

function renderAccountState() {
  if (appState.account.data?.authenticated) {
    renderAccountProfile();
  } else {
    elements.accountLoginView.hidden = false;
    elements.accountProfileView.hidden = true;
    setAccountLoginMethod(appState.account.loginMethod);
    updateAccountControls();
  }
  renderSettingsAccount();
}

function updateAccountControls() {
  const authenticated = Boolean(appState.account.data?.authenticated);
  const busy = appState.account.busy;
  const syncing = appState.account.syncing;
  const smsBusy = appState.account.smsBusy;
  const qrBusy = accountLoginMethodIsBusy("qr");
  elements.accountRefresh.hidden = !authenticated;
  elements.accountLogout.hidden = !authenticated;
  elements.accountRefresh.disabled = !authenticated || busy || syncing;
  elements.accountLogout.disabled = !authenticated || busy || syncing;
  elements.accountLoginRetry.disabled = qrBusy;
  elements.accountSmsCountryCode.disabled = smsBusy;
  elements.accountSmsMobile.disabled = smsBusy;
  elements.accountSmsCode.disabled = smsBusy;
  elements.accountSmsSendCode.disabled =
    smsBusy ||
    appState.account.smsRetryAfterSeconds > 0 ||
    appState.account.smsQrFallbackRequired;
  elements.accountSmsSubmit.disabled =
    smsBusy ||
    !appState.account.smsLoginId ||
    appState.account.smsStatus !== "pending_verify";
  elements.accountSmsForm.setAttribute(
    "aria-busy",
    String(smsBusy || appState.account.smsStatus === "profile_loading"),
  );
  elements.settingsAccountLogin.hidden = authenticated;
  elements.settingsAccountLogin.disabled = busy;
  elements.settingsAccountSync.hidden = !authenticated;
  elements.settingsAccountSync.disabled =
    !authenticated || busy || syncing;
  elements.settingsAccountLogout.hidden = !authenticated;
  elements.settingsAccountLogout.disabled =
    !authenticated || busy || syncing;
}

function setSmsBusy(busy) {
  appState.account.smsBusy = busy;
  updateAccountControls();
}

function applySmsLoginStatus(login) {
  appState.account.smsStatus = login.status || "pending_code";
  if (login.loginId) {
    appState.account.smsLoginId = String(login.loginId);
  }
  if (Number.isFinite(Number(login.retryAfterSeconds))) {
    appState.account.smsRetryAfterSeconds = Math.max(
      0,
      Number(login.retryAfterSeconds),
    );
  }
  updateAccountControls();
}

async function sendAccountSmsCode() {
  if (appState.account.smsBusy) {
    return;
  }
  const validation = validateSmsMobileInput();
  if (!validation.valid) {
    elements.accountSmsLoginStatus.textContent = validation.message;
    elements.accountSmsMobile.focus({ preventScroll: true });
    return;
  }

  const run = newAccountRun();
  const existingLoginId = appState.account.smsLoginId;
  const canResend =
    Boolean(existingLoginId) &&
    ["pending_code", "pending_verify"].includes(
      appState.account.smsStatus,
    );
  setSmsBusy(true);
  setButtonBusy(elements.accountSmsSendCode, true, "发送中…");
  elements.accountSmsLoginStatus.textContent = "正在向红果申请短信验证码…";
  try {
    let loginId = canResend ? existingLoginId : "";
    if (!canResend && existingLoginId) {
      cancelAccountSmsLoginSession(existingLoginId);
      appState.account.smsLoginId = "";
    }
    if (!loginId) {
      const session = await requestJson("/api/account/sms-login", {
        method: "POST",
        body: JSON.stringify({
          countryCode: validation.countryCode,
          mobile: validation.mobile,
        }),
        signal: run.controller.signal,
        timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
      });
      loginId = String(session.login?.loginId || "");
      if (!loginId) {
        throw new Error("短信登录会话创建失败，请稍后重试。");
      }
      appState.account.smsLoginId = loginId;
      appState.account.smsStatus = "pending_code";
    }

    const payload = await requestJson(
      `/api/account/sms-login/${encodeURIComponent(loginId)}/send-code`,
      {
        method: "POST",
        body: "{}",
        signal: run.controller.signal,
        timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
      },
    );
    if (!accountRunIsCurrent(run.generation)) {
      cancelAccountSmsLoginSession(loginId);
      return;
    }
    applySmsLoginStatus(payload.login || {});
    startSmsCountdown(
      payload.login?.retryAfterSeconds ??
        ACCOUNT_SMS_DEFAULT_RETRY_SECONDS,
    );
    elements.accountSmsLoginStatus.textContent =
      payload.login?.message || "验证码已发送，请查看手机短信。";
    elements.accountSmsCode.focus({ preventScroll: true });
  } catch (error) {
    if (isAccountRequestAbort(error) || !accountRunIsCurrent(run.generation)) {
      return;
    }
    if (error.code === "ACCOUNT_SMS_CODE_RATE_LIMITED") {
      const retryAfterSeconds = Math.max(
        1,
        Number(error.retryAfterSeconds) ||
          ACCOUNT_SMS_DEFAULT_RETRY_SECONDS,
      );
      startSmsCountdown(retryAfterSeconds);
    }
    if (error.code === "ACCOUNT_SMS_VERIFICATION_REQUIRED") {
      showSmsLoginFailure(error.message, { offerQr: true });
    } else {
      appState.account.smsStatus =
        appState.account.smsLoginId &&
        ["pending_code", "pending_verify"].includes(
          appState.account.smsStatus,
        )
          ? appState.account.smsStatus
          : "failed";
      elements.accountSmsLoginStatus.textContent = error.message;
      setAccountFeedback(error.message);
    }
  } finally {
    setButtonBusy(elements.accountSmsSendCode, false);
    setSmsBusy(false);
    if (appState.account.smsRetryAfterSeconds > 0) {
      updateSmsCountdown();
    }
  }
}

function scheduleSmsLoginPoll(
  generation,
  controller,
  delay = ACCOUNT_POLL_INTERVAL_MS,
) {
  clearSmsPollTimer();
  if (!accountRunIsCurrent(generation) || !appState.account.smsLoginId) {
    return;
  }
  appState.account.smsPollTimer = window.setTimeout(() => {
    appState.account.smsPollTimer = null;
    void pollSmsLogin(generation, controller);
  }, delay);
}

async function pollSmsLogin(generation, controller) {
  const loginId = appState.account.smsLoginId;
  if (
    !loginId ||
    !accountRunIsCurrent(generation) ||
    controller.signal.aborted
  ) {
    return;
  }
  try {
    const payload = await requestJson(
      `/api/account/sms-login/${encodeURIComponent(loginId)}`,
      {
        method: "GET",
        signal: controller.signal,
        timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
      },
    );
    if (!accountRunIsCurrent(generation)) {
      return;
    }
    const login = payload.login || {};
    applySmsLoginStatus(login);
    if (login.status === "profile_loading") {
      elements.accountSmsLoginStatus.textContent =
        "登录成功，正在读取账号资料…";
      elements.accountSmsSubmit.disabled = true;
      scheduleSmsLoginPoll(generation, controller);
      return;
    }
    if (login.status === "succeeded") {
      appState.account.smsLoginId = "";
      clearSmsPollTimer();
      clearSmsCountdownTimer();
      elements.accountSmsLoginStatus.textContent =
        "登录成功，正在读取账号收藏和预约…";
      const status = await loadAccountStatus({
        generation,
        controller,
        startLoginWhenSignedOut: false,
      });
      if (status && accountRunIsCurrent(generation)) {
        await syncAccount({ generation, controller, automatic: true });
      }
      return;
    }
    if (login.status === "expired") {
      showSmsLoginFailure("短信登录已过期，请重新获取验证码。");
      setAccountFeedback("短信登录已过期，请重新获取验证码。");
      return;
    }
    if (login.status === "failed") {
      const message = login.error || "验证码登录失败，请重新获取验证码。";
      showSmsLoginFailure(message);
      setAccountFeedback(message);
      return;
    }
    scheduleSmsLoginPoll(generation, controller);
  } catch (error) {
    if (isAccountRequestAbort(error) || !accountRunIsCurrent(generation)) {
      return;
    }
    showSmsLoginFailure(error.message || "查询验证码登录状态失败。");
    setAccountFeedback(error.message);
  }
}

async function verifyAccountSmsCode() {
  if (appState.account.smsBusy) {
    return;
  }
  const loginId = appState.account.smsLoginId;
  const code = elements.accountSmsCode.value.trim();
  setFieldError(elements.accountSmsCode, false);
  if (!loginId) {
    elements.accountSmsLoginStatus.textContent =
      "请先输入手机号并发送验证码。";
    elements.accountSmsMobile.focus({ preventScroll: true });
    return;
  }
  if (!/^\d{4,8}$/.test(code)) {
    setFieldError(elements.accountSmsCode, true);
    elements.accountSmsLoginStatus.textContent =
      "请输入 4 至 8 位数字短信验证码。";
    elements.accountSmsCode.focus({ preventScroll: true });
    return;
  }

  const generation = appState.account.requestGeneration;
  const controller = appState.account.controller;
  setSmsBusy(true);
  setButtonBusy(elements.accountSmsSubmit, true, "登录中…");
  elements.accountSmsLoginStatus.textContent = "正在验证短信验证码…";
  try {
    const payload = await requestJson(
      `/api/account/sms-login/${encodeURIComponent(loginId)}/verify`,
      {
        method: "POST",
        body: JSON.stringify({ code }),
        signal: controller.signal,
        timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
      },
    );
    if (!accountRunIsCurrent(generation)) {
      return;
    }
    applySmsLoginStatus(payload.login || {});
    elements.accountSmsCode.value = "";
    elements.accountSmsLoginStatus.textContent =
      "验证成功，正在读取账号资料…";
    scheduleSmsLoginPoll(generation, controller, 500);
  } catch (error) {
    if (isAccountRequestAbort(error) || !accountRunIsCurrent(generation)) {
      return;
    }
    const terminal =
      error.code === "ACCOUNT_SMS_CODE_ATTEMPTS_EXCEEDED" ||
      error.code === "ACCOUNT_SMS_LOGIN_NOT_FOUND" ||
      error.code === "ACCOUNT_SMS_VERIFICATION_REQUIRED";
    if (terminal) {
      showSmsLoginFailure(error.message, {
        offerQr: error.code === "ACCOUNT_SMS_VERIFICATION_REQUIRED",
      });
    } else {
      setFieldError(elements.accountSmsCode, true);
      elements.accountSmsLoginStatus.textContent = error.message;
      elements.accountSmsCode.focus({ preventScroll: true });
    }
    if (error.code !== "ACCOUNT_SMS_VERIFICATION_REQUIRED") {
      setAccountFeedback(error.message);
    }
  } finally {
    setButtonBusy(elements.accountSmsSubmit, false);
    setSmsBusy(false);
  }
}

function renderSettingsAccount() {
  const data = appState.account.data;
  const sync = appState.account.sync || {};
  const authenticated = Boolean(data?.authenticated);
  const name =
    data?.profile?.name || data?.snapshot?.profile?.name || "未登录";
  const favorites = accountSnapshotCount(data?.snapshot, "favorites");
  const onlineReservations = accountSnapshotCount(
    data?.snapshot,
    "reservationsOnline",
  );
  const upcomingReservations = accountSnapshotCount(
    data?.snapshot,
    "reservationsUpcoming",
  );
  elements.settingsAccountName.textContent = name;
  elements.settingsAccountDescription.textContent = authenticated
    ? "收藏、预约和“我的追更”会双向同步。观看历史不会读取。"
    : "登录后可读取收藏和预约，并与“我的追更”双向同步。";
  elements.settingsAccountSnapshotTime.textContent = !authenticated
    ? "登录后显示账号内容更新时间"
    : data?.snapshot?.fetchedAt
      ? `账号内容更新于 ${formatDateTime(data.snapshot.fetchedAt)}`
      : "尚未读取账号内容";
  elements.settingsAccountSummary.hidden = !authenticated;
  elements.settingsAccountFavoriteCount.textContent = authenticated
    ? favorites
    : "—";
  elements.settingsAccountReservationCount.textContent =
    authenticated &&
    onlineReservations !== "—" &&
    upcomingReservations !== "—"
      ? String(Number(onlineReservations) + Number(upcomingReservations))
      : "—";
  elements.settingsAccountLastTime.textContent = sync.lastCompletedAt
    ? formatRelativeTime(sync.lastCompletedAt)
    : "尚未同步";
  elements.settingsAccountStatusTitle.textContent = authenticated
    ? sync.running
      ? "正在同步"
      : "双向同步"
    : "账号同步";
  elements.settingsAccountStatusSummary.textContent = authenticated
    ? accountSyncMessage(data)
    : data?.issue || "尚未登录红果账号。";
  elements.settingsAccountStatus.dataset.state = sync.running
    ? "running"
    : sync.lastResult || (authenticated ? "idle" : "signed-out");
  elements.settingsAccountSyncDetailsPanel.hidden = !authenticated;
  renderAccountSyncDetails(sync);
  updateAccountControls();
}

async function loadAccountStatus({
  generation,
  controller,
  startLoginWhenSignedOut = true,
} = {}) {
  setAccountBusy(true);
  try {
    const payload = await requestJson("/api/account/status", {
      method: "GET",
      signal: controller?.signal,
      timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
    });
    if (!accountRunIsCurrent(generation)) {
      return null;
    }
    appState.account.data = payload.account || {
      authenticated: false,
      profile: null,
      snapshot: null,
    };
    appState.account.sync = payload.sync || {};
    renderAccountState();
    if (!appState.account.data.authenticated && startLoginWhenSignedOut) {
      await beginAccountLogin({ generation, controller });
    }
    return payload;
  } catch (error) {
    if (isAccountRequestAbort(error) || !accountRunIsCurrent(generation)) {
      return null;
    }
    showAccountLoginFailure(error.message, {
      title: "账号信息读取失败",
      retryLabel: "重新登录",
    });
    setAccountFeedback(error.message);
    return null;
  } finally {
    if (accountRunIsCurrent(generation)) {
      setAccountBusy(false);
    }
  }
}

function restartAccountQrLogin() {
  const run = newAccountRun();
  void beginAccountLogin(run);
}

function scheduleAccountLoginCreationRetry(generation, controller) {
  clearAccountLoginRetryTimer();
  if (
    !accountRunIsCurrent(generation) ||
    appState.account.loginMethod !== "qr" ||
    controller.signal.aborted
  ) {
    return;
  }
  appState.account.loginRetryTimer = window.setTimeout(() => {
    appState.account.loginRetryTimer = null;
    void beginAccountLogin({
      generation,
      controller,
      autoRetry: false,
    });
  }, ACCOUNT_LOGIN_RETRY_DELAY_MS);
}

async function beginAccountLogin({
  generation,
  controller,
  autoRetry = true,
}) {
  if (
    !accountRunIsCurrent(generation) ||
    appState.account.loginMethod !== "qr" ||
    controller.signal.aborted
  ) {
    return;
  }
  clearAccountLoginRetryTimer();
  const ownsBusyState = !appState.account.busy;
  if (ownsBusyState) {
    setAccountBusy(true);
  }
  const previousLoginId = appState.account.loginId;
  appState.account.loginId = "";
  cancelAccountLoginSession(previousLoginId);
  clearAccountPollTimer();
  showAccountLoginPending("正在生成登录二维码…");
  try {
    const payload = await requestJson("/api/account/login", {
      method: "POST",
      signal: controller.signal,
      timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
    });
    if (
      !accountRunIsCurrent(generation) ||
      appState.account.loginMethod !== "qr"
    ) {
      return;
    }
    const login = payload.login || {};
    if (!login.loginId) {
      throw new Error("红果登录二维码未生成，请重试。");
    }
    const loginId = String(login.loginId);
    appState.account.loginId = loginId;
    if (
      !accountRunIsCurrent(generation) ||
      appState.account.loginMethod !== "qr"
    ) {
      cancelAccountLoginSession(loginId);
      appState.account.loginId = "";
      return;
    }
    appState.account.loginExpiresAt = login.expiresAt || "";
    appState.account.loginStatus = "pending";
    appState.account.pollFailures = 0;
    resetAccountQr();
    elements.accountQrPlaceholderText.textContent = "正在加载登录二维码…";
    elements.accountLoginStatus.textContent =
      "请使用红果短剧 App 扫码，并在手机上确认登录。";
    setAccountQrExpiry(appState.account.loginExpiresAt);
    let qrImageAttempt = 0;
    const loadAccountQrImage = () => {
      if (!accountQrPollIsCurrent(generation, loginId)) {
        return;
      }
      const retryQuery = qrImageAttempt
        ? `?retry=${qrImageAttempt}`
        : "";
      elements.accountQrImage.src =
        `/api/account/login/${encodeURIComponent(loginId)}/qrcode${retryQuery}`;
    };
    elements.accountQrImage.onload = () => {
      if (!accountQrPollIsCurrent(generation, loginId)) {
        return;
      }
      clearAccountQrImageRetryTimer();
      elements.accountQrImage.hidden = false;
      elements.accountQrPlaceholder.hidden = true;
      if (appState.account.loginStatus === "pending") {
        elements.accountLoginStatus.textContent =
          "二维码已就绪，请使用红果短剧 App 扫码并在手机上确认。";
      }
    };
    elements.accountQrImage.onerror = () => {
      if (!accountQrPollIsCurrent(generation, loginId)) {
        return;
      }
      qrImageAttempt += 1;
      if (qrImageAttempt <= 1) {
        elements.accountQrPlaceholderText.textContent =
          "二维码图片加载失败，正在重试…";
        elements.accountLoginStatus.textContent =
          "网络暂时不稳定，正在重新加载二维码…";
        clearAccountQrImageRetryTimer();
        appState.account.qrImageRetryTimer = window.setTimeout(() => {
          appState.account.qrImageRetryTimer = null;
          loadAccountQrImage();
        }, ACCOUNT_QR_IMAGE_RETRY_DELAY_MS);
        return;
      }
      showAccountLoginFailure("登录二维码加载失败，请重新生成。");
    };
    loadAccountQrImage();
    scheduleAccountLoginPoll(generation, controller, 1_200);
  } catch (error) {
    if (
      isAccountRequestAbort(error) ||
      !accountRunIsCurrent(generation) ||
      appState.account.loginMethod !== "qr"
    ) {
      return;
    }
    const message =
      error.message || "登录二维码生成失败，请稍后重试。";
    const retryable =
      !error.status ||
      error.code === "REQUEST_TIMEOUT" ||
      Number(error.status) >= 500;
    showAccountLoginFailure(message);
    setAccountFeedback(message);
    if (autoRetry && retryable) {
      elements.accountLoginStatus.textContent =
        "二维码生成失败，正在自动重试…";
      scheduleAccountLoginCreationRetry(generation, controller);
    }
  } finally {
    if (ownsBusyState && accountRunIsCurrent(generation)) {
      setAccountBusy(false);
    }
  }
}

function scheduleAccountLoginPoll(
  generation,
  controller,
  delay = ACCOUNT_POLL_INTERVAL_MS,
) {
  clearAccountPollTimer();
  if (
    !accountRunIsCurrent(generation) ||
    !appState.account.loginId
  ) {
    return;
  }
  appState.account.pollTimer = window.setTimeout(() => {
    appState.account.pollTimer = null;
    void pollAccountLogin(generation, controller);
  }, delay);
}

async function pollAccountLogin(generation, controller) {
  const loginId = appState.account.loginId;
  if (
    !loginId ||
    !accountQrPollIsCurrent(generation, loginId) ||
    controller.signal.aborted
  ) {
    return;
  }
  const previousLoginStatus = appState.account.loginStatus;
  try {
    const payload = await requestJson(
      `/api/account/login/${encodeURIComponent(loginId)}`,
      {
        method: "GET",
        signal: controller.signal,
        timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
      },
    );
    if (!accountQrPollIsCurrent(generation, loginId)) {
      return;
    }
    appState.account.pollFailures = 0;
    const login = payload.login || {};
    const loginStatus = String(login.status || "pending");
    appState.account.loginStatus = loginStatus;
    appState.account.loginExpiresAt =
      login.expiresAt || appState.account.loginExpiresAt;
    setAccountQrExpiry(appState.account.loginExpiresAt);
    if (loginStatus === "profile_loading") {
      elements.accountQrImage.hidden = true;
      elements.accountQrPlaceholder.hidden = false;
      elements.accountQrSpinner.hidden = false;
      elements.accountQrPlaceholderText.textContent =
        "登录已确认，正在读取账号资料…";
      elements.accountLoginStatus.textContent =
        "登录已确认，正在读取账号资料…";
      if (appState.account.loginMethod === "sms") {
        elements.accountSmsLoginStatus.textContent =
          "登录已确认，正在读取账号资料…";
      }
      scheduleAccountLoginPoll(generation, controller);
      return;
    }
    if (loginStatus === "succeeded") {
      appState.account.loginId = "";
      clearAccountPollTimer();
      elements.accountLoginStatus.textContent =
        "登录成功，正在读取账号收藏和预约…";
      const status = await loadAccountStatus({
        generation,
        controller,
        startLoginWhenSignedOut: false,
      });
      if (status && accountRunIsCurrent(generation)) {
        await syncAccount({ generation, controller, automatic: true });
      }
      return;
    }
    if (loginStatus === "expired" || loginStatus === "5") {
      showAccountLoginExpired("二维码已失效，请重新获取。");
      setAccountFeedback("红果登录二维码已失效。");
      return;
    }
    if (loginStatus === "failed") {
      const message =
        login.error || "扫码登录失败，请重新获取二维码。";
      const initializationFailed =
        previousLoginStatus === "profile_loading" ||
        /设备注册|账号资料|登录态|登录成功/u.test(message);
      showAccountLoginFailure(message, {
        title: initializationFailed ? "账号初始化失败" : "登录确认失败",
        retryLabel: "重新登录",
      });
      setAccountFeedback(message);
      return;
    }
    if (loginStatus === "2" || loginStatus === "scanned") {
      elements.accountLoginStatus.textContent =
        "已扫码，请在红果短剧 App 中确认登录。";
    } else {
      elements.accountLoginStatus.textContent =
        "二维码已就绪，请在红果短剧 App 中扫码并确认。";
    }
    scheduleAccountLoginPoll(generation, controller);
  } catch (error) {
    if (
      isAccountRequestAbort(error) ||
      !accountQrPollIsCurrent(generation, loginId)
    ) {
      return;
    }
    const retryable = !error.status || error.code === "REQUEST_TIMEOUT";
    appState.account.pollFailures += 1;
    if (retryable && appState.account.pollFailures < 3) {
      elements.accountLoginStatus.textContent =
        "网络暂时不稳定，正在重新查询登录状态…";
      scheduleAccountLoginPoll(
        generation,
        controller,
        ACCOUNT_POLL_INTERVAL_MS + 1_000,
      );
      return;
    }
    const initializationFailed =
      previousLoginStatus === "profile_loading" ||
      /设备注册|账号资料|登录态|登录成功/u.test(error.message || "");
    showAccountLoginFailure(
      error.message || "查询扫码状态失败，请重新登录。",
      {
        title: initializationFailed ? "账号初始化失败" : "登录状态查询失败",
        retryLabel: "重新登录",
      },
    );
    setAccountFeedback(error.message);
  }
}

async function syncAccount({
  generation = appState.account.requestGeneration,
  controller = appState.account.controller,
  automatic = false,
} = {}) {
  if (
    appState.account.syncing ||
    !appState.account.data?.authenticated ||
    !accountRunIsCurrent(generation)
  ) {
    return null;
  }
  appState.account.syncing = true;
  appState.account.sync = {
    ...appState.account.sync,
    running: true,
  };
  setAccountBusy(true);
  setButtonBusy(elements.accountRefresh, true, "同步中…");
  setButtonBusy(elements.settingsAccountSync, true, "同步中…");
  setAccountFeedback(
    automatic ? "登录成功，正在同步账号内容…" : "正在双向同步账号内容…",
    "success",
  );
  renderAccountState();
  try {
    const payload = await requestJson("/api/account/sync", {
      method: "POST",
      body: JSON.stringify({
        trigger: automatic ? "login" : "manual",
      }),
      signal: controller?.signal,
      timeoutMs: ACCOUNT_SYNC_TIMEOUT_MS,
    });
    if (!accountRunIsCurrent(generation)) {
      return null;
    }
    appState.account.data = payload.account || appState.account.data;
    appState.account.sync = payload.sync || appState.account.sync;
    renderAccountState();
    const message = payload.message || "账号同步完成。";
    const hasError = payload.result?.result === "error";
    setAccountFeedback(message, hasError ? "error" : "success");
    showToast(message, hasError ? "error" : "success");
    await loadDashboard({ silent: true });
    return payload;
  } catch (error) {
    if (isAccountRequestAbort(error) || !accountRunIsCurrent(generation)) {
      return null;
    }
    appState.account.sync = {
      ...appState.account.sync,
      running: false,
      lastResult: "error",
      lastError: error.message,
    };
    renderAccountState();
    setAccountFeedback(error.message);
    showToast(error.message, "error");
    return null;
  } finally {
    if (accountRunIsCurrent(generation)) {
      appState.account.syncing = false;
      setButtonBusy(elements.accountRefresh, false);
      setButtonBusy(elements.settingsAccountSync, false);
      setAccountBusy(false);
      renderAccountState();
    }
  }
}

async function logoutAccount() {
  if (
    appState.account.busy ||
    appState.account.syncing ||
    !appState.account.data?.authenticated
  ) {
    return;
  }
  if (
    !window.confirm(
      "退出后将停止账号同步，已同步到账号的收藏和预约不会被删除。确定退出登录吗？",
    )
  ) {
    return;
  }
  const generation = appState.account.requestGeneration;
  const controller = appState.account.controller;
  setAccountBusy(true);
  setButtonBusy(elements.accountLogout, true, "退出中…");
  setButtonBusy(elements.settingsAccountLogout, true, "退出中…");
  try {
    const payload = await requestJson("/api/account/logout", {
      method: "POST",
      signal: controller.signal,
      timeoutMs: ACCOUNT_STATUS_TIMEOUT_MS,
    });
    if (!accountRunIsCurrent(generation)) {
      return;
    }
    appState.account.data = payload.account || {
      authenticated: false,
      profile: null,
      snapshot: null,
    };
    appState.account.sync = {};
    clearAccountPollTimer();
    cancelAccountLoginSession(appState.account.loginId);
    appState.account.loginId = "";
    resetAccountQr();
    renderAccountState();
    setAccountFeedback(payload.message || "已退出红果账号。", "success");
    showToast(payload.message || "已退出红果账号。");
  } catch (error) {
    if (isAccountRequestAbort(error) || !accountRunIsCurrent(generation)) {
      return;
    }
    setAccountFeedback(error.message);
    showToast(error.message, "error");
  } finally {
    if (accountRunIsCurrent(generation)) {
      setButtonBusy(elements.accountLogout, false);
      setButtonBusy(elements.settingsAccountLogout, false);
      setAccountBusy(false);
      renderAccountState();
    }
  }
}

async function openAccountDialog({
  startLoginWhenSignedOut = false,
} = {}) {
  if (elements.accountDialog.open) {
    return;
  }
  appState.account.returnFocus = document.activeElement;
  const run = newAccountRun();
  appState.account.loginId = "";
  appState.account.loginStatus = "idle";
  appState.account.pollFailures = 0;
  appState.account.data = null;
  appState.account.sync = null;
  appState.account.busy = false;
  appState.account.syncing = false;
  appState.account.loginMethod = "qr";
  resetAccountSms({ clearInputs: true });
  setAccountLoginMethod("qr");
  setAccountFeedback();
  showAccountLoginPending("正在读取红果登录状态…");
  openDialog(elements.accountDialog);
  await loadAccountStatus({
    ...run,
    startLoginWhenSignedOut: startLoginWhenSignedOut,
  });
}

async function openAccountLoginFromSettings() {
  await openAccountDialog({ startLoginWhenSignedOut: true });
}

async function syncAccountFromSettings() {
  if (!appState.account.data?.authenticated) {
    await openAccountLoginFromSettings();
    return;
  }
  await syncAccount();
}

elements.openAccountImport.addEventListener("click", () => {
  void (async () => {
    await openAccountDialog({ startLoginWhenSignedOut: true });
    if (appState.account.data?.authenticated) {
      await syncAccount();
    }
  })();
});

elements.accountDialog.addEventListener("close", () => {
  const returnFocus = appState.account.returnFocus;
  appState.account.returnFocus = null;
  const loginId = appState.account.loginId;
  const smsLoginId = appState.account.smsLoginId;
  resetAccountQrLoginState();
  appState.account.smsLoginId = "";
  clearSmsPollTimer();
  clearSmsCountdownTimer();
  appState.account.requestGeneration += 1;
  appState.account.controller?.abort();
  appState.account.controller = null;
  cancelAccountLoginSession(loginId);
  cancelAccountSmsLoginSession(smsLoginId);
  resetAccountQr();
  resetAccountSms({ clearInputs: true });
  requestAnimationFrame(() => {
    (returnFocus || elements.openAccountImport)?.focus({
      preventScroll: true,
    });
  });
});

elements.accountLoginRetry.addEventListener("click", () => {
  restartAccountQrLogin();
});

elements.accountLoginTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    switchAccountLoginMethod(tab.dataset.accountLoginMethod);
  });
  tab.addEventListener("keydown", (event) => {
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % elements.accountLoginTabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + elements.accountLoginTabs.length) %
        elements.accountLoginTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = elements.accountLoginTabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    switchAccountLoginMethod(
      elements.accountLoginTabs[nextIndex].dataset.accountLoginMethod,
      { focus: true },
    );
  });
});

elements.accountSmsSendCode.addEventListener("click", () => {
  void sendAccountSmsCode();
});

elements.accountSmsUseQr.addEventListener("click", () => {
  switchAccountLoginMethod("qr", { focus: true });
});

elements.accountSmsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void verifyAccountSmsCode();
});

elements.accountSmsMobile.addEventListener("input", () => {
  setFieldError(elements.accountSmsMobile, false);
  setAccountFeedback();
});

elements.accountSmsCode.addEventListener("input", () => {
  elements.accountSmsCode.value = elements.accountSmsCode.value
    .replace(/\D/g, "")
    .slice(0, 8);
  setFieldError(elements.accountSmsCode, false);
  setAccountFeedback();
});

elements.accountSmsForm.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target === elements.accountSmsMobile) {
    event.preventDefault();
    void sendAccountSmsCode();
  }
});

elements.accountRefresh.addEventListener("click", () => {
  void syncAccount();
});

elements.accountLogout.addEventListener("click", () => {
  void logoutAccount();
});

elements.settingsAccountLogin.addEventListener("click", () => {
  void openAccountLoginFromSettings();
});

elements.settingsAccountSync.addEventListener("click", () => {
  void syncAccountFromSettings();
});

elements.settingsAccountLogout.addEventListener("click", () => {
  void logoutAccount();
});

function selectedSubscription() {
  return appState.dashboard?.subscriptions?.find(
    (subscription) => subscription.id === appState.activeSubscriptionId,
  );
}

elements.openAddDialog.addEventListener("click", () => {
  appState.addDialogReturnFocus = document.activeElement;
  resetSeriesSearch({ clearInput: true });
  openDialog(elements.addDialog);
  requestAnimationFrame(() => {
    elements.shareInput.focus({ preventScroll: true });
  });
});

elements.addDialog.addEventListener("close", () => {
  const returnFocus = appState.addDialogReturnFocus;
  appState.addDialogReturnFocus = null;
  resetSeriesSearch({ clearInput: true });
  requestAnimationFrame(() => {
    (returnFocus || elements.openAddDialog).focus({ preventScroll: true });
  });
});

elements.addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const search = appState.seriesSearch;
  if (search.loading) {
    return;
  }
  const input = elements.shareInput.value.trim();
  setFieldError(elements.shareInput, false);
  setFormFeedback(elements.shareFeedback);
  if (!input) {
    setFieldError(elements.shareInput, true);
    setFormFeedback(
      elements.shareFeedback,
      "请先输入剧名、粘贴分享链接或剧集 ID。",
    );
    elements.shareInput.focus();
    return;
  }
  const selected = currentSeriesSearchSelection();
  if (!selected && !isDirectSeriesInput(input)) {
    const results = await searchSeriesByName(input, { explicit: true });
    if (!results.length) {
      elements.shareInput.focus();
    }
    return;
  }

  setButtonBusy(elements.addSubmit, true, "正在读取详情…");
  setPageBusy(true);
  let payload = null;
  try {
    payload = await requestJson("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify({ input: selected?.seriesId || input }),
      timeoutMs: LONG_ACTION_TIMEOUT_MS,
    });
  } catch (error) {
    setFieldError(elements.shareInput, true);
    setFormFeedback(elements.shareFeedback, error.message);
    elements.shareInput.focus();
  } finally {
    setButtonBusy(elements.addSubmit, false);
    setPageBusy(false);
  }
  if (payload) {
    resetSeriesSearch({ clearInput: true });
    closeDialog(elements.addDialog);
    showToast(payload.message);
    await loadDashboard({ silent: true });
  }
});

elements.shareInput.addEventListener("input", () => {
  const query = elements.shareInput.value.trim();
  const search = appState.seriesSearch;
  resetSeriesSearch();
  if (!query || isDirectSeriesInput(query)) {
    return;
  }
  search.timer = setTimeout(() => {
    search.timer = null;
    if (elements.shareInput.value.trim() !== query) {
      return;
    }
    void searchSeriesByName(query);
  }, SERIES_SEARCH_DELAY_MS);
});

elements.shareInput.addEventListener("keydown", (event) => {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  const search = appState.seriesSearch;
  const optionsCount = search.results.length;

  if (event.key === "Escape") {
    if (search.open || search.loading) {
      event.preventDefault();
      cancelSeriesSearchRequest();
      hideSeriesSearchPanel();
      search.activeIndex = -1;
      elements.shareInput.removeAttribute("aria-activedescendant");
    }
    return;
  }

  if (event.key === "Tab") {
    if (search.open) {
      cancelSeriesSearchRequest();
      hideSeriesSearchPanel();
    }
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!optionsCount) {
      const query = elements.shareInput.value.trim();
      if (query && !search.loading && !isDirectSeriesInput(query)) {
        event.preventDefault();
        void searchSeriesByName(query, { explicit: true });
      }
      return;
    }
    event.preventDefault();
    if (!search.open) {
      setSeriesSearchExpanded(true);
    }
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      search.activeIndex < 0
        ? direction > 0
          ? 0
          : optionsCount - 1
        : Math.max(
            0,
            Math.min(search.activeIndex + direction, optionsCount - 1),
          );
    setSeriesSearchActive(nextIndex);
    return;
  }

  if (event.key === "Enter" && search.loading) {
    event.preventDefault();
    return;
  }

  if (
    event.key === "Enter" &&
    search.open &&
    search.activeIndex >= 0 &&
    optionsCount
  ) {
    event.preventDefault();
    selectSeriesCandidate(search.activeIndex);
  }
});

elements.shareInput.addEventListener("focus", () => {
  const search = appState.seriesSearch;
  if (search.results.length && !search.selected) {
    setSeriesSearchExpanded(true);
  }
});

elements.shareInputClear.addEventListener("click", () => {
  resetSeriesSearch({ clearInput: true });
  elements.shareInput.focus({ preventScroll: true });
});

elements.seriesSearchList.addEventListener("mousedown", (event) => {
  if (event.target.closest("[data-series-search-index]")) {
    event.preventDefault();
  }
});

elements.seriesSearchList.addEventListener("click", (event) => {
  const option = event.target.closest("[data-series-search-index]");
  if (option) {
    selectSeriesCandidate(Number(option.dataset.seriesSearchIndex));
  }
});

elements.watchlistSearchInput.addEventListener("input", () => {
  const search = appState.watchlistSearch;
  search.query = elements.watchlistSearchInput.value;
  search.selectedId = null;
  search.activeIndex = -1;
  search.open = Boolean(normalizeWatchlistSearchValue(search.query));
  renderDashboard();
});

elements.watchlistSearchInput.addEventListener("focus", () => {
  const search = appState.watchlistSearch;
  if (
    normalizeWatchlistSearchValue(search.query) &&
    !search.open
  ) {
    setWatchlistSearchOpen(true);
  }
});

elements.watchlistSearchInput.addEventListener("keydown", (event) => {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  const search = appState.watchlistSearch;
  const hasQuery = Boolean(normalizeWatchlistSearchValue(search.query));

  if (event.key === "Escape") {
    if (search.open) {
      event.preventDefault();
      search.activeIndex = -1;
      setWatchlistSearchOpen(false);
    }
    return;
  }

  if (event.key === "Tab") {
    if (search.open) {
      setWatchlistSearchOpen(false);
    }
    return;
  }

  if (
    (event.key === "ArrowDown" || event.key === "ArrowUp") &&
    hasQuery
  ) {
    event.preventDefault();
    if (!search.open) {
      setWatchlistSearchOpen(true);
    }
    if (!search.results.length) {
      return;
    }
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      search.activeIndex < 0
        ? direction > 0
          ? 0
          : search.results.length - 1
        : search.activeIndex + direction;
    setWatchlistSearchActive(nextIndex, { scroll: true });
    return;
  }

  if (event.key === "Enter" && hasQuery && search.results.length) {
    event.preventDefault();
    selectWatchlistSearchCandidate(
      search.activeIndex >= 0 ? search.activeIndex : 0,
    );
  }
});

elements.watchlistSearchClear.addEventListener("click", () => {
  clearWatchlistSearch();
});

elements.watchlistSearchList.addEventListener("mousedown", (event) => {
  if (event.target.closest("[data-watchlist-search-index]")) {
    event.preventDefault();
  }
});

elements.watchlistSearchList.addEventListener("mouseover", (event) => {
  const option = event.target.closest("[data-watchlist-search-index]");
  if (option) {
    setWatchlistSearchActive(
      Number(option.dataset.watchlistSearchIndex),
    );
  }
});

elements.watchlistSearchList.addEventListener("click", (event) => {
  const option = event.target.closest("[data-watchlist-search-index]");
  if (option) {
    selectWatchlistSearchCandidate(
      Number(option.dataset.watchlistSearchIndex),
    );
  }
});

elements.watchlistUpdateFilter.addEventListener("click", () => {
  const hasUpdates = (appState.dashboard?.subscriptions || []).some(
    (subscription) => subscription.hasUnreadUpdate === true,
  );
  if (!hasUpdates) {
    return;
  }
  appState.watchlistUpdateFilter = !appState.watchlistUpdateFilter;
  renderDashboard({
    listMotion: appState.watchlistUpdateFilter ? "filter-on" : "filter-off",
  });
});

document.addEventListener("pointerdown", (event) => {
  const search = appState.seriesSearch;
  if (search.open && !elements.seriesSearchField.contains(event.target)) {
    cancelSeriesSearchRequest();
    hideSeriesSearchPanel();
  }
  const watchlistSearch = appState.watchlistSearch;
  if (
    watchlistSearch.open &&
    !elements.watchlistSearch.contains(event.target)
  ) {
    watchlistSearch.activeIndex = -1;
    setWatchlistSearchOpen(false);
  }
});

elements.subscriptionList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (button.dataset.action === "load-more") {
    loadMoreSubscriptions();
    return;
  }
  if (button.dataset.action === "clear-watchlist-search") {
    clearWatchlistSearch();
    return;
  }
  if (button.dataset.action === "clear-watchlist-update-filter") {
    appState.watchlistUpdateFilter = false;
    renderDashboard({ listMotion: "filter-off" });
    return;
  }
  const row = button.closest("[data-subscription-id]");
  const subscriptionId = row?.dataset.subscriptionId;
  const subscription = appState.dashboard?.subscriptions?.find(
    (item) => item.id === subscriptionId,
  );
  if (!subscription) {
    return;
  }

  if (button.dataset.action === "toggle-details") {
    const nextExpanded = button.getAttribute("aria-expanded") !== "true";
    const details = document.getElementById(button.getAttribute("aria-controls"));
    button.setAttribute("aria-expanded", String(nextExpanded));
    if (nextExpanded) {
      appState.expandedSubscriptionIds.add(subscriptionId);
    } else {
      appState.expandedSubscriptionIds.delete(subscriptionId);
    }
    if (details) {
      if (nextExpanded) {
        revealSubscriptionDetails(details);
      } else {
        hideSubscriptionDetails(details);
      }
    }
    const toggleLabel = `${nextExpanded ? "收起" : "展开"}《${subscriptionDisplayTitle(
      subscription,
    )}》详情`;
    button.setAttribute("aria-label", toggleLabel);
    button.title = toggleLabel;
    return;
  }

  if (button.dataset.action === "check") {
    setButtonBusy(button, true, "检查中…");
    setPageBusy(true);
    try {
      const payload = await requestJson(
        `/api/subscriptions/${encodeURIComponent(subscriptionId)}/check`,
        {
          method: "POST",
          body: "{}",
          timeoutMs: LONG_ACTION_TIMEOUT_MS,
        },
      );
      showToast(payload.message);
      await loadDashboard({ silent: true });
      focusSubscriptionAction(subscriptionId, "check");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setButtonBusy(button, false);
      setPageBusy(false);
    }
    return;
  }

  if (button.dataset.action === "add-season") {
    appState.activeSubscriptionId = subscriptionId;
    elements.seasonContext.textContent = `当前追更：《${subscriptionDisplayTitle(
      subscription,
    )}》`;
    elements.seasonGroupId.textContent = subscription.seriesGroupId || "无";
    elements.seasonShareInput.value = "";
    setFieldError(elements.seasonShareInput, false);
    setFormFeedback(elements.seasonFeedback);
    openDialog(elements.seasonDialog);
    elements.seasonShareInput.focus();
    return;
  }

  if (button.dataset.action === "status") {
    appState.activeSubscriptionId = subscriptionId;
    elements.statusContext.textContent = `《${subscriptionDisplayTitle(
      subscription,
    )}》当前为 ${
      subscription.seriesStatus === "completed"
        ? "已完结"
        : subscription.seriesStatus === "updating"
          ? "更新中"
          : subscription.seriesStatus === "inactive"
            ? "已停更"
          : "状态未知"
    }，请选择新的检查状态。`;
    const selectedStatus = subscription.seriesStatusOverride || "auto";
    const selectedInput = elements.statusForm.querySelector(
      `input[name="seriesStatus"][value="${selectedStatus}"]`,
    );
    if (selectedInput) {
      selectedInput.checked = true;
    }
    setFormFeedback(elements.statusFeedback);
    openDialog(elements.statusDialog);
    selectedInput?.focus();
    return;
  }

  if (button.dataset.action === "watched") {
    const watched = button.dataset.watched === "true";
    setButtonBusy(button, true, watched ? "标记中…" : "恢复中…");
    try {
      const payload = await requestJson(
        `/api/subscriptions/${encodeURIComponent(subscriptionId)}/watched`,
        {
          method: "POST",
          body: JSON.stringify({ watched }),
        },
      );
      showToast(payload.message);
      await loadDashboard({ silent: true });
      focusSubscriptionAction(subscriptionId, "watched");
    } catch (error) {
      showToast(error.message, "error");
      setButtonBusy(button, false);
    }
    return;
  }

  if (button.dataset.action === "tracking") {
    const paused = subscription.trackingPaused !== true;
    setButtonBusy(button, true, paused ? "停止中…" : "恢复中…");
    try {
      const payload = await requestJson(
        `/api/subscriptions/${encodeURIComponent(subscriptionId)}/tracking`,
        {
          method: "PATCH",
          body: JSON.stringify({ paused }),
        },
      );
      showToast(payload.message);
      await loadDashboard({ silent: true });
      focusSubscriptionAction(subscriptionId, "tracking");
    } catch (error) {
      showToast(error.message, "error");
      setButtonBusy(button, false);
    }
    return;
  }

  if (button.dataset.action === "reminder") {
    const nextMode = button.dataset.nextReminderMode;
    const busyLabel = {
      enabled: "开启中…",
      muted: "静音中…",
      disabled: "关闭中…",
    }[nextMode];
    setButtonBusy(button, true, busyLabel);
    try {
      const payload = await requestJson(
        `/api/subscriptions/${encodeURIComponent(subscriptionId)}/reminder`,
        {
          method: "POST",
          body: JSON.stringify({ mode: nextMode }),
        },
      );
      showToast(payload.message);
      await loadDashboard({ silent: true });
      focusSubscriptionAction(subscriptionId, "reminder");
    } catch (error) {
      showToast(error.message, "error");
      setButtonBusy(button, false);
    }
    return;
  }

  if (button.dataset.action === "delete") {
    appState.activeSubscriptionId = subscriptionId;
    elements.deleteContext.textContent = `《${subscriptionDisplayTitle(
      subscription,
    )}》及其 ${subscription.seasonCount} 个已确认季会从本机删除。已登录红果账号时，对应的收藏和预约也会移除；远端操作失败会自动重试。`;
    setFormFeedback(elements.deleteFeedback);
    openDialog(elements.deleteDialog);
    elements.deleteSubmit.focus();
  }
});

elements.checkAll.addEventListener("click", async () => {
  setButtonBusy(elements.checkAll, true, "检查中…");
  elements.checkIndicator.hidden = false;
  setPageBusy(true);
  try {
    const payload = await requestJson("/api/check", {
      method: "POST",
      body: "{}",
      timeoutMs: CHECK_ALL_TIMEOUT_MS,
    });
    showToast(payload.message);
    await loadDashboard({ silent: true });
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonBusy(elements.checkAll, false);
    elements.checkIndicator.hidden = true;
    setPageBusy(false);
  }
});

function settingsValidationError(message, field, code = "") {
  const error = new Error(message);
  error.field = field;
  if (code) {
    error.code = code;
  }
  return error;
}

function setSecretInputVisibility(input, isVisible) {
  input.type = isVisible ? "text" : "password";
  const button = elements.settingsForm.querySelector(
    `[data-toggle-secret="${input.id}"]`,
  );
  if (!button) {
    return;
  }
  const label = button.dataset.label || button.getAttribute("aria-label");
  const hiddenLabel = label.replace(/^显示/, "隐藏");
  const visibleLabel = hiddenLabel.replace(/^隐藏/, "显示");
  button.setAttribute("aria-pressed", String(isVisible));
  button.setAttribute("aria-label", isVisible ? hiddenLabel : visibleLabel);
  button.innerHTML = icon(isVisible ? "eye-off" : "eye");
}

function resetSecretInput(input) {
  input.value = "";
  setSecretInputVisibility(input, false);
}

function discoveryReminderDurationMinutes() {
  const value = Number(elements.discoveryReminderDuration.value);
  const multiplier =
    discoveryReminderUnitMinutes[elements.discoveryReminderUnit.value];
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(multiplier) ||
    value < 0
  ) {
    return Number.NaN;
  }
  return value * multiplier;
}

function syncDiscoveryReminderFields() {
  const unit = elements.discoveryReminderUnit.value;
  const multiplier =
    discoveryReminderUnitMinutes[unit] ||
    discoveryReminderUnitMinutes.minutes;
  elements.discoveryReminderDuration.max = String(
    43_200 / multiplier,
  );
  elements.discoveryReminderUnit.dataset.minutesPerUnit = String(
    multiplier,
  );

  const duration = Number(elements.discoveryReminderDuration.value);
  const enabled = Number.isFinite(duration) && duration > 0;
  elements.discoveryReminderCron.disabled = !enabled;

  const pendingCount = Number(
    appState.dashboard?.settings?.pendingDiscoveryReminderCount || 0,
  );
  const status = elements.discoveryReminderStatus;
  status.classList.toggle("is-active", enabled);
  status.textContent = !enabled
    ? "未启用"
    : pendingCount > 0
      ? `持续提醒 ${pendingCount} 条`
      : "已启用";
}

function setDiscoveryReminderDuration(totalMinutes) {
  const minutes =
    Number.isFinite(Number(totalMinutes)) && Number(totalMinutes) >= 0
      ? Number(totalMinutes)
      : 0;
  let unit = "minutes";
  if (minutes > 0 && minutes % 1440 === 0) {
    unit = "days";
  } else if (minutes > 0 && minutes % 60 === 0) {
    unit = "hours";
  }
  elements.discoveryReminderUnit.value = unit;
  elements.discoveryReminderDuration.value = String(
    minutes / discoveryReminderUnitMinutes[unit],
  );
  syncDiscoveryReminderFields();
}

function syncProxySettings() {
  const proxy = elements.proxySettings;
  proxy.config.hidden = !proxy.enabled.checked;
  proxy.root.classList.toggle("is-enabled", proxy.enabled.checked);
  if (proxy.clear.checked) {
    proxy.status.textContent = "保存后清除";
  } else if (proxy.configured) {
    proxy.status.textContent = "已配置";
  } else if (proxy.enabled.checked) {
    proxy.status.textContent = "待填写";
  } else {
    proxy.status.textContent = "未配置";
  }
}

function setProxySettingsMetadata(proxy, { resetValues = false } = {}) {
  const settings = elements.proxySettings;
  settings.configured = Boolean(proxy?.configured);
  settings.enabled.checked = Boolean(proxy?.enabled);
  settings.clear.hidden = !settings.configured;
  settings.url.placeholder = proxy?.urlHint
    ? `已保存 ${proxy.urlHint}，留空保持不变`
    : "例如 http://127.0.0.1:7890";

  const channels = proxy?.channels || {};
  for (const input of elements.proxyChannelInputs) {
    input.checked = channels[input.dataset.proxyChannel] === true;
  }

  if (resetValues) {
    settings.clear.checked = false;
    resetSecretInput(settings.url);
  }
  syncProxySettings();
}

function syncNotificationChannel(channel) {
  channel.config.hidden = !channel.enabled.checked;
  channel.root.classList.toggle("is-enabled", channel.enabled.checked);
  if (channel.clear.checked) {
    channel.status.textContent = "保存后清除";
  } else if (channel.configured) {
    channel.status.textContent = "已配置";
  } else if (channel.enabled.checked) {
    channel.status.textContent = "待填写";
  } else {
    channel.status.textContent = "未配置";
  }
}

function setNotificationChannelMetadata(notifications, { resetValues = false } = {}) {
  const bark = notifications?.bark || {};
  const ntfy = notifications?.ntfy || {};
  const telegram = notifications?.telegram || {};
  const wecom = notifications?.wecom || {};
  const dingtalk = notifications?.dingtalk || {};
  const barkChannel = elements.notificationChannels.bark;
  const ntfyChannel = elements.notificationChannels.ntfy;
  const telegramChannel = elements.notificationChannels.telegram;
  const wecomChannel = elements.notificationChannels.wecom;
  const dingtalkChannel = elements.notificationChannels.dingtalk;

  barkChannel.configured = Boolean(bark.configured);
  barkChannel.clear.hidden = !bark.keyHint;
  barkChannel.key.placeholder = bark.keyHint
    ? `已保存 ${bark.keyHint}，留空保持不变`
    : "粘贴 Bark key";

  ntfyChannel.configured = Boolean(ntfy.configured);
  ntfyChannel.topicConfigured = Boolean(ntfy.topicHint);
  ntfyChannel.tokenConfigured = Boolean(ntfy.tokenConfigured);
  ntfyChannel.clear.hidden = !(
    ntfy.topicHint ||
    ntfy.tokenConfigured
  );
  ntfyChannel.topic.placeholder = ntfy.topicHint
    ? `已保存 ${ntfy.topicHint}，留空保持不变`
    : "例如 drama-assistant-8f3a";
  ntfyChannel.token.placeholder = ntfy.tokenConfigured
    ? `已保存 ${ntfy.tokenHint || "token"}，留空保持不变`
    : "留空表示不鉴权";

  telegramChannel.configured = Boolean(telegram.configured);
  telegramChannel.tokenConfigured = Boolean(telegram.tokenConfigured);
  telegramChannel.chatIdConfigured = Boolean(telegram.chatIdHint);
  telegramChannel.clear.hidden = !(
    telegram.tokenConfigured ||
    telegram.chatIdHint
  );
  telegramChannel.botToken.placeholder = telegram.tokenConfigured
    ? `已保存 ${telegram.tokenHint || "token"}，留空保持不变`
    : "从 BotFather 获取";
  telegramChannel.chatId.placeholder = telegram.chatIdHint
    ? `已保存 ${telegram.chatIdHint}，留空保持不变`
    : "例如 123456789 或 @channel";

  wecomChannel.configured = Boolean(wecom.configured);
  wecomChannel.clear.hidden = !wecom.keyHint;
  wecomChannel.key.placeholder = wecom.keyHint
    ? `已保存 ${wecom.keyHint}，留空保持不变`
    : "粘贴企业微信机器人 key";

  dingtalkChannel.configured = Boolean(dingtalk.configured);
  dingtalkChannel.accessTokenConfigured = Boolean(
    dingtalk.accessTokenConfigured,
  );
  dingtalkChannel.secretConfigured = Boolean(dingtalk.secretConfigured);
  dingtalkChannel.clear.hidden = !(
    dingtalk.accessTokenConfigured || dingtalk.secretConfigured
  );
  dingtalkChannel.accessToken.placeholder = dingtalk.accessTokenConfigured
    ? `已保存 ${dingtalk.accessTokenHint || "token"}，留空保持不变`
    : "粘贴钉钉机器人 access token";
  dingtalkChannel.secret.placeholder = dingtalk.secretConfigured
    ? `已保存 ${dingtalk.secretHint || "secret"}，留空保持不变`
    : "启用加签时填写，否则留空";

  for (const channelKey of notificationChannelOrder) {
    const channel = elements.notificationChannels[channelKey];
    if (resetValues) {
      channel.clear.checked = false;
      for (const input of channel.config.querySelectorAll("input")) {
        if (input.type === "password") {
          resetSecretInput(input);
        } else {
          input.value = "";
        }
      }
    }
    syncNotificationChannel(channel);
  }
}

function setSettingsTab(
  tab,
  { focusTab = false, focusFirstField = false } = {},
) {
  const nextTab = SETTINGS_TABS.includes(tab) ? tab : "general";
  appState.settingsTab = nextTab;

  for (const button of elements.settingsTabs) {
    const selected = button.dataset.settingsTab === nextTab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focusTab) {
      button.focus();
    }
  }
  for (const panel of elements.settingsPanels) {
    panel.hidden = panel.dataset.settingsPanel !== nextTab;
  }

  const saveLabels = {
    general: "保存常规设置",
    notification: "保存通知设置",
    account: "保存账号同步",
    templates: "保存消息模板",
  };
  elements.saveSettingsLabel.textContent = saveLabels[nextTab];
  elements.testNotifications.hidden = nextTab !== "notification";

  if (focusFirstField) {
    const firstFields = {
      general: elements.checkCron,
      notification: elements.episodeNotificationWindow,
      account: elements.settingsAccountLogin.hidden
        ? elements.accountSyncCron
        : elements.settingsAccountLogin,
      templates: notificationTemplateField("detailed", "title"),
    };
    if (nextTab === "templates") {
      const editor = elements.settingsForm.querySelector(
        '[data-notification-template="detailed"]',
      );
      if (editor instanceof HTMLDetailsElement) {
        editor.open = true;
      }
    }
    const firstField = firstFields[nextTab];
    firstField?.focus();
  }
}

function notificationTemplateField(type, field) {
  return elements.settingsForm.querySelector(
    `[data-notification-template="${type}"] [data-template-field="${field}"]`,
  );
}

function renderNotificationTemplateText(template, variables) {
  return String(template ?? "").replace(
    notificationTemplateVariablePattern,
    (match, name) =>
      Object.prototype.hasOwnProperty.call(variables, name)
        ? String(variables[name] ?? "")
        : match,
  );
}

function refreshNotificationTemplateEditor(editor) {
  const type = editor?.dataset.notificationTemplate;
  const example = notificationTemplateExamples[type];
  if (!editor || !example) {
    return;
  }
  const titleField = notificationTemplateField(type, "title");
  const bodyField = notificationTemplateField(type, "body");
  const previewTitle = editor.querySelector(
    "[data-template-preview-title]",
  );
  const previewBody = editor.querySelector(
    "[data-template-preview-body]",
  );
  const stateLabel = editor.querySelector("[data-template-state]");
  const restoreButton = editor.querySelector("[data-restore-template]");
  const title = titleField?.value || "";
  const body = bodyField?.value || "";
  const customized = Boolean(title.trim() || body.trim());

  stateLabel.textContent = customized ? "已自定义" : "内置默认";
  stateLabel.classList.toggle("is-customized", customized);
  restoreButton.disabled = !customized;
  previewTitle.textContent = title.trim()
    ? renderNotificationTemplateText(title, example.variables)
    : example.defaultTitle;
  previewBody.textContent = body.trim()
    ? renderNotificationTemplateText(body, example.variables)
    : example.defaultBody;
}

function refreshAllNotificationTemplateEditors() {
  for (const editor of elements.notificationTemplates) {
    refreshNotificationTemplateEditor(editor);
  }
}

function setNotificationTemplateValues(templates) {
  for (const editor of elements.notificationTemplates) {
    const type = editor.dataset.notificationTemplate;
    const template = templates?.[type] || {};
    const titleField = notificationTemplateField(type, "title");
    const bodyField = notificationTemplateField(type, "body");
    titleField.value = String(template.title ?? "");
    bodyField.value = String(template.body ?? "");
    setFieldError(titleField, false);
    setFieldError(bodyField, false);
    editor.open = false;
    refreshNotificationTemplateEditor(editor);
  }
}

function validateNotificationTemplateField(type, field, input) {
  const value = String(input.value ?? "").replace(/\r\n?/g, "\n");
  const maxLength =
    field === "title"
      ? MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH
      : MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH;
  if ([...value].length > maxLength) {
    throw settingsValidationError(
      `${notificationTemplateLabels[type]}的${
        notificationTemplateFieldLabels[field]
      }不能超过 ${maxLength} 个字符。`,
      input,
      "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
    );
  }

  const allowedVariables = new Set(notificationTemplateVariables[type]);
  for (const match of value.matchAll(
    new RegExp(notificationTemplateVariablePattern.source, "g"),
  )) {
    if (!allowedVariables.has(match[1])) {
      throw settingsValidationError(
        `${notificationTemplateLabels[type]}的${
          notificationTemplateFieldLabels[field]
        }包含不支持的变量 {${match[1]}}。`,
        input,
        "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
      );
    }
  }
  return value;
}

function notificationTemplatesPayload() {
  const templates = {};
  for (const editor of elements.notificationTemplates) {
    const type = editor.dataset.notificationTemplate;
    templates[type] = {
      title: validateNotificationTemplateField(
        type,
        "title",
        notificationTemplateField(type, "title"),
      ),
      body: validateNotificationTemplateField(
        type,
        "body",
        notificationTemplateField(type, "body"),
      ),
    };
  }
  return templates;
}

function rememberNotificationTemplateSelection(field) {
  if (!field) {
    return;
  }
  appState.templateFocusedField = field;
  appState.templateSelection = {
    start: Number.isInteger(field.selectionStart)
      ? field.selectionStart
      : String(field.value || "").length,
    end: Number.isInteger(field.selectionEnd)
      ? field.selectionEnd
      : String(field.value || "").length,
  };
}

function insertNotificationTemplateVariable(editor, variableName) {
  const type = editor.dataset.notificationTemplate;
  let field = appState.templateFocusedField;
  if (!field || !editor.contains(field)) {
    field = notificationTemplateField(type, "title");
  }
  if (!field) {
    return;
  }

  const currentValue = String(field.value || "");
  const selection = appState.templateSelection;
  const start = Math.min(
    Number.isInteger(selection.start) ? selection.start : currentValue.length,
    currentValue.length,
  );
  const end = Math.min(
    Math.max(
      start,
      Number.isInteger(selection.end) ? selection.end : start,
    ),
    currentValue.length,
  );
  const variable = `{${variableName}}`;
  field.value =
    currentValue.slice(0, start) +
    variable +
    currentValue.slice(end);
  const cursor = start + variable.length;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus({ preventScroll: true });
  field.setSelectionRange(cursor, cursor);
  rememberNotificationTemplateSelection(field);
}

function focusSettingsError(error) {
  const code = error?.code || "";
  if (
    [
      "INVALID_NOTIFICATION_TEMPLATE",
      "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
      "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
    ].includes(code)
  ) {
    setSettingsTab("templates");
    const type =
      Object.keys(notificationTemplateLabels).find((key) =>
        error.message.includes(notificationTemplateLabels[key]),
      ) || "detailed";
    const fieldName = error.message.includes("正文") ? "body" : "title";
    const field = notificationTemplateField(type, fieldName);
    const editor = field?.closest("[data-notification-template]");
    if (editor) {
      editor.open = true;
    }
    setFieldError(field, true);
    field?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    field?.focus({ preventScroll: true });
    return;
  }

  const generalCodes = new Map([
    ["INVALID_CHECK_CRON", elements.checkCron],
    ["INVALID_STALE_COMPLETION_DAYS", elements.staleCompletionDays],
    ["INVALID_NOTIFICATION_WINDOW", elements.episodeNotificationWindow],
    [
      "INVALID_DISCOVERY_REMINDER_DURATION",
      elements.discoveryReminderDuration,
    ],
    ["INVALID_DISCOVERY_REMINDER_CRON", elements.discoveryReminderCron],
  ]);
  const notificationCodes = new Map([
    ["INVALID_NOTIFICATION_PROXY", elements.proxySettings.url],
    ["INCOMPLETE_NOTIFICATION_PROXY", elements.proxySettings.url],
  ]);
  const accountCodes = new Map([
    ["INVALID_ACCOUNT_SYNC_CRON", elements.accountSyncCron],
  ]);
  const field =
    generalCodes.get(code) ||
    notificationCodes.get(code) ||
    accountCodes.get(code);
  if (generalCodes.has(code)) {
    setSettingsTab("general");
  } else if (notificationCodes.has(code)) {
    setSettingsTab("notification");
  } else if (accountCodes.has(code)) {
    setSettingsTab("account");
  }
  if (field) {
    setFieldError(field, true);
    field.focus();
  }
}

elements.openSettings.addEventListener("click", () => {
  const settings = appState.dashboard?.settings;
  const notifications = settings?.notifications || {};
  setProxySettingsMetadata(notifications.proxy, { resetValues: true });
  for (const channelKey of notificationChannelOrder) {
    elements.notificationChannels[channelKey].enabled.checked = Boolean(
      notifications[channelKey]?.enabled,
    );
  }
  elements.checkCron.value = settings?.checkCron || DEFAULT_CHECK_CRON;
  elements.staleCompletionDays.value = String(
    settings?.staleCompletionDays ?? DEFAULT_STALE_COMPLETION_DAYS,
  );
  elements.episodeNotificationWindow.value = String(
    settings?.episodeNotificationWindowMinutes ??
      DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
  );
  setDiscoveryReminderDuration(
    settings?.discoveryReminderDurationMinutes ??
      DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
  );
  elements.discoveryReminderCron.value =
    settings?.discoveryReminderCron || DEFAULT_DISCOVERY_REMINDER_CRON;
  elements.accountSyncCron.value =
    settings?.accountSyncCron || DEFAULT_ACCOUNT_SYNC_CRON;
  setNotificationChannelMetadata(notifications, { resetValues: true });
  setNotificationTemplateValues(settings?.notificationTemplates);
  elements.settingsForm
    .querySelectorAll("input, select, textarea")
    .forEach((input) => {
      setFieldError(input, false);
    });
  appState.templateFocusedField = null;
  setFormFeedback(elements.settingsFeedback);
  openDialog(elements.settingsDialog);
  elements.settingsDialog.querySelector(".dialog__body").scrollTop = 0;
  setSettingsTab("account", { focusFirstField: true });
  const run = newAccountRun();
  void loadAccountStatus({
    ...run,
    startLoginWhenSignedOut: false,
  });
});

elements.openEvents.addEventListener("click", () => {
  openDialog(elements.eventsDialog);
});

elements.settingsTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    setSettingsTab(tab.dataset.settingsTab);
    elements.settingsDialog.querySelector(".dialog__body").scrollTop = 0;
  });
  tab.addEventListener("keydown", (event) => {
    let nextIndex = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % elements.settingsTabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + elements.settingsTabs.length) %
        elements.settingsTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = elements.settingsTabs.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextTab = elements.settingsTabs[nextIndex];
    setSettingsTab(nextTab.dataset.settingsTab, { focusTab: true });
    elements.settingsDialog.querySelector(".dialog__body").scrollTop = 0;
  });
});

for (const editor of elements.notificationTemplates) {
  const type = editor.dataset.notificationTemplate;
  const fields = [
    notificationTemplateField(type, "title"),
    notificationTemplateField(type, "body"),
  ].filter(Boolean);

  for (const field of fields) {
    field.addEventListener("focus", () => {
      rememberNotificationTemplateSelection(field);
    });
    for (const eventName of ["click", "keyup", "select"]) {
      field.addEventListener(eventName, () => {
        rememberNotificationTemplateSelection(field);
      });
    }
    field.addEventListener("input", () => {
      setFieldError(field, false);
      rememberNotificationTemplateSelection(field);
      refreshNotificationTemplateEditor(editor);
      setFormFeedback(elements.settingsFeedback);
    });
  }

  editor.querySelectorAll("[data-template-variable]").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      insertNotificationTemplateVariable(
        editor,
        button.dataset.templateVariable,
      );
    });
  });

  editor
    .querySelector("[data-restore-template]")
    ?.addEventListener("click", () => {
      for (const field of fields) {
        field.value = "";
        setFieldError(field, false);
      }
      appState.templateFocusedField = fields[0] || null;
      refreshNotificationTemplateEditor(editor);
      fields[0]?.focus();
    });
}

elements.settingsForm.addEventListener("click", (event) => {
  const button = event.target.closest("[data-toggle-secret]");
  if (!button) {
    return;
  }
  const input = document.getElementById(button.dataset.toggleSecret);
  if (!input) {
    return;
  }
  setSecretInputVisibility(input, input.type === "password");
});

elements.checkCron.addEventListener("input", () => {
  setFieldError(elements.checkCron, false);
  setFormFeedback(elements.settingsFeedback);
});

elements.proxySettings.enabled.addEventListener("change", () => {
  syncProxySettings();
  setFormFeedback(elements.settingsFeedback);
});

elements.proxySettings.url.addEventListener("input", () => {
  setFieldError(elements.proxySettings.url, false);
  setFormFeedback(elements.settingsFeedback);
});

elements.discoveryReminderDuration.addEventListener("input", () => {
  setFieldError(elements.discoveryReminderDuration, false);
  syncDiscoveryReminderFields();
  setFormFeedback(elements.settingsFeedback);
});

elements.discoveryReminderCron.addEventListener("input", () => {
  setFieldError(elements.discoveryReminderCron, false);
  setFormFeedback(elements.settingsFeedback);
});

elements.discoveryReminderUnit.addEventListener("change", () => {
  const previousMultiplier = Number(
    elements.discoveryReminderUnit.dataset.minutesPerUnit,
  );
  const value = Number(elements.discoveryReminderDuration.value);
  const nextMultiplier =
    discoveryReminderUnitMinutes[elements.discoveryReminderUnit.value];
  if (
    Number.isFinite(previousMultiplier) &&
    Number.isFinite(value) &&
    Number.isFinite(nextMultiplier) &&
    nextMultiplier > 0
  ) {
    elements.discoveryReminderDuration.value = String(
      (value * previousMultiplier) / nextMultiplier,
    );
  }
  syncDiscoveryReminderFields();
  setFormFeedback(elements.settingsFeedback);
});

elements.proxySettings.clear.addEventListener("change", () => {
  if (elements.proxySettings.clear.checked) {
    elements.proxySettings.enabled.checked = false;
    setFieldError(elements.proxySettings.url, false);
  }
  syncProxySettings();
  setFormFeedback(elements.settingsFeedback);
});

for (const input of elements.proxyChannelInputs) {
  input.addEventListener("change", () => {
    setFormFeedback(elements.settingsFeedback);
  });
}

for (const channelKey of notificationChannelOrder) {
  const channel = elements.notificationChannels[channelKey];
  channel.enabled.addEventListener("change", () => {
    syncNotificationChannel(channel);
    setFormFeedback(elements.settingsFeedback);
  });
  channel.clear.addEventListener("change", () => {
    if (channel.clear.checked) {
      channel.enabled.checked = false;
      channel.config.querySelectorAll("input").forEach((input) => {
        setFieldError(input, false);
      });
    }
    syncNotificationChannel(channel);
    setFormFeedback(elements.settingsFeedback);
  });
}

function generalSettingsPayload() {
  const checkCron = elements.checkCron.value.trim().replace(/\s+/g, " ");
  if (checkCron.split(" ").filter(Boolean).length !== 5) {
    throw settingsValidationError(
      "自动检查计划需要使用 5 段 Cron 表达式。",
      elements.checkCron,
    );
  }
  const staleCompletionDays = Number(elements.staleCompletionDays.value);
  if (
    !Number.isInteger(staleCompletionDays) ||
    staleCompletionDays < 1 ||
    staleCompletionDays > 3650
  ) {
    throw settingsValidationError(
      "无更新自动停更期限需要在 1 到 3650 天之间。",
      elements.staleCompletionDays,
    );
  }
  const episodeNotificationWindowMinutes = Number(
    elements.episodeNotificationWindow.value,
  );
  if (
    !episodeNotificationWindowOptions.has(
      episodeNotificationWindowMinutes,
    )
  ) {
    throw settingsValidationError(
      "请选择支持的加集提醒汇总窗口。",
      elements.episodeNotificationWindow,
    );
  }
  const discoveryDurationValue = Number(
    elements.discoveryReminderDuration.value,
  );
  const discoveryUnitMultiplier =
    discoveryReminderUnitMinutes[elements.discoveryReminderUnit.value];
  if (
    !Number.isFinite(discoveryDurationValue) ||
    discoveryDurationValue < 0 ||
    !Number.isFinite(discoveryUnitMultiplier)
  ) {
    throw settingsValidationError(
      "持续提醒时长需要填写不小于 0 的数字。",
      elements.discoveryReminderDuration,
    );
  }
  const exactDiscoveryMinutes =
    discoveryDurationValue * discoveryUnitMultiplier;
  const discoveryReminderDurationMinutes =
    Math.round(exactDiscoveryMinutes);
  if (
    Math.abs(exactDiscoveryMinutes - discoveryReminderDurationMinutes) >
      0.000001 ||
    discoveryReminderDurationMinutes < 0 ||
    discoveryReminderDurationMinutes > 43_200
  ) {
    throw settingsValidationError(
      "持续提醒时长需要在 0 到 30 天之间，并精确到分钟。",
      elements.discoveryReminderDuration,
    );
  }
  const discoveryReminderCron = elements.discoveryReminderCron.value
    .replace(/\s+/g, " ")
    .trim();
  if (!discoveryReminderCron || discoveryReminderCron.split(" ").length !== 5) {
    throw settingsValidationError(
      "提醒频率需要使用有效的 5 段 Cron 表达式。",
      elements.discoveryReminderCron,
    );
  }

  return {
    checkCron,
    staleCompletionDays,
    episodeNotificationWindowMinutes,
    discoveryReminderDurationMinutes,
    discoveryReminderCron,
  };
}

function notificationSettingsPayload() {
  const proxySettings = elements.proxySettings;
  const proxyClear = proxySettings.clear.checked;
  const proxyEnabled = proxySettings.enabled.checked && !proxyClear;
  const proxyUrl = proxySettings.url.value.trim();
  const proxyChannels = Object.fromEntries(
    elements.proxyChannelInputs.map((input) => [
      input.dataset.proxyChannel,
      input.checked,
    ]),
  );
  if (!proxyClear && proxyUrl) {
    let proxyEndpoint;
    try {
      proxyEndpoint = new URL(proxyUrl);
    } catch {
      throw settingsValidationError(
        "代理地址格式不正确，请填写完整的 http:// 或 https:// 地址。",
        proxySettings.url,
      );
    }
    if (
      !["http:", "https:"].includes(proxyEndpoint.protocol) ||
      !proxyEndpoint.hostname ||
      proxyEndpoint.pathname !== "/" ||
      proxyEndpoint.search ||
      proxyEndpoint.hash
    ) {
      throw settingsValidationError(
        "代理仅支持 http:// 或 https:// 地址，且不要包含路径或查询参数。",
        proxySettings.url,
      );
    }
  }
  if (
    !proxyClear &&
    proxyEnabled &&
    !proxyUrl &&
    !proxySettings.configured
  ) {
    throw settingsValidationError(
      "启用通知代理前请填写代理地址。",
      proxySettings.url,
    );
  }
  if (
    !proxyClear &&
    proxyEnabled &&
    !Object.values(proxyChannels).some(Boolean)
  ) {
    throw settingsValidationError(
      "启用通知代理前请至少选择一个通知渠道。",
      proxySettings.url,
    );
  }

  const barkChannel = elements.notificationChannels.bark;
  const barkKey = barkChannel.key.value.trim();
  const barkClear = barkChannel.clear.checked;
  const barkEnabled = barkChannel.enabled.checked && !barkClear;
  if (barkEnabled && !barkKey && !barkChannel.configured) {
    throw settingsValidationError(
      "启用 Bark 前请填写 key。",
      barkChannel.key,
    );
  }

  const ntfyChannel = elements.notificationChannels.ntfy;
  const ntfyTopic = ntfyChannel.topic.value.trim();
  const ntfyToken = ntfyChannel.token.value.trim();
  const ntfyClear = ntfyChannel.clear.checked;
  const ntfyEnabled = ntfyChannel.enabled.checked && !ntfyClear;
  if (
    ntfyEnabled &&
    !ntfyTopic &&
    !(ntfyChannel.topicConfigured && !ntfyClear)
  ) {
    throw settingsValidationError(
      "启用 ntfy 前请填写 topic。",
      ntfyChannel.topic,
    );
  }

  const telegramChannel = elements.notificationChannels.telegram;
  const telegramBotToken = telegramChannel.botToken.value.trim();
  const telegramChatId = telegramChannel.chatId.value.trim();
  const telegramClear = telegramChannel.clear.checked;
  const telegramEnabled = telegramChannel.enabled.checked && !telegramClear;
  if (
    telegramEnabled &&
    !telegramBotToken &&
    !(telegramChannel.tokenConfigured && !telegramClear)
  ) {
    throw settingsValidationError(
      "启用 Telegram 前请填写 Bot token。",
      telegramChannel.botToken,
    );
  }
  if (
    telegramEnabled &&
    !telegramChatId &&
    !(telegramChannel.chatIdConfigured && !telegramClear)
  ) {
    throw settingsValidationError(
      "启用 Telegram 前请填写 chat ID。",
      telegramChannel.chatId,
    );
  }

  const wecomChannel = elements.notificationChannels.wecom;
  const wecomKey = wecomChannel.key.value.trim();
  const wecomClear = wecomChannel.clear.checked;
  const wecomEnabled = wecomChannel.enabled.checked && !wecomClear;
  if (wecomEnabled && !wecomKey && !wecomChannel.configured) {
    throw settingsValidationError(
      "启用企业微信前请填写机器人 key。",
      wecomChannel.key,
    );
  }

  const dingtalkChannel = elements.notificationChannels.dingtalk;
  const dingtalkAccessToken = dingtalkChannel.accessToken.value.trim();
  const dingtalkSecret = dingtalkChannel.secret.value.trim();
  const dingtalkClear = dingtalkChannel.clear.checked;
  const dingtalkEnabled = dingtalkChannel.enabled.checked && !dingtalkClear;
  if (
    dingtalkEnabled &&
    !dingtalkAccessToken &&
    !(dingtalkChannel.accessTokenConfigured && !dingtalkClear)
  ) {
    throw settingsValidationError(
      "启用钉钉前请填写机器人 access token。",
      dingtalkChannel.accessToken,
    );
  }

  return {
    notifications: {
      proxy: proxyClear
        ? { clear: true }
        : {
            enabled: proxyEnabled,
            ...(proxyUrl ? { url: proxyUrl } : {}),
            channels: proxyChannels,
          },
      bark: {
        enabled: barkEnabled,
        clear: barkClear,
        ...(barkKey ? { key: barkKey } : {}),
      },
      ntfy: {
        enabled: ntfyEnabled,
        clear: ntfyClear,
        ...(ntfyTopic ? { topic: ntfyTopic } : {}),
        ...(ntfyToken ? { token: ntfyToken } : {}),
      },
      telegram: {
        enabled: telegramEnabled,
        clear: telegramClear,
        ...(telegramBotToken ? { botToken: telegramBotToken } : {}),
        ...(telegramChatId ? { chatId: telegramChatId } : {}),
      },
      wecom: {
        enabled: wecomEnabled,
        clear: wecomClear,
        ...(wecomKey ? { key: wecomKey } : {}),
      },
      dingtalk: {
        enabled: dingtalkEnabled,
        clear: dingtalkClear,
        ...(dingtalkAccessToken
          ? { accessToken: dingtalkAccessToken }
          : {}),
        ...(dingtalkSecret ? { secret: dingtalkSecret } : {}),
      },
    },
  };
}

function accountSettingsPayload() {
  const accountSyncCron = elements.accountSyncCron.value
    .trim()
    .replace(/\s+/g, " ");
  if (accountSyncCron.split(" ").filter(Boolean).length !== 5) {
    throw settingsValidationError(
      "账号自动同步计划需要使用 5 段 Cron 表达式。",
      elements.accountSyncCron,
      "INVALID_ACCOUNT_SYNC_CRON",
    );
  }
  return { accountSyncCron };
}

function settingsPayload() {
  switch (appState.settingsTab) {
    case "notification":
      return notificationSettingsPayload();
    case "account":
      return accountSettingsPayload();
    case "templates":
      return { notificationTemplates: notificationTemplatesPayload() };
    default:
      return generalSettingsPayload();
  }
}

async function saveSettings({ closeAfter = true } = {}) {
  setFormFeedback(elements.settingsFeedback);
  elements.settingsForm
    .querySelectorAll("input, select, textarea")
    .forEach((input) => {
      setFieldError(input, false);
    });
  let payload;
  try {
    payload = settingsPayload();
  } catch (error) {
    setFormFeedback(elements.settingsFeedback, error.message);
    if (error.field) {
      setFieldError(error.field, true);
      error.field.focus();
    }
    return false;
  }

  const savedTab = appState.settingsTab;
  setButtonBusy(elements.saveSettings, true, "保存中…");
  try {
    const result = await requestJson("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
      timeoutMs: SETTINGS_REQUEST_TIMEOUT_MS,
    });
    const savedSettings = result.settings || {};
    if (savedTab === "general") {
      elements.staleCompletionDays.value = String(
        savedSettings.staleCompletionDays ??
          DEFAULT_STALE_COMPLETION_DAYS,
      );
      elements.checkCron.value =
        savedSettings.checkCron || DEFAULT_CHECK_CRON;
      elements.episodeNotificationWindow.value = String(
        savedSettings.episodeNotificationWindowMinutes ??
          DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES,
      );
      setDiscoveryReminderDuration(
        savedSettings.discoveryReminderDurationMinutes ??
          DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES,
      );
      elements.discoveryReminderCron.value =
        savedSettings.discoveryReminderCron ||
        DEFAULT_DISCOVERY_REMINDER_CRON;
    } else if (savedTab === "notification") {
      setProxySettingsMetadata(
        savedSettings.notifications?.proxy,
        { resetValues: true },
      );
      setNotificationChannelMetadata(
        savedSettings.notifications,
        { resetValues: true },
      );
    } else if (savedTab === "account") {
      elements.accountSyncCron.value =
        savedSettings.accountSyncCron || DEFAULT_ACCOUNT_SYNC_CRON;
    } else if (savedTab === "templates") {
      setNotificationTemplateValues(
        savedSettings.notificationTemplates,
      );
    }
    if (appState.dashboard) {
      appState.dashboard.settings = {
        ...appState.dashboard.settings,
        ...savedSettings,
      };
      renderDashboard();
    }
    setFormFeedback(
      elements.settingsFeedback,
      result.message || "设置已保存。",
      "success",
    );
    showToast(result.message || "设置已保存。");
    if (closeAfter) {
      closeDialog(elements.settingsDialog);
    }
    void loadDashboard({ silent: true });
    return true;
  } catch (error) {
    const message =
      error.code === "REQUEST_TIMEOUT"
        ? "保存请求超时，设置可能已经保存，请刷新页面确认。"
        : error.message;
    setFormFeedback(elements.settingsFeedback, message);
    focusSettingsError(error);
    return false;
  } finally {
    setButtonBusy(elements.saveSettings, false);
    setSettingsTab(appState.settingsTab);
  }
}

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
});

elements.testNotifications.addEventListener("click", async () => {
  setSettingsTab("notification");
  setFormFeedback(elements.settingsFeedback);
  setButtonBusy(elements.testNotifications, true, "发送中…");
  try {
    const saved = await saveSettings({ closeAfter: false });
    if (!saved) {
      return;
    }
    const payload = await requestJson("/api/notifications/test", {
      method: "POST",
      body: "{}",
      timeoutMs: SCREENSHOT_ANALYZE_TIMEOUT_MS,
    });
    setFormFeedback(
      elements.settingsFeedback,
      payload.message || "测试通知已发送。",
      payload.ok ? "success" : "error",
    );
    showToast(
      payload.message || "测试通知已发送。",
      payload.ok ? "success" : "error",
    );
  } catch (error) {
    setFormFeedback(elements.settingsFeedback, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonBusy(elements.testNotifications, false);
  }
});

elements.seasonShareInput.addEventListener("input", () => {
  setFieldError(elements.seasonShareInput, false);
  setFormFeedback(elements.seasonFeedback);
});

elements.seasonForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = elements.seasonShareInput.value.trim();
  setFieldError(elements.seasonShareInput, false);
  setFormFeedback(elements.seasonFeedback);
  if (!input) {
    setFieldError(elements.seasonShareInput, true);
    setFormFeedback(elements.seasonFeedback, "请先粘贴另一季的分享链接或剧集 ID。");
    elements.seasonShareInput.focus();
    return;
  }
  if (!appState.activeSubscriptionId) {
    return;
  }

  setButtonBusy(elements.seasonSubmit, true, "正在校验…");
  try {
    const payload = await requestJson(
      `/api/subscriptions/${encodeURIComponent(
        appState.activeSubscriptionId,
      )}/seasons`,
      {
        method: "POST",
        body: JSON.stringify({ input }),
        timeoutMs: LONG_ACTION_TIMEOUT_MS,
      },
    );
    closeDialog(elements.seasonDialog);
    showToast(payload.message);
    await loadDashboard({ silent: true });
    focusSubscriptionAction(appState.activeSubscriptionId, "add-season");
  } catch (error) {
    setFieldError(elements.seasonShareInput, true);
    setFormFeedback(elements.seasonFeedback, error.message);
    elements.seasonShareInput.focus();
  } finally {
    setButtonBusy(elements.seasonSubmit, false);
  }
});

elements.statusForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!appState.activeSubscriptionId) {
    return;
  }
  const status =
    elements.statusForm.querySelector(
      'input[name="seriesStatus"]:checked',
    )?.value || "";
  if (!["auto", "updating", "completed", "unknown"].includes(status)) {
    setFormFeedback(elements.statusFeedback, "请选择要切换的系列状态。");
    return;
  }

  setFormFeedback(elements.statusFeedback);
  setButtonBusy(elements.statusSubmit, true, "保存中…");
  try {
    const payload = await requestJson(
      `/api/subscriptions/${encodeURIComponent(
        appState.activeSubscriptionId,
      )}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );
    closeDialog(elements.statusDialog);
    showToast(payload.message);
    await loadDashboard({ silent: true });
    focusSubscriptionAction(appState.activeSubscriptionId, "status");
  } catch (error) {
    setFormFeedback(elements.statusFeedback, error.message);
  } finally {
    setButtonBusy(elements.statusSubmit, false);
  }
});

elements.deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!appState.activeSubscriptionId) {
    return;
  }
  setFormFeedback(elements.deleteFeedback);
  setButtonBusy(elements.deleteSubmit, true, "正在删除…");
  try {
    const payload = await requestJson(
      `/api/subscriptions/${encodeURIComponent(appState.activeSubscriptionId)}`,
      { method: "DELETE" },
    );
    closeDialog(elements.deleteDialog);
    showToast(payload.message);
    await loadDashboard({ silent: true });
    elements.watchlistTitle.focus();
  } catch (error) {
    setFormFeedback(elements.deleteFeedback, error.message);
  } finally {
    setButtonBusy(elements.deleteSubmit, false);
  }
});

elements.scrollToTop.addEventListener("click", () => {
  scrollPageTo(0);
});

elements.scrollToBottom.addEventListener("click", () => {
  const scroller = document.scrollingElement || document.documentElement;
  scrollPageTo(scroller.scrollHeight);
});

window.addEventListener("scroll", scheduleScrollControlsUpdate, {
  passive: true,
});
window.addEventListener("resize", scheduleScrollControlsUpdate);

if (typeof ResizeObserver === "function") {
  appState.scrollControlsResizeObserver = new ResizeObserver(
    scheduleScrollControlsUpdate,
  );
  appState.scrollControlsResizeObserver.observe(document.body);
  appState.scrollControlsResizeObserver.observe(elements.mainContent);
}

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    closeDialog(document.getElementById(closeButton.dataset.closeDialog));
    return;
  }
  for (const dialog of document.querySelectorAll("dialog[open]")) {
    if (event.target === dialog) {
      closeDialog(dialog);
    }
  }
});

for (const input of elements.settingsForm.querySelectorAll(
  "input, select, textarea",
)) {
  input.addEventListener("input", () => {
    setFieldError(input, false);
    setFormFeedback(elements.settingsFeedback);
  });
}

resetSeriesSearch();
scheduleScrollControlsUpdate();
void loadDashboard();
