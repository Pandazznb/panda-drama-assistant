import crypto from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  accountDevicePairs,
  accountUserAgent,
  appRequestUrl,
  buildRegisterBody,
  buildRegisterIdentity,
  parseRegisterResponse,
  preserveLargeIntegerFields,
  signAppGet,
  signAppPost,
  userAgent,
} from "./hongguo-sign.js";
import {
  performUpstreamFetch,
  retryAfterMilliseconds,
} from "./request-scheduler.js";
import { normalizeWhitespace } from "./utils.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(ROOT_DIR, "..", "data");
const PASSPORT_ORIGIN = "https://hongguoduanju.com";
const PASSPORT_HOST = "hongguoduanju.com";
const APP_PASSPORT_ORIGIN = "https://is.snssdk.com";
const APP_PASSPORT_HOST = "is.snssdk.com";
const ACCOUNT_API_ORIGIN = "https://api5-normal-sinfonlinea.fqnovel.com";
const ACCOUNT_API_HOST = "api5-normal-sinfonlinea.fqnovel.com";
const REGISTER_ORIGIN = "https://log5-applog-lf.fqnovel.com";
const REGISTER_HOST = "log5-applog-lf.fqnovel.com";
const ACCOUNT_VERSION_NAME = "7.2.2.32";
const ACCOUNT_VERSION_CODE = "72232";
const ACCOUNT_WRITE_VERSION_NAME = "7.3.9.32";
const ACCOUNT_WRITE_VERSION_CODE = "73932";
const ACCOUNT_AID = "8662";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_SESSION_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LOGIN_LIFETIME_MS = 180_000;
const LOGIN_RESULT_RETENTION_MS = 10 * 60_000;
const MAX_LOGIN_SESSIONS = 4;
const SMS_LOGIN_LIFETIME_MS = 5 * 60_000;
const SMS_CODE_RETRY_DEFAULT_SECONDS = 60;
const SMS_CODE_RETRY_MAX_SECONDS = 300;
const MAX_SMS_CODE_ATTEMPTS = 5;
const MAX_SMS_LOGIN_SESSIONS = 4;
const MAX_REDIRECTS = 5;
const ACCOUNT_PAGE_SIZE = 50;
const ACCOUNT_MAX_PAGES = 20;
const SMS_LOGIN_CODE_TYPE = "24";
const SMS_SEND_CODE_PATH = "/passport/mobile/send_code/v1/";
const SMS_LOGIN_VERIFY_PATH = "/passport/mobile/sms_login/";
const SMS_MFA_VERIFY_PATH = "/passport/upsms/verify/";
const SMS_LOGIN_MAX_MFA_ROUNDS = 3;
const SMS_MFA_FIELDS = Object.freeze([
  "encrypt_uid",
  "encrypted_uid",
  "sms_code_key",
  "ms_code_key",
  "passport_mfa_retry_tag",
  "upsms_verify",
  "verify_scene",
  "verify_ticket",
  "verify_reason",
  "copywriting_key",
  "ies_safety_diversion_tag",
  "new_verify_flow",
  "new_authn_sdk_version",
  "new_authn_sdk_verify_scene",
  "new_authn_sdk_verify_reason",
  "new_authn_sdk_log_id",
  "request_tag_from",
  "passport_scene",
  "verify_ways",
  "biz_params",
  "event_params",
  "log_id",
  "mobile_ticket",
]);
const VAULT_MAGIC = Buffer.from("PDA1");
const VAULT_AAD = Buffer.from("panda-drama-assistant:account:v1");
const DEFAULT_PASSPORT_HEADERS = Object.freeze({
  accept: "application/json, text/javascript",
  "accept-language": "zh-CN,zh;q=0.9",
  origin: PASSPORT_ORIGIN,
  referer: `${PASSPORT_ORIGIN}/`,
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
});
const PASSPORT_COMMON_PARAMS = Object.freeze({
  aid: "513755",
  passport_jssdk_version: "3.4.10",
  passport_jssdk_type: "normal",
  account_sdk_source: "web",
  is_from_ttaccountsdk: "1",
  language: "zh",
  next: `${PASSPORT_ORIGIN}/`,
});
const LARGE_INTEGER_FIELDS = Object.freeze([
  "biz_user_id",
  "book_id",
  "series_id",
  "vid",
  "item_id",
  "collect_time",
  "last_watch_time",
  "schedule_publish_time",
]);

export class AccountError extends Error {
  constructor(message, code = "ACCOUNT_ERROR", statusCode = 502) {
    super(message);
    this.name = "AccountError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function accountError(message, code, statusCode = 502) {
  return new AccountError(message, code, statusCode);
}

function assertOfficialUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw accountError("官方地址格式异常。", "INVALID_UPSTREAM_URL");
  }
  const hosts = Array.isArray(allowedHosts) ? allowedHosts : [allowedHosts];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !hosts.includes(url.hostname.toLowerCase())
  ) {
    throw accountError(
      "账号请求跳转到了不受支持的地址。",
      "UNSAFE_UPSTREAM_REDIRECT",
    );
  }
  return url;
}

async function readLimitedResponse(response, maxBytes) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw accountError(
      "红果账号接口返回内容过大。",
      "ACCOUNT_RESPONSE_TOO_LARGE",
    );
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw accountError(
          "红果账号接口返回内容过大。",
          "ACCOUNT_RESPONSE_TOO_LARGE",
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function limitedRequest(
  fetchImpl,
  target,
  {
    allowedHosts,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
    requestScheduler = null,
    label = "红果账号接口",
    ...options
  } = {},
) {
  const url = assertOfficialUrl(target, allowedHosts);
  let result;
  try {
    result = await performUpstreamFetch(
      fetchImpl,
      url,
      {
        redirect: "manual",
        cache: "no-store",
        credentials: "omit",
        ...options,
      },
      {
        scheduler: requestScheduler,
        timeoutMs,
        label,
        readBody: (response) =>
          readLimitedResponse(response, maxBytes),
      },
    );
  } catch (error) {
    if (error?.upstreamBodyRead) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw accountError(
        "请求红果账号服务超时，请稍后重试。",
        "ACCOUNT_REQUEST_TIMEOUT",
        504,
      );
    }
    throw accountError(
      "暂时无法连接红果账号服务。",
      "ACCOUNT_REQUEST_FAILED",
    );
  }

  return {
    response: result.response,
    body: result.body,
    text: result.body.toString("utf8"),
    url,
  };
}

function accountHttpError(response, message, code) {
  const rateLimited = response.status === 429;
  const error = accountError(
    message,
    rateLimited ? "ACCOUNT_RATE_LIMITED" : code,
    rateLimited ? 429 : 502,
  );
  const retryAfterMs = retryAfterMilliseconds(response);
  if (rateLimited && retryAfterMs !== null) {
    error.retryAfterSeconds = Math.max(
      1,
      Math.ceil(retryAfterMs / 1_000),
    );
  }
  return error;
}

function setCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? [combined] : [];
}

function validCookieName(value) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(String(value || ""));
}

function defaultCookiePath(pathname) {
  if (!pathname || !pathname.startsWith("/")) {
    return "/";
  }
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function cookiePathMatches(requestPath, cookiePath) {
  if (requestPath === cookiePath) {
    return true;
  }
  if (!requestPath.startsWith(cookiePath)) {
    return false;
  }
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

export class AccountCookieJar {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.cookies = new Map();
  }

  setCookie(header, requestUrl) {
    const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
    const segments = String(header || "").split(";");
    const pair = segments.shift()?.trim() || "";
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      return;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!validCookieName(name) || value.length > 4096) {
      return;
    }

    let domain = "";
    let hostOnly = true;
    let cookiePath = defaultCookiePath(url.pathname);
    let expiresAt = Number.MAX_SAFE_INTEGER;
    let secure = false;
    for (const segment of segments) {
      const attribute = segment.trim();
      const attributeSeparator = attribute.indexOf("=");
      const attributeName =
        attributeSeparator < 0
          ? attribute.toLowerCase()
          : attribute.slice(0, attributeSeparator).trim().toLowerCase();
      const attributeValue =
        attributeSeparator < 0
          ? ""
          : attribute.slice(attributeSeparator + 1).trim();
      if (attributeName === "domain" && attributeValue) {
        domain = attributeValue.replace(/^\./, "").toLowerCase();
        hostOnly = false;
      } else if (
        attributeName === "path" &&
        attributeValue.startsWith("/")
      ) {
        cookiePath = attributeValue;
      } else if (attributeName === "secure") {
        secure = true;
      } else if (attributeName === "max-age") {
        const seconds = Number(attributeValue);
        if (Number.isFinite(seconds)) {
          expiresAt =
            seconds <= 0
              ? 0
              : this.now() + Math.floor(seconds * 1000);
        }
      } else if (attributeName === "expires" && expiresAt === Number.MAX_SAFE_INTEGER) {
        const timestamp = Date.parse(attributeValue);
        if (Number.isFinite(timestamp)) {
          expiresAt = timestamp;
        }
      }
    }

    const host = url.hostname.toLowerCase();
    if (
      !hostOnly &&
      (!domain ||
        (host !== domain && !host.endsWith(`.${domain}`)))
    ) {
      return;
    }

    const key = `${hostOnly ? "host" : "domain"}:${domain || host}:${cookiePath}:${name}`;
    if (expiresAt <= this.now() || value === "") {
      this.cookies.delete(key);
      return;
    }
    this.cookies.set(key, {
      name,
      value,
      domain: domain || host,
      hostOnly,
      path: cookiePath,
      secure,
      expiresAt,
    });
  }

  addResponseCookies(response, requestUrl) {
    for (const header of setCookieHeaders(response)) {
      this.setCookie(header, requestUrl);
    }
  }

  matchingCookies(target) {
    const url = target instanceof URL ? target : new URL(target);
    const host = url.hostname.toLowerCase();
    const requestPath = url.pathname || "/";
    return [...this.cookies.values()]
      .filter((cookie) => cookie.expiresAt > this.now())
      .filter(
        (cookie) =>
          (cookie.hostOnly
            ? host === cookie.domain
            : host === cookie.domain || host.endsWith(`.${cookie.domain}`)) &&
          cookiePathMatches(requestPath, cookie.path) &&
          (!cookie.secure || url.protocol === "https:"),
      )
      .sort((left, right) => right.path.length - left.path.length);
  }

  headerFor(target) {
    return this.matchingCookies(target)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }

  get(target, name) {
    return this.matchingCookies(target).find(
      (cookie) => cookie.name === name,
    )?.value || "";
  }
}

export function mergeCookieHeaders(...values) {
  const pairs = new Map();
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const [name, cookieValue] of value) {
        if (validCookieName(name) && String(cookieValue || "")) {
          pairs.set(name, String(cookieValue));
        }
      }
      continue;
    }
    for (const segment of String(value || "").split(";")) {
      const pair = segment.trim();
      const separator = pair.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (validCookieName(name) && cookieValue) {
        pairs.set(name, cookieValue);
      }
    }
  }
  return [...pairs].map(([name, value]) => `${name}=${value}`).join("; ");
}

function parseJsonText(text, fields = LARGE_INTEGER_FIELDS) {
  try {
    return JSON.parse(preserveLargeIntegerFields(text, fields));
  } catch {
    throw accountError(
      "红果账号数据格式异常，请稍后重试。",
      "ACCOUNT_DATA_INVALID",
    );
  }
}

function passportUrl(pathname, extraParams = {}) {
  const url = new URL(pathname, PASSPORT_ORIGIN);
  for (const [name, value] of Object.entries({
    ...PASSPORT_COMMON_PARAMS,
    ...extraParams,
  })) {
    url.searchParams.set(name, String(value));
  }
  return url.href;
}

function passportData(payload) {
  const data = payload?.data;
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    (payload?.message && payload.message !== "success")
  ) {
    const description = normalizeWhitespace(
      data?.description || payload?.message || "",
    ).slice(0, 120);
    const error = accountError(
      description
        ? `红果登录服务返回异常：${description}`
        : "红果登录服务返回格式异常。",
      "ACCOUNT_LOGIN_UPSTREAM_ERROR",
    );
    error.upstreamData = data;
    throw error;
  }
  return data;
}

function appPassportUrl(pathname, query) {
  const url = new URL(pathname, APP_PASSPORT_ORIGIN);
  url.search = query;
  return url.href;
}

function objectRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function meaningfulValue(value) {
  if (value === null || value === undefined || value === false || value === 0) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function nestedFieldPresent(value, fields, depth = 0, seen = new WeakSet()) {
  if (depth > 5 || !value) {
    return false;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) {
      return false;
    }
    try {
      return nestedFieldPresent(JSON.parse(text), fields, depth + 1, seen);
    } catch {
      return false;
    }
  }
  if (typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) =>
      nestedFieldPresent(item, fields, depth + 1, seen),
    );
  }
  for (const [name, fieldValue] of Object.entries(value)) {
    if (fields.has(name) && meaningfulValue(fieldValue)) {
      return true;
    }
    if (nestedFieldPresent(fieldValue, fields, depth + 1, seen)) {
      return true;
    }
  }
  return false;
}

function serializedPassportField(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function collectPassportRecords(value, depth = 0, seen = new WeakSet()) {
  if (depth > 5 || value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.startsWith("{") && !text.startsWith("[")) {
      return [];
    }
    try {
      return collectPassportRecords(JSON.parse(text), depth + 1, seen);
    } catch {
      return [];
    }
  }
  if (typeof value !== "object") {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectPassportRecords(item, depth + 1, seen),
    );
  }
  return [
    value,
    ...Object.values(value).flatMap((item) =>
      collectPassportRecords(item, depth + 1, seen),
    ),
  ];
}

function parseSmsMfa(payload) {
  const fields = new Set(SMS_MFA_FIELDS);
  const markers = new Set([
    "encrypt_uid",
    "sms_code_key",
    "ms_code_key",
    "passport_mfa_retry_tag",
    "upsms_verify",
    "verify_ticket",
    "copywriting_key",
    "ies_safety_diversion_tag",
    "new_authn_sdk_log_id",
    "new_authn_sdk_verify_scene",
    "new_authn_sdk_verify_reason",
  ]);
  const result = {};
  let challenged = false;
  for (const record of collectPassportRecords(payload)) {
    for (const [name, value] of Object.entries(record)) {
      if (!fields.has(name)) {
        continue;
      }
      const normalizedName = name === "encrypted_uid" ? "encrypt_uid" : name;
      if (markers.has(name) && meaningfulValue(value)) {
        challenged = true;
      }
      if (
        result[normalizedName] === undefined &&
        (meaningfulValue(value) ||
          (name === "new_verify_flow" && value === ""))
      ) {
        result[normalizedName] = serializedPassportField(value);
      }
    }
  }
  return challenged ? result : null;
}

function smsSecurityChallengeRequired(payload) {
  return (
    nestedFieldPresent(
      payload,
      new Set([
        "verify_center_decision_conf",
        "captcha",
        "verify_ways",
      ]),
    ) ||
    /滑块|人机验证|安全验证|captcha|verify_center/i.test(
      String(payload?.message || ""),
    )
  );
}

function smsMfaRequired(payload) {
  return Boolean(
    parseSmsMfa(payload) ||
      /passport_mfa|upsms|mfa/i.test(String(payload?.message || "")),
  );
}

function appPassportFailure(payload, fallbackMessage) {
  const data = objectRecord(payload?.data) || {};
  const errorCode = Number(
    data.error_code ??
      data.status_code ??
      payload?.error_code ??
      payload?.status_code ??
      payload?.code ??
      0,
  );
  const mfaRequired = smsMfaRequired(payload);
  const securityChallenge = smsSecurityChallengeRequired(payload);
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !objectRecord(payload.data) ||
    (payload.message && payload.message !== "success") ||
    (Number.isFinite(errorCode) && errorCode !== 0) ||
    (securityChallenge && !mfaRequired)
  ) {
    const description = normalizeWhitespace(
      data.description ||
        data.message ||
        payload?.description ||
        payload?.message ||
        "",
    ).slice(0, 120);
    const error = accountError(
      description
        ? `红果登录服务返回异常：${description}`
        : fallbackMessage,
      "ACCOUNT_LOGIN_UPSTREAM_ERROR",
    );
    error.upstreamErrorCode = Number.isFinite(errorCode) ? errorCode : 0;
    error.upstreamMfaRequired = mfaRequired;
    error.upstreamSecurityChallenge = securityChallenge;
    return error;
  }
  return null;
}

export function mixPassportValue(value) {
  return Buffer.from(String(value ?? ""), "utf8")
    .toString("hex")
    .match(/../g)
    ?.map((byte) => (Number.parseInt(byte, 16) ^ 5).toString(16).padStart(2, "0"))
    .join("") || "";
}

export function normalizeSmsLoginNumber(countryCode, mobile) {
  const code = String(countryCode ?? "")
    .trim()
    .replace(/^\+/, "")
    .replace(/\s/g, "");
  let number = String(mobile ?? "")
    .trim()
    .replace(/\D/g, "");
  if (!/^[1-9]\d{0,2}$/.test(code)) {
    throw accountError(
      "手机号区号格式不正确。",
      "ACCOUNT_SMS_COUNTRY_CODE_INVALID",
      400,
    );
  }
  if (code === "86" && !/^1\d{10}$/.test(number)) {
    throw accountError(
      "中国大陆手机号应为 1 开头的 11 位数字。",
      "ACCOUNT_SMS_MOBILE_INVALID",
      400,
    );
  }
  if (code === "86") {
    return number;
  }
  number = number.replace(/^0+/, "");
  if (
    number.length < 4 ||
    code.length + number.length > 15
  ) {
    throw accountError(
      "手机号格式不正确，请检查后重试。",
      "ACCOUNT_SMS_MOBILE_INVALID",
      400,
    );
  }
  return `+${code} ${number}`;
}

function maskSmsMobile(mobile) {
  const value = String(mobile || "");
  const match = value.match(/^(\+\d+\s+)?(\d+)$/);
  if (!match) {
    return "";
  }
  const digits = match[2];
  const visible = digits.slice(-4);
  return `${match[1] || ""}${"*".repeat(Math.max(3, digits.length - 4))}${visible}`;
}

function smsCodeError(error) {
  if (error?.code !== "ACCOUNT_LOGIN_UPSTREAM_ERROR") {
    return error;
  }
  if (
    error.upstreamMfaRequired ||
    error.upstreamSecurityChallenge ||
    smsSecurityChallengeRequired(error)
  ) {
    return accountError(
      "红果要求完成额外安全验证，请改用扫码登录。",
      "ACCOUNT_SMS_VERIFICATION_REQUIRED",
      409,
    );
  }
  if (Number(error.upstreamErrorCode) === 1) {
    return accountError(
      "本次短信登录会话已失效，请重新获取验证码。",
      "ACCOUNT_SMS_LOGIN_EXPIRED",
      409,
    );
  }
  return accountError(
    error.message || "短信验证码登录失败，请检查验证码后重试。",
    "ACCOUNT_SMS_CODE_INVALID",
    400,
  );
}

function buildSmsMfaVerifyForm(mfa, fallbackMobileTicket = "") {
  const form = {
    encrypt_uid: mfa.encrypt_uid || "",
    sms_code_key: mfa.sms_code_key || mfa.ms_code_key || "",
    verify_ticket: mfa.verify_ticket || "",
    verify_scene: mfa.verify_scene || "sms_login",
    verify_reason: mfa.verify_reason || "ato",
    copywriting_key: mfa.copywriting_key || "sms_login",
    ies_safety_diversion_tag:
      mfa.ies_safety_diversion_tag || "mfa",
    new_verify_flow: mfa.new_verify_flow ?? "",
    new_authn_sdk_version: mfa.new_authn_sdk_version || "1.1.31",
    new_authn_sdk_verify_reason:
      mfa.new_authn_sdk_verify_reason || mfa.verify_reason || "ato",
    new_authn_sdk_verify_scene:
      mfa.new_authn_sdk_verify_scene || mfa.verify_scene || "sms_login",
    request_tag_from: mfa.request_tag_from || "h5",
    new_authn_sdk_log_id:
      mfa.new_authn_sdk_log_id || mfa.log_id || "",
    mobile_ticket: mfa.mobile_ticket || fallbackMobileTicket || "",
    biz_params: mfa.biz_params || "",
  };
  for (const name of [
    "passport_mfa_retry_tag",
    "event_params",
    "log_id",
    "passport_scene",
    "verify_ways",
  ]) {
    if (mfa[name] !== undefined && mfa[name] !== "") {
      form[name] = mfa[name];
    }
  }
  return form;
}

function clearSmsLoginSecrets(session) {
  if (!session) {
    return;
  }
  session.mobile = "";
  session.mobileTicket = "";
  session.registration = null;
  session.jar = null;
}

function stringValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return normalizeWhitespace(String(value));
}

function safeCoverUrl(value) {
  const text = stringValue(value);
  if (!text) {
    return "";
  }
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

function timestampValue(value) {
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value || ""))) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return null;
    }
    const milliseconds = number < 10_000_000_000 ? number * 1000 : number;
    return new Date(milliseconds).toISOString();
  }
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) && timestamp > 0
    ? new Date(timestamp).toISOString()
    : null;
}

function numericSeriesId(value) {
  const id = stringValue(value);
  return /^\d{8,25}$/.test(id) ? id : "";
}

function objectRows(value, message) {
  if (value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw accountError(message, "ACCOUNT_DATA_SHAPE_CHANGED");
  }
  return value.filter(
    (item) => item && typeof item === "object" && !Array.isArray(item),
  );
}

function categoryFromRows(key, rows) {
  return {
    key,
    status: "ok",
    error: null,
    items: rows,
    count: rows.length,
    fetchedAt: null,
  };
}

function publicAccountProfile(profile) {
  if (!profile) {
    return null;
  }
  return {
    name: stringValue(profile.name) || "红果用户",
  };
}

function publicAccountSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }
  return {
    profile: publicAccountProfile(snapshot.profile),
    fetchedAt: snapshot.fetchedAt || null,
    categories: snapshot.categories || {},
  };
}

function categorySchemaLabels(value) {
  let rows = value;
  if (typeof value === "string" && value.trim()) {
    try {
      rows = JSON.parse(value);
    } catch {
      return value.trim();
    }
  }
  if (!Array.isArray(rows)) {
    return stringValue(value);
  }
  return rows
    .map((row) => stringValue(row?.name))
    .filter(Boolean)
    .slice(0, 5)
    .join(" · ");
}

function detailTitle(row) {
  return (
    stringValue(row?.series_title) ||
    stringValue(row?.book_name) ||
    stringValue(row?.title) ||
    stringValue(row?.video_data?.title) ||
    stringValue(row?.video_data?.book_name)
  );
}

function detailCover(row) {
  return safeCoverUrl(
    row?.series_cover_url ||
      row?.cover ||
      row?.cover_url ||
      row?.thumb_url ||
      row?.video_data?.cover ||
      row?.video_data?.cover_url ||
      row?.video_data?.thumb_url,
  );
}

function detailEpisodeCount(row) {
  const video = row?.video_data || row;
  return (
    safeInteger(video?.episode_cnt) ||
    safeInteger(video?.episode_count) ||
    safeInteger(video?.drama_chapter_number) ||
    safeInteger(row?.episode_cnt) ||
    safeInteger(row?.episode_count)
  );
}

export function parseProfilePayload(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw accountError(
      "登录态未通过红果账号验证，请重新登录。",
      "ACCOUNT_NOT_AUTHENTICATED",
      401,
    );
  }
  const id = stringValue(data.biz_user_id);
  if (!id) {
    throw accountError(
      "登录态未通过红果账号验证，请重新登录。",
      "ACCOUNT_NOT_AUTHENTICATED",
      401,
    );
  }
  return {
    id,
    name: stringValue(data.user_name) || "红果用户",
  };
}

export function parseFavoritesPayload(payload) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw accountError(
      "账户收藏数据格式已变化。",
      "ACCOUNT_FAVORITES_INVALID",
    );
  }
  if (!Object.hasOwn(data, "video_shelf_info")) {
    throw accountError(
      "账户收藏列表格式已变化。",
      "ACCOUNT_FAVORITES_INVALID",
    );
  }
  const rows = objectRows(
    data.video_shelf_info,
    "账户收藏列表格式已变化。",
  );
  const items = [];
  for (const row of rows) {
    const video =
      row.video_data &&
      typeof row.video_data === "object" &&
      !Array.isArray(row.video_data)
        ? row.video_data
        : row;
    const seriesId = numericSeriesId(
      video.series_id || row.series_id || row.book_id,
    );
    const title = detailTitle(row);
    if (!seriesId || !title) {
      continue;
    }
    const episodeCount = detailEpisodeCount(row);
    items.push({
      key: `favorite:${seriesId}`,
      source: "favorite",
      seriesId,
      title,
      coverUrl: detailCover(row),
      episodeCount,
      episodeLabel: episodeCount > 0 ? `全 ${episodeCount} 集` : "",
      summary:
        stringValue(row.series_intro) ||
        stringValue(video.video_desc) ||
        stringValue(row.abstract),
      tags:
        categorySchemaLabels(row.category_schema) ||
        stringValue(video.category),
      updatedAt: timestampValue(row.collect_time),
      importable: true,
      note: "",
    });
  }
  if (rows.length > 0 && items.length === 0) {
    throw accountError(
      "账户收藏条目格式已变化。",
      "ACCOUNT_FAVORITES_INVALID",
    );
  }
  const unique = new Map();
  for (const item of items) {
    if (!unique.has(item.seriesId)) {
      unique.set(item.seriesId, item);
    }
  }
  return [...unique.values()].sort(
    (left, right) =>
      (Date.parse(right.updatedAt || "") || 0) -
      (Date.parse(left.updatedAt || "") || 0),
  );
}

export function parseHistoryListPayload(payload) {
  const data = payload?.data;
  const rowsValue =
    data && typeof data === "object" && !Array.isArray(data)
      ? data.video_data
      : undefined;
  if (rowsValue === undefined && payload?.video_data !== undefined) {
    return objectRows(
      payload.video_data,
      "账户观看历史格式已变化。",
    );
  }
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    !Object.hasOwn(data, "video_data")
  ) {
    throw accountError(
      "账户观看历史格式已变化。",
      "ACCOUNT_HISTORY_INVALID",
    );
  }
  return objectRows(rowsValue, "账户观看历史格式已变化。");
}

export function parseHistoryDetailsPayload(payload) {
  const rows = payload?.data;
  if (!Array.isArray(rows)) {
    throw accountError(
      "云端剧集资料格式已变化。",
      "ACCOUNT_HISTORY_DETAILS_INVALID",
    );
  }
  const details = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const seriesId = numericSeriesId(row.book_id || row.series_id);
    if (!seriesId) {
      continue;
    }
    details.set(seriesId, {
      title: detailTitle(row),
      coverUrl: detailCover(row),
      episodeCount: detailEpisodeCount(row),
      summary:
        stringValue(row.abstract) ||
        stringValue(row.video_desc) ||
        stringValue(row.series_intro),
    });
  }
  return details;
}

export function buildHistoryItems(rows, details = new Map()) {
  const items = [];
  for (const row of rows) {
    const seriesId = numericSeriesId(row.series_id || row.book_id);
    if (!seriesId) {
      continue;
    }
    const episodeIndex = Math.max(1, safeInteger(row.vid_index, 1));
    const detail = details.get(seriesId);
    items.push({
      key: `history:${seriesId}`,
      source: "history",
      seriesId,
      title: detail?.title || `剧集 ${seriesId}`,
      coverUrl: detail?.coverUrl || "",
      episodeCount:
        safeInteger(row.episode_count) || detail?.episodeCount || 0,
      episodeLabel: `看到第 ${episodeIndex} 集`,
      summary: detail?.summary || "",
      tags: "",
      updatedAt: timestampValue(row.last_watch_time),
      progressEpisode: episodeIndex,
      positionMs: Math.max(0, Number(row.current_play_time) || 0),
      durationMs: Math.max(0, Number(row.current_total_time) || 0),
      importable: true,
      note: "",
    });
  }
  const unique = new Map();
  for (const item of items) {
    if (!unique.has(item.seriesId)) {
      unique.set(item.seriesId, item);
    }
  }
  return [...unique.values()].sort(
    (left, right) =>
      (Date.parse(right.updatedAt || "") || 0) -
      (Date.parse(left.updatedAt || "") || 0),
  );
}

export function parseHistoryPayload(payload, detailsPayload = null) {
  const rows = parseHistoryListPayload(payload);
  const details = detailsPayload
    ? parseHistoryDetailsPayload(detailsPayload)
    : new Map();
  return buildHistoryItems(rows, details);
}

export function parseReservationsPayload(payload, { online } = {}) {
  const data = payload?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw accountError(
      "账户预约数据格式已变化，请稍后重试。",
      "ACCOUNT_RESERVATIONS_INVALID",
    );
  }
  if (!Object.hasOwn(data, "subscribe_items")) {
    throw accountError(
      "账户预约列表格式已变化，请稍后重试。",
      "ACCOUNT_RESERVATIONS_INVALID",
    );
  }
  const rows = objectRows(
    data.subscribe_items,
    "账户预约列表格式已变化，请稍后重试。",
  );
  const categoryKey = online ? "reservationsOnline" : "reservationsUpcoming";
  const items = [];
  for (const row of rows) {
    const video =
      row.subscribe_data &&
      typeof row.subscribe_data === "object" &&
      !Array.isArray(row.subscribe_data)
        ? row.subscribe_data
        : row.video_data &&
            typeof row.video_data === "object" &&
            !Array.isArray(row.video_data)
          ? row.video_data
          : row;
    let displayId = numericSeriesId(
      video.series_id || row.series_id || row.book_id,
    );
    if (!displayId && online === false && video === row) {
      const reservationId = stringValue(row.item_id);
      if (/^\d{1,30}$/.test(reservationId) && reservationId !== "0") {
        displayId = `reservation:${reservationId}`;
      }
    }
    if (!displayId) {
      continue;
    }
    const title =
      detailTitle(video) ||
      detailTitle(row) ||
      stringValue(row.name) ||
      stringValue(row.item_name);
    if (!title) {
      continue;
    }
    const seriesId = numericSeriesId(displayId);
    const episodeCount = detailEpisodeCount(video);
    items.push({
      key: `${categoryKey}:${displayId}`,
      source: categoryKey,
      seriesId: seriesId || null,
      displayId,
      title,
      coverUrl: detailCover(video) || detailCover(row),
      episodeCount,
      episodeLabel: online
        ? episodeCount > 0
          ? `全 ${episodeCount} 集`
          : "已上线"
        : "待上线",
      summary:
        stringValue(video.video_desc) ||
        stringValue(row.abstract) ||
        stringValue(row.item_desc),
      tags: stringValue(video.category),
      updatedAt: timestampValue(row.schedule_publish_time),
      expectedText: stringValue(row.expected_rec_text),
      importable: Boolean(seriesId),
      note: seriesId ? "" : "尚未生成正式剧集，暂时不能加入追更",
    });
  }
  if (rows.length > 0 && items.length === 0) {
    throw accountError(
      "预约条目格式已变化，请稍后重试。",
      "ACCOUNT_RESERVATIONS_INVALID",
    );
  }
  const unique = new Map();
  for (const item of items) {
    if (!unique.has(item.displayId)) {
      unique.set(item.displayId, item);
    }
  }
  return [...unique.values()].sort(
    (left, right) =>
      (Date.parse(right.updatedAt || "") || 0) -
      (Date.parse(left.updatedAt || "") || 0),
  );
}

function validateStoredCredentials(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid account session");
  }
  if (
    String(value.version) !== "1" ||
    !/^\d{1,30}$/.test(String(value.deviceId || "")) ||
    !/^\d{1,30}$/.test(String(value.installId || "")) ||
    !/^[a-f0-9-]{36}$/i.test(String(value.identity?.cdid || "")) ||
    typeof value.cookieHeader !== "string" ||
    !value.cookieHeader.includes("=") ||
    typeof value.profile?.id !== "string" ||
    !value.profile.id
  ) {
    throw new Error("invalid account session");
  }
  return {
    version: 1,
    cookieHeader: value.cookieHeader,
    deviceId: String(value.deviceId),
    installId: String(value.installId),
    identity: {
      cdid: String(value.identity.cdid),
      openudid: String(value.identity.openudid || ""),
      clientudid: String(value.identity.clientudid || ""),
      oaid: String(value.identity.oaid || ""),
      reqId: String(value.identity.reqId || ""),
    },
    profile: {
      id: String(value.profile.id),
      name: stringValue(value.profile.name) || "红果用户",
    },
    savedAt: timestampValue(value.savedAt) || new Date().toISOString(),
  };
}

export class AccountSessionVault {
  constructor({
    dataDir = DEFAULT_DATA_DIR,
    sessionFileName = "account-session.bin",
    keyFileName = "account-session.key",
  } = {}) {
    this.dataDir = path.resolve(dataDir);
    this.sessionPath = path.join(this.dataDir, sessionFileName);
    this.keyPath = path.join(this.dataDir, keyFileName);
    this.key = null;
    this.corruptSession = false;
  }

  async initialize() {
    await fs.mkdir(this.dataDir, {
      recursive: true,
      mode: 0o700,
    });
    await this.ensureKey();
  }

  async assertRegularFile(filePath) {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw accountError(
        "账号登录文件类型不安全，已停止读取。",
        "ACCOUNT_SESSION_UNSAFE",
        500,
      );
    }
    return stat;
  }

  async ensureKey() {
    try {
      const handle = await fs.open(this.keyPath, "wx", 0o600);
      try {
        const generated = crypto.randomBytes(32);
        await handle.writeFile(generated);
        await handle.sync();
        this.key = generated;
      } finally {
        await handle.close();
      }
      await this.syncDirectory();
      return this.key;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }
    }

    const stat = await this.assertRegularFile(this.keyPath);
    if (stat.size !== 32 || stat.size > 64) {
      throw accountError(
        "账号登录密钥已损坏，请重新登录。",
        "ACCOUNT_SESSION_KEY_INVALID",
        500,
      );
    }
    await fs.chmod(this.keyPath, 0o600);
    this.key = await fs.readFile(this.keyPath);
    return this.key;
  }

  async load() {
    let stat;
    try {
      stat = await this.assertRegularFile(this.sessionPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }
    if (stat.size < VAULT_MAGIC.length + 28 || stat.size > MAX_SESSION_BYTES) {
      this.corruptSession = true;
      throw accountError(
        "已保存的账号登录信息无法读取，请重新扫码登录。",
        "ACCOUNT_SESSION_INVALID",
        500,
      );
    }
    try {
      const encrypted = await fs.readFile(this.sessionPath);
      if (!encrypted.subarray(0, VAULT_MAGIC.length).equals(VAULT_MAGIC)) {
        throw new Error("invalid vault magic");
      }
      const ivStart = VAULT_MAGIC.length;
      const tagStart = ivStart + 12;
      const cipherStart = tagStart + 16;
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.key,
        encrypted.subarray(ivStart, tagStart),
      );
      decipher.setAAD(VAULT_AAD);
      decipher.setAuthTag(encrypted.subarray(tagStart, cipherStart));
      const plain = Buffer.concat([
        decipher.update(encrypted.subarray(cipherStart)),
        decipher.final(),
      ]);
      const parsed = JSON.parse(plain.toString("utf8"));
      return validateStoredCredentials(parsed);
    } catch {
      this.corruptSession = true;
      throw accountError(
        "已保存的账号登录信息无法读取，请重新扫码登录。",
        "ACCOUNT_SESSION_INVALID",
        500,
      );
    }
  }

  async backupCorruptSession() {
    if (!this.corruptSession) {
      return;
    }
    try {
      const stat = await this.assertRegularFile(this.sessionPath);
      if (!stat.isFile()) {
        return;
      }
      const stamp = new Date()
        .toISOString()
        .replace(/[-:.]/g, "")
        .replace("T", "-")
        .replace("Z", "");
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const suffix = attempt ? `-${attempt}` : "";
        const backupPath = `${this.sessionPath}.corrupt-${stamp}${suffix}`;
        try {
          await fs.copyFile(
            this.sessionPath,
            backupPath,
            fsConstants.COPYFILE_EXCL,
          );
          await fs.chmod(backupPath, 0o600);
          this.corruptSession = false;
          return;
        } catch (error) {
          if (error?.code !== "EEXIST") {
            throw error;
          }
        }
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        this.corruptSession = false;
        return;
      }
      throw error;
    }
  }

  async save(value) {
    await this.ensureKey();
    await this.backupCorruptSession();
    const normalized = validateStoredCredentials({
      ...value,
      version: 1,
      savedAt: value.savedAt || new Date().toISOString(),
    });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(VAULT_AAD);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(normalized), "utf8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([VAULT_MAGIC, iv, tag, ciphertext]);
    const temporaryPath = `${this.sessionPath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
    let handle = null;
    try {
      handle = await fs.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporaryPath, this.sessionPath);
      await fs.chmod(this.sessionPath, 0o600);
      await this.syncDirectory();
    } catch (error) {
      await handle?.close().catch(() => {});
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw accountError(
        "账号登录信息保存失败，请检查 data 目录权限。",
        "ACCOUNT_SESSION_SAVE_FAILED",
        500,
      );
    }
    this.corruptSession = false;
  }

  async syncDirectory() {
    let handle;
    try {
      handle = await fs.open(this.dataDir, "r");
      await handle.sync();
    } catch {
      // Some filesystems do not support fsync on directories.
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async clear() {
    for (const filePath of [this.sessionPath, this.keyPath]) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw accountError(
            "无法清除账号登录信息，请检查 data 目录权限。",
            "ACCOUNT_SESSION_CLEAR_FAILED",
            500,
          );
        }
      }
    }
    this.key = null;
    this.corruptSession = false;
    await this.syncDirectory();
  }
}

function accountPairs(
  credentials,
  extraPairs = {},
  {
    versionCode = ACCOUNT_VERSION_CODE,
    versionName = ACCOUNT_VERSION_NAME,
  } = {},
) {
  const pairs = new Map(
    accountDevicePairs(
      credentials.deviceId,
      credentials.installId,
      credentials.identity.cdid,
    ),
  );
  for (const key of [
    "version_code",
    "manifest_version_code",
    "update_version_code",
    "pv_player",
  ]) {
    pairs.set(key, versionCode);
  }
  pairs.set("version_name", versionName);
  for (const [name, value] of Object.entries(extraPairs)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      pairs.set(name, String(value));
    }
  }
  return [...pairs.entries()];
}

function reservationPageMetadata(payload) {
  const data = payload?.data;
  const candidates = [
    data?.has_more,
    data?.hasMore,
    data?.next_offset,
    data?.nextOffset,
    payload?.has_more,
  ];
  const rows = Array.isArray(data?.subscribe_items)
    ? data.subscribe_items
    : [];
  return {
    hasMore:
      candidates[0] === true ||
      candidates[1] === true ||
      Number(candidates[2]) > 0 ||
      Number(candidates[3]) > 0 ||
      candidates[4] === true ||
      rows.length >= ACCOUNT_PAGE_SIZE,
  };
}

function upstreamMessage(payload) {
  return normalizeWhitespace(
    payload?.data?.description ||
      payload?.data?.message ||
      payload?.message ||
      "",
  ).slice(0, 120);
}

function validateAccountPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw accountError(
      "红果账号数据格式异常，请稍后重试。",
      "ACCOUNT_DATA_INVALID",
    );
  }
  if (payload.code !== undefined && Number(payload.code) !== 0) {
    const message = upstreamMessage(payload);
    throw accountError(
      message
        ? `红果账号接口不可用：${message}`
        : "红果账号接口不可用，请重新登录或稍后重试。",
      Number(payload.code) === 100103
        ? "ACCOUNT_DEVICE_REJECTED"
        : "ACCOUNT_API_ERROR",
      502,
    );
  }
  return payload;
}

function categoryFailure(key, error, fetchedAt) {
  return {
    key,
    status: "error",
    error:
      error instanceof AccountError
        ? error.message
        : "这一类账号数据暂时无法读取。",
    items: [],
    count: 0,
    fetchedAt,
  };
}

export class AccountService {
  constructor({
    dataDir = DEFAULT_DATA_DIR,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    loginLifetimeMs = DEFAULT_LOGIN_LIFETIME_MS,
    requestScheduler = null,
    vault = null,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.loginLifetimeMs = loginLifetimeMs;
    this.requestScheduler = requestScheduler;
    this.vault =
      vault ||
      new AccountSessionVault({
        dataDir,
      });
    this.credentials = null;
    this.snapshot = null;
    this.sessionIssue = null;
    this.loginSessions = new Map();
    this.smsLoginSessions = new Map();
    this.refreshing = null;
    this.started = false;
    this.stopped = false;
    this.persistQueue = Promise.resolve();
  }

  async start() {
    if (this.started) {
      return this.status();
    }
    this.started = true;
    try {
      await this.vault.initialize();
      try {
        this.credentials = await this.vault.load();
      } catch (error) {
        this.credentials = null;
        this.sessionIssue =
          error?.message ||
          "已保存的账号登录信息无法读取，请重新登录。";
      }
    } catch (error) {
      this.credentials = null;
      this.sessionIssue =
        error?.message ||
        "账号登录存储暂不可用，请检查 data 目录权限。";
    }
    return this.status();
  }

  status(message = "") {
    return {
      authenticated: Boolean(this.credentials?.cookieHeader),
      profile: publicAccountProfile(this.credentials?.profile),
      savedAt: this.credentials?.savedAt || null,
      snapshot: publicAccountSnapshot(this.snapshot),
      refreshing: Boolean(this.refreshing),
      issue: this.sessionIssue,
      message,
    };
  }

  requireCredentials() {
    if (!this.credentials?.cookieHeader) {
      throw accountError(
        "请先登录红果账号。",
        "ACCOUNT_LOGIN_REQUIRED",
        401,
      );
    }
    return this.credentials;
  }

  withPersistLock(task) {
    const next = this.persistQueue.then(task, task);
    this.persistQueue = next.catch(() => {});
    return next;
  }

  cleanupLoginSessions() {
    const now = this.now();
    for (const [id, session] of this.loginSessions) {
      if (
        session.expiresAt + 5 * 60_000 < now ||
        (["succeeded", "failed", "expired"].includes(session.status) &&
          session.completedAt + LOGIN_RESULT_RETENTION_MS < now)
      ) {
        this.loginSessions.delete(id);
      }
    }
    while (this.loginSessions.size >= MAX_LOGIN_SESSIONS) {
      const first = this.loginSessions.keys().next().value;
      if (!first) {
        break;
      }
      this.loginSessions.delete(first);
    }
  }

  cleanupSmsLoginSessions() {
    const now = this.now();
    const remove = (id, session) => {
      clearSmsLoginSecrets(session);
      this.smsLoginSessions.delete(id);
    };
    for (const [id, session] of this.smsLoginSessions) {
      if (
        session.expiresAt + 5 * 60_000 < now ||
        (["succeeded", "failed", "expired"].includes(session.status) &&
          session.completedAt + LOGIN_RESULT_RETENTION_MS < now)
      ) {
        remove(id, session);
      }
    }
    while (this.smsLoginSessions.size >= MAX_SMS_LOGIN_SESSIONS) {
      const first = this.smsLoginSessions.keys().next().value;
      if (!first) {
        break;
      }
      remove(first, this.smsLoginSessions.get(first));
    }
  }

  async passportJson(
    session,
    pathname,
    extraParams = {},
    { method = "GET", form = null } = {},
  ) {
    const url = passportUrl(pathname, extraParams);
    const headers = {
      ...DEFAULT_PASSPORT_HEADERS,
    };
    const cookieHeader = session.jar.headerFor(url);
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }
    const csrfToken = session.jar.get(url, "passport_csrf_token");
    if (csrfToken) {
      headers["x-tt-passport-csrf-token"] = csrfToken;
    }
    const formBody =
      form === null
        ? null
        : new URLSearchParams(
            Object.entries(form).map(([name, value]) => [
              name,
              String(value ?? ""),
            ]),
          ).toString();
    if (formBody !== null) {
      headers["content-type"] =
        "application/x-www-form-urlencoded;charset=UTF-8";
    }
    const result = await limitedRequest(this.fetchImpl, url, {
      allowedHosts: PASSPORT_HOST,
      timeoutMs: this.timeoutMs,
      requestScheduler: this.requestScheduler,
      label: "红果扫码登录",
      method,
      headers,
      ...(formBody === null ? {} : { body: formBody }),
    });
    session.jar.addResponseCookies(result.response, url);
    if (!result.response.ok) {
      throw accountHttpError(
        result.response,
        `红果登录服务返回 HTTP ${result.response.status}。`,
        "ACCOUNT_LOGIN_HTTP_ERROR",
      );
    }
    if (!result.text.trim()) {
      throw accountError(
        "红果登录服务返回了空响应。",
        "ACCOUNT_LOGIN_EMPTY_RESPONSE",
      );
    }
    return passportData(parseJsonText(result.text, []));
  }

  async appPassportJson(
    session,
    pathname,
    {
      method = "GET",
      params = {},
      form = null,
    } = {},
  ) {
    const registration = session.registration;
    if (!registration?.deviceId || !registration?.installId) {
      throw accountError(
        "短信登录设备尚未准备好，请重新登录。",
        "ACCOUNT_SMS_DEVICE_MISSING",
        409,
      );
    }
    const passportParams = {
      aid: ACCOUNT_AID,
      app_name: "novelread",
      device_platform: "android",
      ...params,
    };
    const formBody =
      form === null
        ? null
        : new URLSearchParams(
            Object.entries(form)
              .filter(([, value]) => value !== undefined && value !== null)
              .map(([name, value]) => [name, String(value)]),
          ).toString();
    const signed =
      method === "GET"
        ? signAppGet({
            path: pathname,
            pairs: accountPairs(registration, passportParams, {
              versionCode: ACCOUNT_WRITE_VERSION_CODE,
              versionName: ACCOUNT_WRITE_VERSION_NAME,
            }),
            nowMillis: this.now(),
            deviceId: registration.deviceId,
            versionName: ACCOUNT_WRITE_VERSION_NAME,
            origin: APP_PASSPORT_ORIGIN,
          })
        : signAppPost({
            path: pathname,
            pairs: accountPairs(registration, {}, {
              versionCode: ACCOUNT_WRITE_VERSION_CODE,
              versionName: ACCOUNT_WRITE_VERSION_NAME,
            }),
            body: Buffer.from(formBody || ""),
            nowMillis: this.now(),
            deviceId: registration.deviceId,
            versionName: ACCOUNT_WRITE_VERSION_NAME,
            origin: APP_PASSPORT_ORIGIN,
          });
    const url = appPassportUrl(pathname, signed.query);
    const cookieHeader = session.jar.headerFor(APP_PASSPORT_ORIGIN);
    const result = await limitedRequest(this.fetchImpl, url, {
      allowedHosts: APP_PASSPORT_HOST,
      timeoutMs: this.timeoutMs,
      requestScheduler: this.requestScheduler,
      label: "红果短信登录",
      method,
      headers: {
        ...signed.headers,
        accept: "application/json; charset=utf-8",
        "user-agent": accountUserAgent(),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(formBody === null
          ? {}
          : {
              "content-type":
                "application/x-www-form-urlencoded; charset=UTF-8",
            }),
      },
      ...(formBody === null ? {} : { body: formBody }),
    });
    session.jar.addResponseCookies(result.response, url);
    if (!result.response.ok) {
      throw accountHttpError(
        result.response,
        `红果登录服务返回 HTTP ${result.response.status}。`,
        "ACCOUNT_LOGIN_HTTP_ERROR",
      );
    }
    if (!result.text.trim()) {
      throw accountError(
        "红果登录服务返回了空响应。",
        "ACCOUNT_LOGIN_EMPTY_RESPONSE",
      );
    }
    return parseJsonText(result.text, []);
  }

  async createLogin() {
    if (this.stopped) {
      throw accountError(
        "账号服务已停止。",
        "ACCOUNT_SERVICE_STOPPED",
        503,
      );
    }
    this.cleanupLoginSessions();
    const session = {
      id: crypto.randomUUID(),
      jar: new AccountCookieJar({ now: this.now }),
      status: "pending",
      token: "",
      qrBuffer: null,
      expiresAt: this.now() + this.loginLifetimeMs,
      error: "",
      pollPromise: null,
      completionPromise: null,
      completedAt: 0,
    };
    const data = await this.passportJson(
      session,
      "/passport/web/get_qrcode/",
    );
    const token = stringValue(data.token);
    const encoded = stringValue(data.qrcode).replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      "",
    );
    let qrBuffer;
    try {
      qrBuffer = Buffer.from(encoded, "base64");
    } catch {
      throw accountError(
        "红果登录二维码格式异常。",
        "ACCOUNT_QR_INVALID",
      );
    }
    if (
      !token ||
      qrBuffer.length < 32 ||
      qrBuffer.length > 512 * 1024
    ) {
      throw accountError(
        "红果登录二维码格式异常。",
        "ACCOUNT_QR_INVALID",
      );
    }
    const expireValue = Number(data.expire_time);
    if (Number.isFinite(expireValue) && expireValue > 0) {
      const now = this.now();
      const absoluteMilliseconds =
        expireValue > 1_000_000_000_000
          ? expireValue
          : expireValue > 1_000_000_000
            ? expireValue * 1000
            : 0;
      const requestedExpiry =
        absoluteMilliseconds > now
          ? absoluteMilliseconds
          : now + (expireValue < 60_000 ? expireValue * 1000 : expireValue);
      session.expiresAt = Math.min(
        requestedExpiry,
        now + 10 * 60_000,
      );
    }
    session.token = token;
    session.qrBuffer = qrBuffer;
    this.loginSessions.set(session.id, session);
    return {
      loginId: session.id,
      status: "pending",
      expiresAt: new Date(session.expiresAt).toISOString(),
    };
  }

  async createSmsLogin({ countryCode = "86", mobile } = {}) {
    if (this.stopped) {
      throw accountError(
        "账号服务已停止。",
        "ACCOUNT_SERVICE_STOPPED",
        503,
      );
    }
    this.cleanupSmsLoginSessions();
    const normalizedMobile = normalizeSmsLoginNumber(countryCode, mobile);
    const registration = await this.registerDevice();
    const session = {
      id: crypto.randomUUID(),
      jar: new AccountCookieJar({ now: this.now }),
      registration,
      mobile: normalizedMobile,
      maskedMobile: maskSmsMobile(normalizedMobile),
      mobileTicket: "",
      status: "pending_code",
      expiresAt: this.now() + SMS_LOGIN_LIFETIME_MS,
      codeSent: false,
      codeAttempts: 0,
      retryAfterSeconds: 0,
      nextSendAt: 0,
      error: "",
      completionPromise: null,
      completedAt: 0,
    };
    for (const [name, value] of Object.entries(registration.cookies || {})) {
      session.jar.setCookie(
        `${name}=${value}; Path=/; Secure`,
        `${APP_PASSPORT_ORIGIN}/`,
      );
    }
    this.smsLoginSessions.set(session.id, session);
    return this.publicSmsLoginStatus(session);
  }

  smsLoginSession(loginId) {
    const session = this.smsLoginSessions.get(String(loginId || ""));
    if (!session) {
      throw accountError(
        "短信登录会话已失效，请重新登录。",
        "ACCOUNT_SMS_LOGIN_NOT_FOUND",
        404,
      );
    }
    if (
      !["succeeded", "failed", "expired"].includes(session.status) &&
      session.expiresAt <= this.now()
    ) {
      session.status = "expired";
      session.error = "短信登录会话已过期，请重新登录。";
      session.completedAt = this.now();
      clearSmsLoginSecrets(session);
    }
    return session;
  }

  publicSmsLoginStatus(session) {
    const retryAfterSeconds =
      session.nextSendAt > this.now()
        ? Math.max(0, Math.ceil((session.nextSendAt - this.now()) / 1000))
        : 0;
    return {
      loginId: session.id,
      status: session.status,
      maskedMobile: session.maskedMobile,
      expiresAt: new Date(session.expiresAt).toISOString(),
      retryAfterSeconds,
      profile:
        session.status === "succeeded"
          ? publicAccountProfile(this.credentials?.profile)
          : null,
      error: session.error || "",
    };
  }

  async sendSmsCode(loginId) {
    const session = this.smsLoginSession(loginId);
    if (!["pending_code", "pending_verify"].includes(session.status)) {
      throw accountError(
        "当前登录会话不能发送验证码，请重新登录。",
        "ACCOUNT_SMS_CODE_SESSION_INVALID",
        409,
      );
    }
    if (session.nextSendAt > this.now()) {
      const error = accountError(
        "验证码发送过于频繁，请稍后再试。",
        "ACCOUNT_SMS_CODE_RATE_LIMITED",
        429,
      );
      error.retryAfterSeconds = Math.max(
        1,
        Math.ceil((session.nextSendAt - this.now()) / 1000),
      );
      throw error;
    }
    try {
      const payload = await this.appPassportJson(
        session,
        SMS_SEND_CODE_PATH,
        {
          params: {
            mobile: session.mobile,
            type: SMS_LOGIN_CODE_TYPE,
          },
        },
      );
      const failure = appPassportFailure(
        payload,
        "红果没有返回有效的验证码发送结果。",
      );
      if (failure) {
        throw failure;
      }
      const data = objectRecord(payload.data);
      const retryTime = Number(data.retry_time);
      const retryAfterSeconds =
        Number.isFinite(retryTime) && retryTime > 0
          ? Math.min(
              SMS_CODE_RETRY_MAX_SECONDS,
              Math.max(SMS_CODE_RETRY_DEFAULT_SECONDS, Math.ceil(retryTime)),
            )
          : SMS_CODE_RETRY_DEFAULT_SECONDS;
      session.codeSent = true;
      session.status = "pending_verify";
      session.codeAttempts = 0;
      session.mobileTicket = stringValue(data.mobile_ticket);
      session.retryAfterSeconds = retryAfterSeconds;
      session.nextSendAt = this.now() + retryAfterSeconds * 1000;
      session.error = "";
      return {
        ...this.publicSmsLoginStatus(session),
        message: "验证码已发送，请查看手机短信。",
      };
    } catch (error) {
      const mapped = smsCodeError(error);
      if (mapped.code === "ACCOUNT_SMS_VERIFICATION_REQUIRED") {
        session.error = mapped.message;
      }
      throw mapped;
    }
  }

  async verifySmsCode(loginId, code) {
    const session = this.smsLoginSession(loginId);
    const verificationCode = String(code ?? "").trim();
    if (session.status !== "pending_verify" || !session.codeSent) {
      throw accountError(
        "请先发送短信验证码。",
        "ACCOUNT_SMS_CODE_REQUIRED",
        409,
      );
    }
    if (!/^\d{4,8}$/.test(verificationCode)) {
      throw accountError(
        "验证码格式不正确。",
        "ACCOUNT_SMS_CODE_INVALID_FORMAT",
        400,
      );
    }
    if (session.codeAttempts >= MAX_SMS_CODE_ATTEMPTS) {
      session.status = "failed";
      session.error = "验证码错误次数过多，请重新登录。";
      session.completedAt = this.now();
      clearSmsLoginSecrets(session);
      throw accountError(
        session.error,
        "ACCOUNT_SMS_CODE_ATTEMPTS_EXCEEDED",
        429,
      );
    }
    session.codeAttempts += 1;
    try {
      let retryTag = "";
      for (let round = 0; round < SMS_LOGIN_MAX_MFA_ROUNDS; round += 1) {
        const form = {
          account_sdk_source: "app",
          passport_support_flow: "captcha,verify",
          mix_mode: "1",
          mobile: session.mobile,
          code: verificationCode,
        };
        if (retryTag) {
          form.passport_mfa_retry_tag = retryTag;
        }
        const payload = await this.appPassportJson(
          session,
          SMS_LOGIN_VERIFY_PATH,
          {
            method: "POST",
            form,
          },
        );
        if (this.hasPassportSession(session)) {
          break;
        }

        const mfa = parseSmsMfa(payload);
        if (!mfa) {
          const failure = appPassportFailure(
            payload,
            "红果没有返回有效的短信登录结果。",
          );
          if (failure) {
            throw failure;
          }
          break;
        }

        retryTag = stringValue(mfa.passport_mfa_retry_tag);
        if (retryTag) {
          continue;
        }
        if (!stringValue(mfa.verify_ticket)) {
          const failure = accountError(
            "红果要求完成额外安全验证，请改用扫码登录。",
            "ACCOUNT_LOGIN_UPSTREAM_ERROR",
          );
          failure.upstreamMfaRequired = true;
          throw failure;
        }

        const verifyPayload = await this.appPassportJson(
          session,
          SMS_MFA_VERIFY_PATH,
          {
            method: "POST",
            form: buildSmsMfaVerifyForm(mfa, session.mobileTicket),
          },
        );
        if (this.hasPassportSession(session)) {
          break;
        }
        const verifyFailure = appPassportFailure(
          verifyPayload,
          "红果没有完成本次安全验证。",
        );
        if (verifyFailure) {
          throw verifyFailure;
        }
        const verified = parseSmsMfa(verifyPayload);
        retryTag = stringValue(verified?.passport_mfa_retry_tag);
        if (!retryTag) {
          const failure = accountError(
            "红果安全验证没有返回登录凭据，请重新获取验证码。",
            "ACCOUNT_LOGIN_UPSTREAM_ERROR",
          );
          failure.upstreamMfaRequired = true;
          throw failure;
        }
      }
      if (!this.hasPassportSession(session)) {
        throw accountError(
          "红果尚未下发有效登录态，请重新登录。",
          "ACCOUNT_LOGIN_SESSION_MISSING",
        );
      }
      session.status = "profile_loading";
      session.error = "";
      session.nextSendAt = 0;
      session.completionPromise = this.completeLoginInBackground(session);
      return this.publicSmsLoginStatus(session);
    } catch (error) {
      const mapped = smsCodeError(error);
      if (
        mapped.code === "ACCOUNT_SMS_CODE_INVALID" &&
        session.codeAttempts >= MAX_SMS_CODE_ATTEMPTS
      ) {
        session.status = "failed";
        session.error = "验证码错误次数过多，请重新登录。";
        session.completedAt = this.now();
        clearSmsLoginSecrets(session);
        throw accountError(
          session.error,
          "ACCOUNT_SMS_CODE_ATTEMPTS_EXCEEDED",
          429,
        );
      }
      throw mapped;
    }
  }

  pollSmsLogin(loginId) {
    return this.publicSmsLoginStatus(this.smsLoginSession(loginId));
  }

  async cancelSmsLogin(loginId) {
    const session = this.smsLoginSessions.get(String(loginId || ""));
    if (!session) {
      return { canceled: false };
    }
    session.status = "expired";
    session.error = "";
    session.completedAt = this.now();
    clearSmsLoginSecrets(session);
    return { canceled: true };
  }

  loginSession(loginId) {
    const session = this.loginSessions.get(String(loginId || ""));
    if (!session) {
      throw accountError(
        "登录二维码已失效，请重新获取。",
        "ACCOUNT_LOGIN_NOT_FOUND",
        404,
      );
    }
    if (
      session.status === "pending" &&
      session.expiresAt <= this.now()
    ) {
      session.status = "expired";
      session.token = "";
    }
    return session;
  }

  getLoginQr(loginId) {
    const session = this.loginSession(loginId);
    if (session.status !== "pending" || !session.qrBuffer) {
      throw accountError(
        "登录二维码已失效，请重新获取。",
        "ACCOUNT_QR_EXPIRED",
        410,
      );
    }
    return session.qrBuffer;
  }

  publicLoginStatus(session) {
    return {
      loginId: session.id,
      status: session.status,
      expiresAt: new Date(session.expiresAt).toISOString(),
      profile:
        session.status === "succeeded"
          ? publicAccountProfile(this.credentials?.profile)
          : null,
      error: session.error || "",
    };
  }

  async pollLogin(loginId) {
    const session = this.loginSession(loginId);
    if (session.status !== "pending") {
      return this.publicLoginStatus(session);
    }
    if (session.expiresAt <= this.now()) {
      session.status = "expired";
      session.token = "";
      return this.publicLoginStatus(session);
    }
    if (session.pollPromise) {
      return session.pollPromise;
    }
    session.pollPromise = (async () => {
      try {
        const data = await this.passportJson(
          session,
          "/passport/web/check_qrconnect/",
          { token: session.token },
        );
        const status = stringValue(data.status);
        if (status === "5" || status === "expired") {
          session.status = "expired";
          session.token = "";
          return this.publicLoginStatus(session);
        }
        if (status === "3" || status === "confirmed") {
          const redirectUrl = stringValue(data.redirect_url);
          if (!redirectUrl) {
            throw accountError(
              "红果登录确认缺少跳转地址，请重新扫码。",
              "ACCOUNT_LOGIN_REDIRECT_MISSING",
            );
          }
          await this.finishRedirect(session, redirectUrl);
          session.status = "profile_loading";
          session.token = "";
          session.qrBuffer = null;
          session.completionPromise = this.completeLoginInBackground(session);
          return this.publicLoginStatus(session);
        }
        return this.publicLoginStatus(session);
      } catch (error) {
        session.status = "failed";
        session.error =
          error?.message || "扫码登录未完成，请重新获取二维码。";
        session.completedAt = this.now();
        session.token = "";
        throw error;
      } finally {
        session.pollPromise = null;
      }
    })();
    return session.pollPromise;
  }

  hasPassportSession(session) {
    return [PASSPORT_ORIGIN, APP_PASSPORT_ORIGIN].some((origin) =>
      /(?:^|;\s*)(?:sessionid|sessionid_ss)=/.test(
        session.jar.headerFor(origin),
      ),
    );
  }

  async finishRedirect(session, value) {
    let url;
    try {
      url = new URL(value, PASSPORT_ORIGIN);
    } catch {
      throw accountError(
        "红果登录确认地址无效。",
        "ACCOUNT_LOGIN_REDIRECT_INVALID",
      );
    }
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      assertOfficialUrl(url.href, PASSPORT_HOST);
      const headers = {
        ...DEFAULT_PASSPORT_HEADERS,
      };
      const cookieHeader = session.jar.headerFor(url);
      if (cookieHeader) {
        headers.cookie = cookieHeader;
      }
      const result = await limitedRequest(this.fetchImpl, url.href, {
        allowedHosts: PASSPORT_HOST,
        timeoutMs: this.timeoutMs,
        requestScheduler: this.requestScheduler,
        label: "红果登录确认",
        headers,
      });
      session.jar.addResponseCookies(result.response, url.href);
      if (
        result.response.status >= 300 &&
        result.response.status < 400
      ) {
        const location = result.response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) {
          throw accountError(
            "红果登录确认跳转次数过多。",
            "ACCOUNT_LOGIN_REDIRECT_LIMIT",
          );
        }
        url = new URL(location, url);
        continue;
      }
      if (!result.response.ok) {
        throw accountHttpError(
          result.response,
          "红果登录确认失败，请重新扫码。",
          "ACCOUNT_LOGIN_CONFIRM_FAILED",
        );
      }
      if (!this.hasPassportSession(session)) {
        throw accountError(
          "红果尚未下发有效登录态，请重新扫码。",
          "ACCOUNT_LOGIN_SESSION_MISSING",
        );
      }
      return;
    }
  }

  async registerDevice() {
    const identity = buildRegisterIdentity();
    const body = buildRegisterBody(identity);
    const ticket = String(this.now());
    const requestUrl =
      `${REGISTER_ORIGIN}/service/2/device_register/` +
      "?tt_data=a&cronet_version=8d40f833_2026-03-03" +
      "&ttnet_version=4.2.243.31-douyin&use_store_region_cookie=1";
    const result = await limitedRequest(this.fetchImpl, requestUrl, {
      allowedHosts: REGISTER_HOST,
      timeoutMs: this.timeoutMs,
      requestScheduler: this.requestScheduler,
      label: "红果设备注册",
      method: "POST",
      headers: {
        "user-agent": accountUserAgent(),
        "content-type": "application/octet-stream;tt-data=a",
        "log-encode-type": "gzip",
        "x-ss-dp": ACCOUNT_AID,
        "x-ss-req-ticket": ticket,
        "x-vc-bdturing-sdk-version": "4.0.3.cn",
        lc: "101",
        "sdk-version": "2",
        "passport-sdk-version": "5051452",
        "x-neptune": "-8|50:51:59:30:40:47:49:39",
        "x-ss-stub": crypto
          .createHash("md5")
          .update(body)
          .digest("hex")
          .toUpperCase(),
      },
      body,
    });
    if (!result.response.ok) {
      throw accountHttpError(
        result.response,
        `红果设备注册返回 HTTP ${result.response.status}。`,
        "ACCOUNT_DEVICE_REGISTER_FAILED",
      );
    }
    let registered;
    try {
      registered = parseRegisterResponse(
        result.text,
        setCookieHeaders(result.response),
      );
    } catch (error) {
      throw accountError(
        error?.message || "红果设备注册失败。",
        "ACCOUNT_DEVICE_REGISTER_FAILED",
      );
    }
    return {
      identity,
      ...registered,
    };
  }

  async accountRequest(credentials, pathname, params = {}) {
    const signed = signAppGet({
      path: pathname,
      pairs: accountPairs(credentials, params),
      nowMillis: this.now(),
      deviceId: credentials.deviceId,
      versionName: ACCOUNT_VERSION_NAME,
    });
    const url = appRequestUrl(pathname, signed.query);
    const result = await limitedRequest(this.fetchImpl, url, {
      allowedHosts: ACCOUNT_API_HOST,
      timeoutMs: this.timeoutMs,
      requestScheduler: this.requestScheduler,
      label: "红果账号数据读取",
      headers: {
        ...signed.headers,
        accept: "application/json; charset=utf-8",
        cookie: credentials.cookieHeader,
        "user-agent": accountUserAgent(),
      },
    });
    if (result.response.status === 401 || result.response.status === 403) {
      throw accountError(
        "红果登录态已失效，请重新扫码登录。",
        "ACCOUNT_SESSION_EXPIRED",
        401,
      );
    }
    if (!result.response.ok) {
      throw accountHttpError(
        result.response,
        `红果账号接口返回 HTTP ${result.response.status}。`,
        "ACCOUNT_API_HTTP_ERROR",
      );
    }
    if (!result.text.trim()) {
      throw accountError(
        "红果账号接口返回空响应，请稍后重试。",
        "ACCOUNT_API_EMPTY_RESPONSE",
      );
    }
    return validateAccountPayload(parseJsonText(result.text));
  }

  async accountPost(credentials, pathname, payload, { gzip = false } = {}) {
    const body = Buffer.from(JSON.stringify(payload));
    const wireBody = gzip ? gzipSync(body) : body;
    const signed = signAppPost({
      path: pathname,
      pairs: accountPairs(credentials, {}, {
        versionCode: ACCOUNT_WRITE_VERSION_CODE,
        versionName: ACCOUNT_WRITE_VERSION_NAME,
      }),
      body: wireBody,
      nowMillis: this.now(),
      deviceId: credentials.deviceId,
      versionName: ACCOUNT_WRITE_VERSION_NAME,
    });
    const url = appRequestUrl(pathname, signed.query);
    const result = await limitedRequest(this.fetchImpl, url, {
      allowedHosts: ACCOUNT_API_HOST,
      timeoutMs: this.timeoutMs,
      requestScheduler: this.requestScheduler,
      label: "红果账号数据写入",
      method: "POST",
      headers: {
        ...signed.headers,
        accept: "application/json; charset=utf-8",
        "content-type": "application/json; charset=utf-8",
        cookie: credentials.cookieHeader,
        "user-agent": userAgent(),
        ...(gzip ? { "content-encoding": "gzip" } : {}),
      },
      body: wireBody,
    });
    if (result.response.status === 401 || result.response.status === 403) {
      throw accountError(
        "红果登录态已失效，请重新扫码登录。",
        "ACCOUNT_SESSION_EXPIRED",
        401,
      );
    }
    if (!result.response.ok) {
      throw accountHttpError(
        result.response,
        `红果账号接口返回 HTTP ${result.response.status}。`,
        "ACCOUNT_API_HTTP_ERROR",
      );
    }
    if (!result.text.trim()) {
      throw accountError(
        "红果账号接口返回空响应，请稍后重试。",
        "ACCOUNT_API_EMPTY_RESPONSE",
      );
    }
    return validateAccountPayload(parseJsonText(result.text));
  }

  async fetchProfile(credentials) {
    const payload = await this.accountRequest(
      credentials,
      "/reading/user/info/v1/",
    );
    return parseProfilePayload(payload);
  }

  async fetchFavorites(credentials) {
    const payload = await this.accountRequest(
      credentials,
      "/reading/bookapi/bookshelf/video/info/v1/",
    );
    return parseFavoritesPayload(payload);
  }

  async fetchHistory(credentials) {
    const payload = await this.accountRequest(
      credentials,
      "/reading/bookapi/read_progress/list/v1/",
      {
        book_types: "2",
        limit: "50",
      },
    );
    const rows = parseHistoryListPayload(payload);
    const ids = [
      ...new Set(
        rows
          .map((row) => numericSeriesId(row.series_id || row.book_id))
          .filter(Boolean),
      ),
    ];
    let details = new Map();
    if (ids.length) {
      try {
        const detailPayload = await this.accountRequest(
          credentials,
          "/reading/bookapi/multi-detail/v1/",
          {
            book_id: ids.join(","),
            book_type: "2",
          },
        );
        details = parseHistoryDetailsPayload(detailPayload);
      } catch {
        // A title lookup failure should not hide otherwise valid history rows.
      }
    }
    return buildHistoryItems(rows, details);
  }

  async fetchReservations(credentials, online) {
    const rowsByDisplayId = new Map();
    for (let page = 0; page < ACCOUNT_MAX_PAGES; page += 1) {
      const offset = page * ACCOUNT_PAGE_SIZE;
      const payload = await this.accountRequest(
        credentials,
        "/reading/user/subscribe/list/v0/",
        {
          offset: String(offset),
          limit: String(ACCOUNT_PAGE_SIZE),
          is_online: String(online),
          tab_type: "13",
          subscribe_order_type: "0",
          swipe_type: "0",
          need_calendar_schema: "false",
          subscribe_offset: String(offset),
        },
      );
      const items = parseReservationsPayload(payload, { online });
      const previousSize = rowsByDisplayId.size;
      for (const item of items) {
        rowsByDisplayId.set(item.displayId, item);
      }
      if (
        !reservationPageMetadata(payload).hasMore ||
        rowsByDisplayId.size === previousSize
      ) {
        break;
      }
    }
    return [...rowsByDisplayId.values()];
  }

  async setFavorite(credentials, seriesId, add, { verify = true } = {}) {
    const id = String(seriesId || "");
    if (!/^\d{8,25}$/.test(id)) {
      throw accountError("收藏剧集 ID 格式不正确。", "ACCOUNT_SERIES_ID_INVALID", 400);
    }
    const entry = {
      book_id: id,
      book_type: 2,
      modify_time: this.now(),
      video_shelf_operate_type: add ? 0 : 1,
      ...(add ? {} : { group_name: "" }),
    };
    const payload = {
      is_cancelled: false,
      update_bookshelf_video_list: [entry],
      ...(add
        ? {
            shark_extra: {
              enter_from: "MainFragmentActivity",
              previous_page: "",
              page_list: "MainFragmentActivity",
              is_active_behavior: "true",
              inactive_type: "0",
            },
          }
        : {}),
    };
    await this.accountPost(
      credentials,
      "/reading/bookapi/bookshelf/video/update/v1/",
      payload,
    );
    if (!verify) {
      return;
    }
    const favorites = await this.fetchFavorites(credentials);
    const present = favorites.some((item) => item.seriesId === id);
    if (present !== add) {
      throw accountError(
        add
          ? "收藏写入未生效，账号接口没有返回该剧。"
          : "取消收藏未生效，账号仍返回该剧。",
        "ACCOUNT_FAVORITE_NOT_CONFIRMED",
      );
    }
  }

  async setReservation(credentials, seriesId, add, { verify = true } = {}) {
    const id = String(seriesId || "");
    if (!/^\d{8,25}$/.test(id)) {
      throw accountError("预约剧集 ID 格式不正确。", "ACCOUNT_SERIES_ID_INVALID", 400);
    }
    await this.accountPost(
      credentials,
      "/reading/bookapi/search/uncover_subscribe/v1/",
      {
        item_id: id,
        item_type: 3,
        op_type: add ? 1 : 2,
        subscribe_source: 0,
      },
      { gzip: true },
    );
    if (!verify) {
      return;
    }
    const [online, upcoming] = await Promise.all([
      this.fetchReservations(credentials, true),
      this.fetchReservations(credentials, false),
    ]);
    const present = [...online, ...upcoming].some(
      (item) => item.seriesId === id,
    );
    if (present !== add) {
      throw accountError(
        add
          ? "预约写入未生效，账号接口没有返回该剧。"
          : "取消预约未生效，账号仍返回该剧。",
        "ACCOUNT_RESERVATION_NOT_CONFIRMED",
      );
    }
  }

  async completeLogin(session) {
    const registered = session.registration || await this.registerDevice();
    const cookieHeader = mergeCookieHeaders(
      Object.entries(registered.cookies),
      session.jar.headerFor(PASSPORT_ORIGIN),
      session.jar.headerFor(APP_PASSPORT_ORIGIN),
    );
    if (!/(?:^|;\s*)(?:sessionid|sessionid_ss)=/.test(cookieHeader)) {
      throw accountError(
        "红果尚未下发有效登录态，请重新登录。",
        "ACCOUNT_LOGIN_SESSION_MISSING",
      );
    }
    const credentials = {
      version: 1,
      cookieHeader,
      deviceId: registered.deviceId,
      installId: registered.installId,
      identity: registered.identity,
      profile: null,
      savedAt: new Date(this.now()).toISOString(),
    };
    const profile = await this.fetchProfile(credentials);
    credentials.profile = profile;
    await this.withPersistLock(() => this.vault.save(credentials));
    this.credentials = credentials;
    this.snapshot = null;
    this.sessionIssue = null;
    session.status = "succeeded";
    session.token = "";
    session.qrBuffer = null;
    session.jar = null;
    session.completedAt = this.now();
  }

  async completeLoginInBackground(session) {
    try {
      await this.completeLogin(session);
    } catch (error) {
      session.status = "failed";
      session.error =
        error?.message || "账号登录完成，但读取账号资料失败，请重试。";
      session.completedAt = this.now();
      session.token = "";
      session.qrBuffer = null;
      session.jar = null;
    } finally {
      clearSmsLoginSecrets(session);
      session.completionPromise = null;
    }
  }

  async cancelLogin(loginId) {
    const session = this.loginSessions.get(String(loginId || ""));
    if (!session) {
      return { canceled: false };
    }
    session.status = "expired";
    session.token = "";
    session.qrBuffer = null;
    session.jar = null;
    this.loginSessions.delete(session.id);
    return { canceled: true };
  }

  async refresh() {
    const credentials = this.requireCredentials();
    if (this.refreshing) {
      throw accountError(
        "账号数据正在刷新，请稍候。",
        "ACCOUNT_REFRESH_BUSY",
        429,
      );
    }
    this.refreshing = (async () => {
      const profile = await this.fetchProfile(credentials);
      const fetchedAt = new Date(this.now()).toISOString();
      const load = async (key, task) => {
        try {
          return {
            ...categoryFromRows(key, await task()),
            fetchedAt,
          };
        } catch (error) {
          return categoryFailure(key, error, fetchedAt);
        }
      };
      const [favorites, reservationsOnline, reservationsUpcoming] =
        await Promise.all([
        load("favorites", () => this.fetchFavorites(credentials)),
        load("reservationsOnline", () =>
          this.fetchReservations(credentials, true),
        ),
        load("reservationsUpcoming", () =>
          this.fetchReservations(credentials, false),
        ),
      ]);
      if (profile.id !== credentials.profile.id ||
          profile.name !== credentials.profile.name) {
        credentials.profile = profile;
        await this.withPersistLock(() => this.vault.save(credentials));
      }
      this.credentials = credentials;
      this.snapshot = {
        profile,
        fetchedAt,
        categories: {
          favorites,
          reservationsOnline,
          reservationsUpcoming,
        },
      };
      this.sessionIssue = null;
      return this.status("账号数据已刷新。");
    })();
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  async logout() {
    for (const session of this.loginSessions.values()) {
      session.status = "expired";
      session.token = "";
      session.qrBuffer = null;
      session.jar = null;
    }
    this.loginSessions.clear();
    for (const session of this.smsLoginSessions.values()) {
      session.status = "expired";
      clearSmsLoginSecrets(session);
    }
    this.smsLoginSessions.clear();
    this.credentials = null;
    this.snapshot = null;
    this.sessionIssue = null;
    await this.withPersistLock(() => this.vault.clear());
    return this.status("已退出红果账号。");
  }

  async stop() {
    this.stopped = true;
    for (const session of this.loginSessions.values()) {
      session.status = "expired";
      session.token = "";
      session.qrBuffer = null;
      session.jar = null;
    }
    this.loginSessions.clear();
    for (const session of this.smsLoginSessions.values()) {
      session.status = "expired";
      clearSmsLoginSecrets(session);
    }
    this.smsLoginSessions.clear();
  }
}
