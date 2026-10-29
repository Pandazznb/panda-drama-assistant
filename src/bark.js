import { BARK_API_ORIGIN } from "./constants.js";

const MAX_BARK_KEY_LENGTH = 128;
const MAX_TITLE_LENGTH = 64;
const MAX_BODY_LENGTH = 180;
const NOTIFICATION_TIMEOUT_MS = 12_000;
const BARK_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export class BarkError extends Error {
  constructor(message, code = "BARK_ERROR", statusCode = 502) {
    super(message);
    this.name = "BarkError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeBarkKey(value) {
  const key = String(value || "").trim();
  if (!key) {
    return "";
  }
  if (key.length > MAX_BARK_KEY_LENGTH || !BARK_KEY_PATTERN.test(key)) {
    throw new BarkError(
      "Bark key 只能包含字母、数字、下划线或短横线，且不能超过 128 个字符。",
      "INVALID_BARK_KEY",
      400,
    );
  }
  return key;
}

export function maskBarkKey(key) {
  if (!key) {
    return "";
  }
  if (key.length <= 6) {
    return `${key.slice(0, 1)}***`;
  }
  return `${key.slice(0, 3)}***${key.slice(-3)}`;
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export function buildBarkRequest(key, { title, body, group = "红果追更" }) {
  const normalizedKey = normalizeBarkKey(key);
  if (!normalizedKey) {
    throw new BarkError("还没有配置 Bark key。", "BARK_KEY_MISSING", 400);
  }

  const endpoint = new URL(
    `/${encodeURIComponent(normalizedKey)}`,
    BARK_API_ORIGIN,
  );
  if (endpoint.origin !== BARK_API_ORIGIN) {
    throw new BarkError("Bark 请求地址无效。", "INVALID_BARK_ENDPOINT", 400);
  }

  return {
    endpoint: endpoint.href,
    payload: {
      title: truncate(title, MAX_TITLE_LENGTH),
      body: truncate(body, MAX_BODY_LENGTH),
      group: truncate(group, 32),
      level: "active",
    },
  };
}

export async function sendBarkNotification(
  key,
  message,
  { fetchImpl = globalThis.fetch, timeoutMs = NOTIFICATION_TIMEOUT_MS } = {},
) {
  const { endpoint, payload } = buildBarkRequest(key, message);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new BarkError(
        `Bark 返回 HTTP ${response.status}，请检查 key 是否正确。`,
        "BARK_HTTP_ERROR",
      );
    }

    let result = null;
    try {
      result = await response.json();
    } catch {
      // A successful HTTP response is enough for Bark-compatible proxies.
    }

    if (result && Number(result.code) !== 200) {
      throw new BarkError(
        `Bark 返回错误：${result.message || result.code || "未知错误"}`,
        "BARK_API_ERROR",
      );
    }

    return { ok: true, result };
  } catch (error) {
    if (error instanceof BarkError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new BarkError("Bark 请求超时。", "BARK_TIMEOUT", 504);
    }
    throw new BarkError(`无法连接 Bark：${error.message}`, "BARK_REQUEST_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}

export const __test = {
  MAX_BARK_KEY_LENGTH,
  MAX_BODY_LENGTH,
  MAX_TITLE_LENGTH,
};
