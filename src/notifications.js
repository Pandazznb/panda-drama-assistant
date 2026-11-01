import { createHmac } from "node:crypto";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import {
  APP_NAME,
  BARK_API_ORIGIN,
  DINGTALK_API_ORIGIN,
  NTFY_API_ORIGIN,
  TELEGRAM_API_ORIGIN,
  WECOM_API_ORIGIN,
} from "./constants.js";
import {
  maskBarkKey,
  normalizeBarkKey,
  sendBarkNotification,
} from "./bark.js";
import { isPlainObject } from "./utils.js";

const NOTIFICATION_TIMEOUT_MS = 12_000;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 1_200;
const MAX_NTFY_TOPIC_LENGTH = 64;
const MAX_NTFY_TOKEN_LENGTH = 512;
const MAX_TELEGRAM_TOKEN_LENGTH = 96;
const MAX_TELEGRAM_CHAT_ID_LENGTH = 64;
const MAX_WECOM_KEY_LENGTH = 128;
const MAX_WECOM_TEXT_BYTES = 2_048;
const MAX_WECOM_APP_CORP_ID_LENGTH = 64;
const MAX_WECOM_APP_SECRET_LENGTH = 256;
const MAX_WECOM_APP_AGENT_ID = 2_147_483_647;
const MAX_WECOM_APP_TO_USER_LENGTH = 1_024;
const MAX_WECOM_APP_TO_USER_MEMBERS = 100;
const MAX_WECOM_APP_ACCESS_TOKEN_LENGTH = 512;
const MAX_DINGTALK_ACCESS_TOKEN_LENGTH = 256;
const MAX_DINGTALK_SECRET_LENGTH = 256;
const MAX_PROXY_URL_LENGTH = 2_048;
const NTFY_TOPIC_PATTERN = /^[A-Za-z0-9_-]+$/;
const NTFY_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const TELEGRAM_TOKEN_PATTERN = /^\d{5,20}:[A-Za-z0-9_-]{20,64}$/;
const TELEGRAM_CHAT_ID_PATTERN = /^(?:-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/;
const WECOM_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const WECOM_APP_CORP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const WECOM_APP_SECRET_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const WECOM_APP_USER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const WECOM_APP_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const DINGTALK_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const DINGTALK_SECRET_PATTERN = /^[A-Za-z0-9._~+/=-]+$/;
const PROXY_PROTOCOLS = new Set(["http:", "https:"]);
const WEBHOOK_MESSAGE_PREFIX = `【${APP_NAME}】`;

export const NOTIFICATION_CHANNELS = Object.freeze([
  "bark",
  "ntfy",
  "telegram",
  "wecom",
  "wecomApp",
  "dingtalk",
]);

const CHANNEL_LABELS = Object.freeze({
  bark: "Bark",
  ntfy: "ntfy",
  telegram: "Telegram",
  wecom: "企业微信群机器人",
  wecomApp: "企业微信应用",
  dingtalk: "钉钉",
});

export class NotificationError extends Error {
  constructor(message, code = "NOTIFICATION_ERROR", statusCode = 502) {
    super(message);
    this.name = "NotificationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function truncateUtf8(value, maxBytes, suffix = "…") {
  const text = String(value || "").trim();
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }

  const suffixBytes = Buffer.byteLength(suffix, "utf8");
  let result = "";
  let usedBytes = 0;
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes + suffixBytes > maxBytes) {
      break;
    }
    result += character;
    usedBytes += characterBytes;
  }
  return `${result}${suffix}`;
}

function storedString(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function validStoredBarkKey(value) {
  const key = storedString(value, 128);
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : "";
}

function validStoredNtfyTopic(value) {
  const topic = storedString(value, MAX_NTFY_TOPIC_LENGTH);
  return NTFY_TOPIC_PATTERN.test(topic) ? topic : "";
}

function validStoredNtfyToken(value) {
  const token = storedString(value, MAX_NTFY_TOKEN_LENGTH);
  return NTFY_TOKEN_PATTERN.test(token) ? token : "";
}

function validStoredTelegramToken(value) {
  const token = storedString(value, MAX_TELEGRAM_TOKEN_LENGTH);
  return TELEGRAM_TOKEN_PATTERN.test(token) ? token : "";
}

function validStoredTelegramChatId(value) {
  const chatId = storedString(value, MAX_TELEGRAM_CHAT_ID_LENGTH);
  return TELEGRAM_CHAT_ID_PATTERN.test(chatId) ? chatId : "";
}

function validStoredWeComKey(value) {
  const key = storedString(value, MAX_WECOM_KEY_LENGTH);
  return WECOM_KEY_PATTERN.test(key) ? key : "";
}

function validStoredWeComAppCorpId(value) {
  const corpId = storedString(value, MAX_WECOM_APP_CORP_ID_LENGTH);
  return WECOM_APP_CORP_ID_PATTERN.test(corpId) ? corpId : "";
}

function validStoredWeComAppSecret(value) {
  const secret = storedString(value, MAX_WECOM_APP_SECRET_LENGTH);
  return WECOM_APP_SECRET_PATTERN.test(secret) ? secret : "";
}

function validStoredWeComAppAgentId(value) {
  const agentId = storedString(value, 10);
  if (!/^\d+$/.test(agentId)) {
    return "";
  }
  const number = Number(agentId);
  return Number.isInteger(number) &&
    number >= 1 &&
    number <= MAX_WECOM_APP_AGENT_ID
    ? String(number)
    : "";
}

function validStoredWeComAppToUser(value) {
  const toUser = String(value || "").trim();
  if (!toUser || toUser.length > MAX_WECOM_APP_TO_USER_LENGTH) {
    return "";
  }
  const members = toUser.split("|");
  if (members.length === 1 && members[0] === "@all") {
    return "@all";
  }
  return members.length <= MAX_WECOM_APP_TO_USER_MEMBERS &&
    members.every(
      (member) =>
        member.length <= 64 && WECOM_APP_USER_ID_PATTERN.test(member),
    )
    ? members.join("|")
    : "";
}

function validStoredDingTalkAccessToken(value) {
  const token = storedString(value, MAX_DINGTALK_ACCESS_TOKEN_LENGTH);
  return DINGTALK_ACCESS_TOKEN_PATTERN.test(token) ? token : "";
}

function validStoredDingTalkSecret(value) {
  const secret = storedString(value, MAX_DINGTALK_SECRET_LENGTH);
  return DINGTALK_SECRET_PATTERN.test(secret) ? secret : "";
}

function normalizeProxyChannels(input) {
  const source = isPlainObject(input) ? input : {};
  return Object.fromEntries(
    NOTIFICATION_CHANNELS.map((channel) => [
      channel,
      source[channel] === true,
    ]),
  );
}

export function normalizeProxyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new NotificationError(
      "启用通知代理前请填写代理地址。",
      "INVALID_NOTIFICATION_PROXY",
      400,
    );
  }
  if (raw.length > MAX_PROXY_URL_LENGTH) {
    throw new NotificationError(
      "代理地址不能超过 2048 个字符。",
      "INVALID_NOTIFICATION_PROXY",
      400,
    );
  }

  let endpoint;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new NotificationError(
      "代理地址格式不正确，请填写完整的 http:// 或 https:// 地址。",
      "INVALID_NOTIFICATION_PROXY",
      400,
    );
  }
  if (
    !PROXY_PROTOCOLS.has(endpoint.protocol) ||
    !endpoint.hostname ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new NotificationError(
      "代理仅支持 http:// 或 https:// 地址，且不要包含路径、查询参数或锚点。",
      "INVALID_NOTIFICATION_PROXY",
      400,
    );
  }
  return endpoint.href;
}

function validStoredProxyUrl(value) {
  try {
    return normalizeProxyUrl(value);
  } catch {
    return "";
  }
}

function normalizeProxySettings(input) {
  const source = isPlainObject(input) ? input : {};
  const url = validStoredProxyUrl(source.url);
  const channels = normalizeProxyChannels(source.channels);
  const enabled =
    source.enabled === true &&
    Boolean(url) &&
    Object.values(channels).some(Boolean);

  return {
    enabled,
    url,
    channels,
  };
}

function maskProxyUrl(value) {
  const normalized = validStoredProxyUrl(value);
  if (!normalized) {
    return "";
  }
  const endpoint = new URL(normalized);
  const credentials =
    endpoint.username || endpoint.password ? "***@" : "";
  return `${endpoint.protocol}//${credentials}${endpoint.host}`;
}

export function createDefaultNotificationSettings() {
  return {
    proxy: {
      enabled: false,
      url: "",
      channels: normalizeProxyChannels(),
    },
    bark: {
      enabled: false,
      key: "",
    },
    ntfy: {
      enabled: false,
      topic: "",
      token: "",
    },
    telegram: {
      enabled: false,
      botToken: "",
      chatId: "",
    },
    wecom: {
      enabled: false,
      key: "",
    },
    wecomApp: {
      enabled: false,
      corpId: "",
      secret: "",
      agentId: "",
      toUser: "",
    },
    dingtalk: {
      enabled: false,
      accessToken: "",
      secret: "",
    },
  };
}

export function normalizeNotificationSettings(input, legacyBarkKey = "") {
  const source = isPlainObject(input) ? input : {};
  const proxy = isPlainObject(source.proxy) ? source.proxy : {};
  const bark = isPlainObject(source.bark) ? source.bark : {};
  const ntfy = isPlainObject(source.ntfy) ? source.ntfy : {};
  const telegram = isPlainObject(source.telegram) ? source.telegram : {};
  const wecom = isPlainObject(source.wecom) ? source.wecom : {};
  const wecomApp = isPlainObject(source.wecomApp) ? source.wecomApp : {};
  const dingtalk = isPlainObject(source.dingtalk) ? source.dingtalk : {};
  const migratedBarkKey = validStoredBarkKey(legacyBarkKey);
  const barkKey = validStoredBarkKey(bark.key) || migratedBarkKey;

  return {
    proxy: normalizeProxySettings(proxy),
    bark: {
      enabled: bark.enabled === true || Boolean(migratedBarkKey),
      key: barkKey,
    },
    ntfy: {
      enabled: ntfy.enabled === true,
      topic: validStoredNtfyTopic(ntfy.topic),
      token: validStoredNtfyToken(ntfy.token),
    },
    telegram: {
      enabled: telegram.enabled === true,
      botToken: validStoredTelegramToken(telegram.botToken),
      chatId: validStoredTelegramChatId(telegram.chatId),
    },
    wecom: {
      enabled: wecom.enabled === true,
      key: validStoredWeComKey(wecom.key),
    },
    wecomApp: {
      enabled: wecomApp.enabled === true,
      corpId: validStoredWeComAppCorpId(wecomApp.corpId),
      secret: validStoredWeComAppSecret(wecomApp.secret),
      agentId: validStoredWeComAppAgentId(wecomApp.agentId),
      toUser: validStoredWeComAppToUser(wecomApp.toUser),
    },
    dingtalk: {
      enabled: dingtalk.enabled === true,
      accessToken: validStoredDingTalkAccessToken(dingtalk.accessToken),
      secret: validStoredDingTalkSecret(dingtalk.secret),
    },
  };
}

export function normalizeNtfyTopic(value) {
  const topic = String(value || "").trim();
  if (
    !topic ||
    topic.length > MAX_NTFY_TOPIC_LENGTH ||
    !NTFY_TOPIC_PATTERN.test(topic)
  ) {
    throw new NotificationError(
      "ntfy topic 只能包含字母、数字、下划线或短横线，且不能超过 64 个字符。",
      "INVALID_NTFY_TOPIC",
      400,
    );
  }
  return topic;
}

export function normalizeNtfyToken(value) {
  const token = String(value || "").trim();
  if (!token) {
    return "";
  }
  if (
    token.length > MAX_NTFY_TOKEN_LENGTH ||
    !NTFY_TOKEN_PATTERN.test(token)
  ) {
    throw new NotificationError(
      "ntfy access token 格式不正确。",
      "INVALID_NTFY_TOKEN",
      400,
    );
  }
  return token;
}

export function normalizeTelegramBotToken(value) {
  const token = String(value || "").trim();
  if (
    !token ||
    token.length > MAX_TELEGRAM_TOKEN_LENGTH ||
    !TELEGRAM_TOKEN_PATTERN.test(token)
  ) {
    throw new NotificationError(
      "Telegram Bot token 格式不正确。",
      "INVALID_TELEGRAM_TOKEN",
      400,
    );
  }
  return token;
}

export function normalizeTelegramChatId(value) {
  const chatId = String(value || "").trim();
  if (
    !chatId ||
    chatId.length > MAX_TELEGRAM_CHAT_ID_LENGTH ||
    !TELEGRAM_CHAT_ID_PATTERN.test(chatId)
  ) {
    throw new NotificationError(
      "Telegram chat ID 应为数字 ID 或 @channelusername。",
      "INVALID_TELEGRAM_CHAT_ID",
      400,
    );
  }
  return chatId;
}

export function normalizeWeComKey(value) {
  const key = String(value || "").trim();
  if (
    !key ||
    key.length > MAX_WECOM_KEY_LENGTH ||
    !WECOM_KEY_PATTERN.test(key)
  ) {
    throw new NotificationError(
      "企业微信机器人 key 格式不正确，只填写 key 参数，不要粘贴完整网址。",
      "INVALID_WECOM_KEY",
      400,
    );
  }
  return key;
}

export function normalizeWeComAppCorpId(value) {
  const corpId = String(value || "").trim();
  if (
    !corpId ||
    corpId.length > MAX_WECOM_APP_CORP_ID_LENGTH ||
    !WECOM_APP_CORP_ID_PATTERN.test(corpId)
  ) {
    throw new NotificationError(
      "企业微信应用的企业 ID 格式不正确。",
      "INVALID_WECOM_APP_CORP_ID",
      400,
    );
  }
  return corpId;
}

export function normalizeWeComAppSecret(value) {
  const secret = String(value || "").trim();
  if (
    !secret ||
    secret.length > MAX_WECOM_APP_SECRET_LENGTH ||
    !WECOM_APP_SECRET_PATTERN.test(secret)
  ) {
    throw new NotificationError(
      "企业微信应用的 Secret 格式不正确。",
      "INVALID_WECOM_APP_SECRET",
      400,
    );
  }
  return secret;
}

export function normalizeWeComAppAgentId(value) {
  const agentId = String(value ?? "").trim();
  const number = Number(agentId);
  if (
    !/^\d+$/.test(agentId) ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > MAX_WECOM_APP_AGENT_ID
  ) {
    throw new NotificationError(
      "企业微信应用的 AgentId 必须是正整数。",
      "INVALID_WECOM_APP_AGENT_ID",
      400,
    );
  }
  return String(number);
}

export function normalizeWeComAppToUser(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new NotificationError(
      "启用企业微信应用前请填写接收成员。",
      "INVALID_WECOM_APP_TO_USER",
      400,
    );
  }
  const members = raw
    .split(/[|,，\s]+/)
    .map((member) => member.trim())
    .filter(Boolean);
  if (
    !members.length ||
    members.length > MAX_WECOM_APP_TO_USER_MEMBERS ||
    members.some((member) => member.length > 64) ||
    (members.includes("@all") && members.length !== 1) ||
    members.some(
      (member) =>
        member !== "@all" && !WECOM_APP_USER_ID_PATTERN.test(member),
    )
  ) {
    throw new NotificationError(
      "企业微信应用接收成员仅支持 @all，或使用 | 分隔的 UserID。",
      "INVALID_WECOM_APP_TO_USER",
      400,
    );
  }
  const normalized = members.join("|");
  if (normalized.length > MAX_WECOM_APP_TO_USER_LENGTH) {
    throw new NotificationError(
      "企业微信应用接收成员不能超过 1024 个字符。",
      "INVALID_WECOM_APP_TO_USER",
      400,
    );
  }
  return normalized;
}

function normalizeWeComAppAccessToken(value) {
  const token = String(value || "").trim();
  if (
    !token ||
    token.length > MAX_WECOM_APP_ACCESS_TOKEN_LENGTH ||
    !WECOM_APP_ACCESS_TOKEN_PATTERN.test(token)
  ) {
    throw new NotificationError(
      "企业微信应用返回的 access token 无效。",
      "INVALID_WECOM_APP_ACCESS_TOKEN",
      502,
    );
  }
  return token;
}

export function normalizeDingTalkAccessToken(value) {
  const token = String(value || "").trim();
  if (
    !token ||
    token.length > MAX_DINGTALK_ACCESS_TOKEN_LENGTH ||
    !DINGTALK_ACCESS_TOKEN_PATTERN.test(token)
  ) {
    throw new NotificationError(
      "钉钉机器人 access token 格式不正确，只填写 access_token 参数。",
      "INVALID_DINGTALK_ACCESS_TOKEN",
      400,
    );
  }
  return token;
}

export function normalizeDingTalkSecret(value) {
  const secret = String(value || "").trim();
  if (!secret) {
    return "";
  }
  if (
    secret.length > MAX_DINGTALK_SECRET_LENGTH ||
    !DINGTALK_SECRET_PATTERN.test(secret)
  ) {
    throw new NotificationError(
      "钉钉机器人加签 secret 格式不正确。",
      "INVALID_DINGTALK_SECRET",
      400,
    );
  }
  return secret;
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (text.length <= 6) {
    return `${text.slice(0, 1)}***`;
  }
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

export function isNotificationChannelConfigured(channel, config) {
  if (channel === "bark") {
    return Boolean(validStoredBarkKey(config?.key));
  }
  if (channel === "ntfy") {
    return Boolean(validStoredNtfyTopic(config?.topic));
  }
  if (channel === "telegram") {
    return Boolean(
      validStoredTelegramToken(config?.botToken) &&
        validStoredTelegramChatId(config?.chatId),
    );
  }
  if (channel === "wecom") {
    return Boolean(validStoredWeComKey(config?.key));
  }
  if (channel === "wecomApp") {
    return Boolean(
      validStoredWeComAppCorpId(config?.corpId) &&
        validStoredWeComAppSecret(config?.secret) &&
        validStoredWeComAppAgentId(config?.agentId) &&
        validStoredWeComAppToUser(config?.toUser),
    );
  }
  if (channel === "dingtalk") {
    return Boolean(validStoredDingTalkAccessToken(config?.accessToken));
  }
  return false;
}

export function enabledNotificationChannels(settings) {
  const normalized = normalizeNotificationSettings(settings);
  return NOTIFICATION_CHANNELS.filter(
    (channel) => normalized[channel].enabled,
  );
}

export function describeNotificationSettings(settings) {
  const normalized = normalizeNotificationSettings(settings);
  const channels = {};
  let enabledCount = 0;
  let configuredCount = 0;

  for (const channel of NOTIFICATION_CHANNELS) {
    const config = normalized[channel];
    const configured = isNotificationChannelConfigured(channel, config);
    if (config.enabled) {
      enabledCount += 1;
    }
    if (configured) {
      configuredCount += 1;
    }
    channels[channel] = {
      enabled: config.enabled,
      configured,
    };
  }

  channels.bark.keyHint = maskBarkKey(normalized.bark.key);
  channels.ntfy.topicHint = maskSecret(normalized.ntfy.topic);
  channels.ntfy.tokenConfigured = Boolean(normalized.ntfy.token);
  channels.ntfy.tokenHint = maskSecret(normalized.ntfy.token);
  channels.telegram.tokenConfigured = Boolean(normalized.telegram.botToken);
  channels.telegram.tokenHint = maskSecret(normalized.telegram.botToken);
  channels.telegram.chatIdHint = maskSecret(normalized.telegram.chatId);
  channels.wecom.keyHint = maskSecret(normalized.wecom.key);
  channels.wecomApp.corpIdConfigured = Boolean(normalized.wecomApp.corpId);
  channels.wecomApp.secretConfigured = Boolean(normalized.wecomApp.secret);
  channels.wecomApp.agentIdConfigured = Boolean(normalized.wecomApp.agentId);
  channels.wecomApp.toUserConfigured = Boolean(normalized.wecomApp.toUser);
  channels.dingtalk.accessTokenConfigured = Boolean(
    normalized.dingtalk.accessToken,
  );
  channels.dingtalk.accessTokenHint = maskSecret(
    normalized.dingtalk.accessToken,
  );
  channels.dingtalk.secretConfigured = Boolean(normalized.dingtalk.secret);
  channels.dingtalk.secretHint = maskSecret(normalized.dingtalk.secret);

  return {
    enabledCount,
    configuredCount,
    proxy: {
      enabled: normalized.proxy.enabled,
      configured: Boolean(normalized.proxy.url),
      urlHint: maskProxyUrl(normalized.proxy.url),
      channels: { ...normalized.proxy.channels },
    },
    ...channels,
  };
}

function optionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function applyChannelPatch(current, patch, channel) {
  const next = { ...current };
  if (!isPlainObject(patch)) {
    throw new NotificationError(
      `${CHANNEL_LABELS[channel]} 设置格式不正确。`,
      "INVALID_NOTIFICATION_SETTINGS",
      400,
    );
  }

  if (patch.clear === true) {
    next.enabled = false;
  }

  if (Object.hasOwn(patch, "enabled")) {
    if (typeof patch.enabled !== "boolean") {
      throw new NotificationError(
        `${CHANNEL_LABELS[channel]} 的启用状态不正确。`,
        "INVALID_NOTIFICATION_SETTINGS",
        400,
      );
    }
    next.enabled = patch.clear === true ? false : patch.enabled;
  }

  if (channel === "bark") {
    if (patch.clear === true) {
      next.key = "";
    } else if (Object.hasOwn(patch, "key") && optionalString(patch.key)) {
      next.key = normalizeBarkKey(patch.key);
    }
  }

  if (channel === "ntfy") {
    if (patch.clear === true) {
      next.topic = "";
      next.token = "";
    } else {
      if (Object.hasOwn(patch, "topic") && optionalString(patch.topic)) {
        next.topic = normalizeNtfyTopic(patch.topic);
      }
      if (Object.hasOwn(patch, "token") && optionalString(patch.token)) {
        next.token = normalizeNtfyToken(patch.token);
      }
    }
  }

  if (channel === "telegram") {
    if (patch.clear === true) {
      next.botToken = "";
      next.chatId = "";
    } else {
      if (
        Object.hasOwn(patch, "botToken") &&
        optionalString(patch.botToken)
      ) {
        next.botToken = normalizeTelegramBotToken(patch.botToken);
      }
      if (Object.hasOwn(patch, "chatId") && optionalString(patch.chatId)) {
        next.chatId = normalizeTelegramChatId(patch.chatId);
      }
    }
  }

  if (channel === "wecom") {
    if (patch.clear === true) {
      next.key = "";
    } else if (Object.hasOwn(patch, "key") && optionalString(patch.key)) {
      next.key = normalizeWeComKey(patch.key);
    }
  }

  if (channel === "wecomApp") {
    if (patch.clear === true) {
      next.corpId = "";
      next.secret = "";
      next.agentId = "";
      next.toUser = "";
    } else {
      if (Object.hasOwn(patch, "corpId") && optionalString(patch.corpId)) {
        next.corpId = normalizeWeComAppCorpId(patch.corpId);
      }
      if (Object.hasOwn(patch, "secret") && optionalString(patch.secret)) {
        next.secret = normalizeWeComAppSecret(patch.secret);
      }
      if (Object.hasOwn(patch, "agentId") && optionalString(patch.agentId)) {
        next.agentId = normalizeWeComAppAgentId(patch.agentId);
      }
      if (Object.hasOwn(patch, "toUser") && optionalString(patch.toUser)) {
        next.toUser = normalizeWeComAppToUser(patch.toUser);
      }
    }
  }

  if (channel === "dingtalk") {
    if (patch.clear === true) {
      next.accessToken = "";
      next.secret = "";
    } else {
      if (
        Object.hasOwn(patch, "accessToken") &&
        optionalString(patch.accessToken)
      ) {
        next.accessToken = normalizeDingTalkAccessToken(patch.accessToken);
      }
      if (Object.hasOwn(patch, "secret") && optionalString(patch.secret)) {
        next.secret = normalizeDingTalkSecret(patch.secret);
      }
    }
  }

  if (next.enabled && !isNotificationChannelConfigured(channel, next)) {
    const message =
      channel === "bark"
        ? "启用 Bark 前请先填写 key。"
        : channel === "ntfy"
          ? "启用 ntfy 前请先填写 topic。"
          : channel === "telegram"
            ? "启用 Telegram 前请先填写 Bot token 和 chat ID。"
            : channel === "wecom"
              ? "启用企业微信前请先填写机器人 key。"
              : channel === "wecomApp"
                ? "启用企业微信应用前请先填写企业 ID、Secret、AgentId 和接收成员。"
                : "启用钉钉前请先填写机器人 access token。";
    throw new NotificationError(
      message,
      "INCOMPLETE_NOTIFICATION_SETTINGS",
      400,
    );
  }

  return next;
}

export function applyProxySettingsPatch(current, patch) {
  if (!isPlainObject(patch)) {
    throw new NotificationError(
      "通知代理设置格式不正确。",
      "INVALID_NOTIFICATION_PROXY",
      400,
    );
  }

  const next = normalizeProxySettings(current);
  if (patch.clear === true) {
    return {
      enabled: false,
      url: "",
      channels: normalizeProxyChannels(),
    };
  }

  if (Object.hasOwn(patch, "enabled")) {
    if (typeof patch.enabled !== "boolean") {
      throw new NotificationError(
        "通知代理的启用状态不正确。",
        "INVALID_NOTIFICATION_PROXY",
        400,
      );
    }
    next.enabled = patch.enabled;
  }

  if (Object.hasOwn(patch, "url") && optionalString(patch.url)) {
    next.url = normalizeProxyUrl(patch.url);
  }

  if (Object.hasOwn(patch, "channels")) {
    if (!isPlainObject(patch.channels)) {
      throw new NotificationError(
        "通知代理的渠道选择格式不正确。",
        "INVALID_NOTIFICATION_PROXY",
        400,
      );
    }
    for (const [channel, enabled] of Object.entries(patch.channels)) {
      if (!NOTIFICATION_CHANNELS.includes(channel)) {
        throw new NotificationError(
          "通知代理包含不支持的渠道。",
          "INVALID_NOTIFICATION_PROXY",
          400,
        );
      }
      if (typeof enabled !== "boolean") {
        throw new NotificationError(
          "通知代理的渠道启用状态不正确。",
          "INVALID_NOTIFICATION_PROXY",
          400,
        );
      }
      next.channels[channel] = enabled;
    }
  }

  if (next.enabled && !next.url) {
    throw new NotificationError(
      "启用通知代理前请填写代理地址。",
      "INVALID_NOTIFICATION_PROXY",
      400,
    );
  }
  if (next.enabled && !Object.values(next.channels).some(Boolean)) {
    throw new NotificationError(
      "启用通知代理前请至少选择一个通知渠道。",
      "INCOMPLETE_NOTIFICATION_PROXY",
      400,
    );
  }

  return next;
}

export function applyNotificationSettingsPatch(current, patch) {
  if (!isPlainObject(patch)) {
    throw new NotificationError(
      "通知设置格式不正确。",
      "INVALID_NOTIFICATION_SETTINGS",
      400,
    );
  }

  const normalized = normalizeNotificationSettings(current);
  const next = normalizeNotificationSettings(normalized);
  for (const channel of NOTIFICATION_CHANNELS) {
    if (!Object.hasOwn(patch, channel)) {
      continue;
    }
    next[channel] = applyChannelPatch(
      next[channel],
      patch[channel],
      channel,
    );
  }
  if (Object.hasOwn(patch, "proxy")) {
    next.proxy = applyProxySettingsPatch(next.proxy, patch.proxy);
  }
  return next;
}

export function buildNtfyRequest(config, message) {
  const topic = normalizeNtfyTopic(config?.topic);
  const token = normalizeNtfyToken(config?.token);
  const endpoint = new URL(`/${encodeURIComponent(topic)}`, NTFY_API_ORIGIN);
  if (endpoint.origin !== NTFY_API_ORIGIN) {
    throw new NotificationError(
      "ntfy 请求地址无效。",
      "INVALID_NTFY_ENDPOINT",
      400,
    );
  }

  return {
    endpoint: endpoint.href,
    body: `${truncate(message?.title, MAX_TITLE_LENGTH)}\n\n${truncate(
      message?.body,
      MAX_BODY_LENGTH,
    )}`,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      accept: "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
}

export async function sendNtfyNotification(
  config,
  message,
  { fetchImpl = globalThis.fetch, timeoutMs = NOTIFICATION_TIMEOUT_MS } = {},
) {
  const request = buildNtfyRequest(config, message);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(request.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: request.headers,
      body: request.body,
    });
    if (!response.ok) {
      throw new NotificationError(
        `ntfy 返回 HTTP ${response.status}，请检查 topic 和 access token。`,
        "NTFY_HTTP_ERROR",
      );
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof NotificationError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new NotificationError("ntfy 请求超时。", "NTFY_TIMEOUT", 504);
    }
    throw new NotificationError(
      "无法连接 ntfy，请检查网络。",
      "NTFY_REQUEST_FAILED",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function buildTelegramRequest(config, message) {
  const token = normalizeTelegramBotToken(config?.botToken);
  const chatId = normalizeTelegramChatId(config?.chatId);
  const endpoint = new URL(
    `/bot${encodeURIComponent(token)}/sendMessage`,
    TELEGRAM_API_ORIGIN,
  );
  if (endpoint.origin !== TELEGRAM_API_ORIGIN) {
    throw new NotificationError(
      "Telegram 请求地址无效。",
      "INVALID_TELEGRAM_ENDPOINT",
      400,
    );
  }

  return {
    endpoint: endpoint.href,
    payload: {
      chat_id: chatId,
      text: `${truncate(message?.title, MAX_TITLE_LENGTH)}\n\n${truncate(
        message?.body,
        MAX_BODY_LENGTH,
      )}`,
      disable_web_page_preview: true,
    },
  };
}

export async function sendTelegramNotification(
  config,
  message,
  { fetchImpl = globalThis.fetch, timeoutMs = NOTIFICATION_TIMEOUT_MS } = {},
) {
  const request = buildTelegramRequest(config, message);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(request.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify(request.payload),
    });
    let result = null;
    try {
      result = await response.json();
    } catch {
      // The HTTP status remains authoritative for non-JSON proxy responses.
    }
    if (!response.ok || result?.ok === false) {
      const description = truncate(result?.description || "", 160);
      throw new NotificationError(
        description
          ? `Telegram 返回错误：${description}`
          : `Telegram 返回 HTTP ${response.status}，请检查 Bot token 和 chat ID。`,
        "TELEGRAM_HTTP_ERROR",
      );
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof NotificationError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new NotificationError(
        "Telegram 请求超时。",
        "TELEGRAM_TIMEOUT",
        504,
      );
    }
    throw new NotificationError(
      "无法连接 Telegram，请检查网络。",
      "TELEGRAM_REQUEST_FAILED",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function webhookMessageText(message, maxBytes = MAX_WECOM_TEXT_BYTES) {
  const title = truncate(message?.title, MAX_TITLE_LENGTH);
  const body = truncate(message?.body, MAX_BODY_LENGTH);
  return truncateUtf8(
    `${WEBHOOK_MESSAGE_PREFIX}\n${title}\n\n${body}`,
    maxBytes,
  );
}

function notificationErrorDetail(value, sensitiveValues = []) {
  let detail = String(value || "");
  for (const sensitiveValue of sensitiveValues) {
    const text = String(sensitiveValue || "");
    if (text) {
      detail = detail.split(text).join("***");
    }
  }
  detail = detail
    .replace(/corpsecret=[^&\s]+/gi, "corpsecret=***")
    .replace(/access_token=[^&\s]+/gi, "access_token=***");
  return truncate(detail, 160);
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function buildWeComRequest(config, message) {
  const key = normalizeWeComKey(config?.key);
  const endpoint = new URL("/cgi-bin/webhook/send", WECOM_API_ORIGIN);
  endpoint.searchParams.set("key", key);
  if (endpoint.origin !== WECOM_API_ORIGIN) {
    throw new NotificationError(
      "企业微信请求地址无效。",
      "INVALID_WECOM_ENDPOINT",
      400,
    );
  }

  return {
    endpoint: endpoint.href,
    payload: {
      msgtype: "text",
      text: {
        content: webhookMessageText(message),
      },
    },
  };
}

export function buildWeComAppTokenRequest(config) {
  const corpId = normalizeWeComAppCorpId(config?.corpId);
  const secret = normalizeWeComAppSecret(config?.secret);
  const endpoint = new URL("/cgi-bin/gettoken", WECOM_API_ORIGIN);
  endpoint.searchParams.set("corpid", corpId);
  endpoint.searchParams.set("corpsecret", secret);
  if (endpoint.origin !== WECOM_API_ORIGIN) {
    throw new NotificationError(
      "企业微信应用授权地址无效。",
      "INVALID_WECOM_APP_ENDPOINT",
      400,
    );
  }
  return { endpoint: endpoint.href };
}

export function buildWeComAppRequest(config, message, accessToken) {
  const agentId = normalizeWeComAppAgentId(config?.agentId);
  const toUser = normalizeWeComAppToUser(config?.toUser);
  const token = normalizeWeComAppAccessToken(accessToken);
  const endpoint = new URL("/cgi-bin/message/send", WECOM_API_ORIGIN);
  endpoint.searchParams.set("access_token", token);
  if (endpoint.origin !== WECOM_API_ORIGIN) {
    throw new NotificationError(
      "企业微信应用消息地址无效。",
      "INVALID_WECOM_APP_ENDPOINT",
      400,
    );
  }

  return {
    endpoint: endpoint.href,
    payload: {
      touser: toUser,
      msgtype: "text",
      agentid: Number(agentId),
      text: {
        content: webhookMessageText(message),
      },
      safe: 0,
    },
  };
}

export function buildDingTalkRequest(
  config,
  message,
  { timestamp = Date.now() } = {},
) {
  const accessToken = normalizeDingTalkAccessToken(config?.accessToken);
  const secret = normalizeDingTalkSecret(config?.secret);
  const endpoint = new URL("/robot/send", DINGTALK_API_ORIGIN);
  endpoint.searchParams.set("access_token", accessToken);

  if (secret) {
    const timestampText = String(timestamp);
    const sign = createHmac("sha256", secret)
      .update(`${timestampText}\n${secret}`)
      .digest("base64");
    endpoint.searchParams.set("timestamp", timestampText);
    endpoint.searchParams.set("sign", sign);
  }

  if (endpoint.origin !== DINGTALK_API_ORIGIN) {
    throw new NotificationError(
      "钉钉请求地址无效。",
      "INVALID_DINGTALK_ENDPOINT",
      400,
    );
  }

  return {
    endpoint: endpoint.href,
    payload: {
      msgtype: "text",
      text: {
        content: webhookMessageText(message),
      },
    },
  };
}

async function sendRobotNotification(
  request,
  {
    fetchImpl,
    timeoutMs,
    label,
    httpErrorCode,
    timeoutCode,
    requestFailedCode,
  },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(request.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify(request.payload),
    });
    let result = null;
    try {
      result = await response.json();
    } catch {
      // Some gateways return a non-JSON body for HTTP failures.
    }
    if (!response.ok || result?.errcode !== 0) {
      const detail = truncate(result?.errmsg || "", 160);
      const fallback = response.ok
        ? `${label} 返回了无法识别的响应。`
        : `${label} 返回 HTTP ${response.status}，请检查机器人配置。`;
      throw new NotificationError(
        detail ? `${label} 返回错误：${detail}` : fallback,
        httpErrorCode,
      );
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof NotificationError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new NotificationError(`${label} 请求超时。`, timeoutCode, 504);
    }
    throw new NotificationError(
      `无法连接${label}，请检查网络。`,
      requestFailedCode,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function sendWeComNotification(
  config,
  message,
  { fetchImpl = globalThis.fetch, timeoutMs = NOTIFICATION_TIMEOUT_MS } = {},
) {
  const request = buildWeComRequest(config, message);
  return sendRobotNotification(request, {
    fetchImpl,
    timeoutMs,
    label: "企业微信",
    httpErrorCode: "WECOM_HTTP_ERROR",
    timeoutCode: "WECOM_TIMEOUT",
    requestFailedCode: "WECOM_REQUEST_FAILED",
  });
}

export async function sendWeComAppNotification(
  config,
  message,
  { fetchImpl = globalThis.fetch, timeoutMs = NOTIFICATION_TIMEOUT_MS } = {},
) {
  const tokenRequest = buildWeComAppTokenRequest(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let accessToken = "";

  try {
    const tokenResponse = await fetchImpl(tokenRequest.endpoint, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });
    const tokenResult = await readJsonResponse(tokenResponse);
    if (!tokenResponse.ok || tokenResult?.errcode !== 0) {
      const detail = notificationErrorDetail(tokenResult?.errmsg, [
        config?.corpId,
        config?.secret,
      ]);
      throw new NotificationError(
        detail
          ? `企业微信应用授权失败：${detail}`
          : `企业微信应用授权返回 HTTP ${tokenResponse.status}，请检查企业 ID 和 Secret。`,
        "WECOM_APP_TOKEN_HTTP_ERROR",
      );
    }
    accessToken = normalizeWeComAppAccessToken(tokenResult?.access_token);

    const request = buildWeComAppRequest(config, message, accessToken);
    const response = await fetchImpl(request.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify(request.payload),
    });
    const result = await readJsonResponse(response);
    if (!response.ok || result?.errcode !== 0) {
      const detail = notificationErrorDetail(result?.errmsg, [
        config?.corpId,
        config?.secret,
        accessToken,
      ]);
      throw new NotificationError(
        detail
          ? `企业微信应用返回错误：${detail}`
          : `企业微信应用返回 HTTP ${response.status}，请检查 AgentId 和接收成员。`,
        "WECOM_APP_HTTP_ERROR",
      );
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof NotificationError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new NotificationError(
        "企业微信应用请求超时。",
        "WECOM_APP_TIMEOUT",
        504,
      );
    }
    throw new NotificationError(
      "无法连接企业微信应用，请检查网络或代理。",
      "WECOM_APP_REQUEST_FAILED",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function sendDingTalkNotification(
  config,
  message,
  { fetchImpl = globalThis.fetch, timeoutMs = NOTIFICATION_TIMEOUT_MS } = {},
) {
  const request = buildDingTalkRequest(config, message);
  return sendRobotNotification(request, {
    fetchImpl,
    timeoutMs,
    label: "钉钉",
    httpErrorCode: "DINGTALK_HTTP_ERROR",
    timeoutCode: "DINGTALK_TIMEOUT",
    requestFailedCode: "DINGTALK_REQUEST_FAILED",
  });
}

function sendToChannel(
  channel,
  config,
  message,
  { fetchImpl, timeoutMs },
) {
  if (channel === "bark") {
    return sendBarkNotification(config.key, message, {
      fetchImpl,
      timeoutMs,
    });
  }
  if (channel === "ntfy") {
    return sendNtfyNotification(config, message, {
      fetchImpl,
      timeoutMs,
    });
  }
  if (channel === "telegram") {
    return sendTelegramNotification(config, message, {
      fetchImpl,
      timeoutMs,
    });
  }
  if (channel === "wecom") {
    return sendWeComNotification(config, message, {
      fetchImpl,
      timeoutMs,
    });
  }
  if (channel === "wecomApp") {
    return sendWeComAppNotification(config, message, {
      fetchImpl,
      timeoutMs,
    });
  }
  if (channel === "dingtalk") {
    return sendDingTalkNotification(config, message, {
      fetchImpl,
      timeoutMs,
    });
  }
  return Promise.reject(
    new NotificationError("未知通知渠道。", "UNKNOWN_NOTIFICATION_CHANNEL"),
  );
}

export async function sendNotificationChannels(
  settings,
  message,
  {
    fetchImpl = undiciFetch,
    timeoutMs = NOTIFICATION_TIMEOUT_MS,
    createProxyDispatcher = (url) => new ProxyAgent(url),
  } = {},
) {
  const normalized = normalizeNotificationSettings(settings);
  const channels = NOTIFICATION_CHANNELS.filter(
    (channel) => normalized[channel].enabled,
  );
  if (!channels.length) {
    throw new NotificationError(
      "还没有启用任何通知渠道。",
      "NO_NOTIFICATION_CHANNEL",
      400,
    );
  }

  const proxiedChannels = new Set(
    channels.filter(
      (channel) =>
        normalized.proxy.enabled && normalized.proxy.channels[channel],
    ),
  );
  let proxyDispatcher = null;
  if (proxiedChannels.size > 0) {
    try {
      proxyDispatcher = createProxyDispatcher(normalized.proxy.url);
    } catch {
      throw new NotificationError(
        "无法初始化通知代理，请检查代理地址和代理服务。",
        "NOTIFICATION_PROXY_FAILED",
        502,
      );
    }
  }

  try {
    const results = await Promise.all(
      channels.map(async (channel) => {
        const config = normalized[channel];
        if (!isNotificationChannelConfigured(channel, config)) {
          return {
            channel,
            label: CHANNEL_LABELS[channel],
            ok: false,
            error: "配置不完整。",
          };
        }
        try {
          const channelFetch =
            proxyDispatcher && proxiedChannels.has(channel)
              ? (url, options = {}) =>
                  fetchImpl(url, {
                    ...options,
                    dispatcher: proxyDispatcher,
                  })
              : fetchImpl;
          await sendToChannel(channel, config, message, {
            fetchImpl: channelFetch,
            timeoutMs,
          });
          return {
            channel,
            label: CHANNEL_LABELS[channel],
            ok: true,
            error: null,
          };
        } catch (error) {
          return {
            channel,
            label: CHANNEL_LABELS[channel],
            ok: false,
            error: truncate(error?.message, 240) || "通知发送失败。",
          };
        }
      }),
    );

    const delivered = results.filter((result) => result.ok).length;
    const failed = results.length - delivered;
    return {
      ok: failed === 0,
      total: results.length,
      delivered,
      failed,
      results,
    };
  } finally {
    if (proxyDispatcher?.close) {
      try {
        await proxyDispatcher.close();
      } catch {
        // Notification delivery results should not be hidden by cleanup errors.
      }
    }
  }
}

export function summarizeNotificationDelivery(
  result,
  { subject = "测试通知" } = {},
) {
  if (!result?.results?.length) {
    return `${subject}已发送。`;
  }
  const successful = result.results
    .filter((item) => item.ok)
    .map((item) => item.label);
  const failed = result.results
    .filter((item) => !item.ok)
    .map((item) => `${item.label}：${item.error}`);

  if (!failed.length) {
    return `${subject}已发送至 ${successful.join("、")}。`;
  }
  if (successful.length) {
    return `${subject}已送达 ${successful.join("、")}；失败：${failed.join(
      "；",
    )}。`;
  }
  return `${subject}发送失败：${failed.join("；")}。`;
}

export const __test = {
  MAX_BODY_LENGTH,
  MAX_WECOM_TEXT_BYTES,
  MAX_NTFY_TOPIC_LENGTH,
  MAX_TELEGRAM_CHAT_ID_LENGTH,
  MAX_TITLE_LENGTH,
  maskSecret,
  truncateUtf8,
};
