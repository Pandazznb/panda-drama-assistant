export const APP_NAME = "短剧助手";
export const DEFAULT_PORT = 3417;
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_CHECK_CRON = "11 0,6,10,12,18 * * *";
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 10_080;
export const DEFAULT_STALE_COMPLETION_DAYS = 90;
export const MIN_STALE_COMPLETION_DAYS = 1;
export const MAX_STALE_COMPLETION_DAYS = 3650;
export const DEFAULT_EPISODE_NOTIFICATION_WINDOW_MINUTES = 0;
export const EPISODE_NOTIFICATION_WINDOW_OPTIONS = Object.freeze([
  0,
  60,
  120,
  360,
  720,
  1440,
]);
export const DEFAULT_DISCOVERY_REMINDER_DURATION_MINUTES = 2 * 24 * 60;
export const MAX_DISCOVERY_REMINDER_DURATION_MINUTES = 43_200;
export const DEFAULT_DISCOVERY_REMINDER_CRON = "0 */4 * * *";
export const DEFAULT_ACCOUNT_SYNC_CRON = "0 3 * * *";
export const DISCOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const CANDIDATE_RECHECK_MS = 24 * 60 * 60 * 1000;

export const OFFICIAL_WEB_URL = "https://hongguoduanju.com";
export const OFFICIAL_DETAIL_URL = `${OFFICIAL_WEB_URL}/detail?series_id=`;
export const BARK_API_ORIGIN = "https://api.day.app";
export const NTFY_API_ORIGIN = "https://ntfy.sh";
export const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
export const WECOM_API_ORIGIN = "https://qyapi.weixin.qq.com";
export const DINGTALK_API_ORIGIN = "https://oapi.dingtalk.com";

export const ALLOWED_SHARE_HOST_SUFFIXES = [
  "hongguoduanju.com",
  "novelquickapp.com",
  "changdunovel.com",
  "fqnovel.com",
];

export const SERIES_STATUS = Object.freeze({
  UPDATING: "updating",
  COMPLETED: "completed",
  INACTIVE: "inactive",
  UNKNOWN: "unknown",
});

export const EVENT_TYPE = Object.freeze({
  BASELINE: "baseline",
  EPISODE: "episode",
  SEASON: "season",
  COMPLETED: "completed",
  ERROR: "error",
});
