const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_MIN_INTERVAL_MS = 250;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 60_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429]);

function normalizedInteger(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.floor(number))
    : fallback;
}

function requestLocation(input) {
  try {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input?.url,
    );
    return {
      host: url.hostname,
      path: url.pathname,
    };
  } catch {
    return {
      host: "",
      path: "",
    };
  }
}

function timeoutError(cause) {
  const error = new Error("上游请求超时。", { cause });
  error.name = "AbortError";
  error.code = "UPSTREAM_TIMEOUT";
  return error;
}

async function executeRequestAttempt(
  fetchImpl,
  input,
  init,
  {
    timeoutMs,
    readBody = null,
  },
) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;
  if (timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timer.unref?.();
  }

  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  let response;
  try {
    response = await fetchImpl(input, {
      ...init,
      signal,
    });
    if (retryableStatus(response.status)) {
      await discardResponse(response);
      return { response, body: undefined };
    }

    let body;
    if (readBody) {
      try {
        body = await readBody(response, { signal });
      } catch (error) {
        if (
          !timedOut &&
          error &&
          (typeof error === "object" || typeof error === "function")
        ) {
          error.upstreamBodyRead = true;
        }
        throw error;
      }
    }
    return { response, body };
  } catch (error) {
    if (timedOut) {
      await discardResponse(response);
      throw timeoutError(error);
    }
    throw error;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}

export function retryAfterMilliseconds(response, nowMs = Date.now()) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }
  const dateMs = Date.parse(value);
  return Number.isFinite(dateMs)
    ? Math.max(0, dateMs - nowMs)
    : null;
}

function retryableStatus(status) {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function retryableError(error) {
  if (!error) {
    return true;
  }
  if (error.upstreamBodyRead) {
    return false;
  }
  if (error.code === "UPSTREAM_TIMEOUT") {
    return true;
  }
  return error.name !== "AbortError";
}

async function discardResponse(response) {
  try {
    await response?.body?.cancel?.();
  } catch {
    // A response body that is already closed needs no further cleanup.
  }
}

export class UpstreamRequestScheduler {
  constructor({
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
    minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryBaseMs = DEFAULT_RETRY_BASE_MS,
    retryMaxMs = DEFAULT_RETRY_MAX_MS,
    logger = null,
    now = Date.now,
    random = Math.random,
    sleep = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
  } = {}) {
    this.maxConcurrency = normalizedInteger(
      maxConcurrency,
      DEFAULT_MAX_CONCURRENCY,
      1,
    );
    this.minIntervalMs = normalizedInteger(
      minIntervalMs,
      DEFAULT_MIN_INTERVAL_MS,
    );
    this.maxRetries = normalizedInteger(
      maxRetries,
      DEFAULT_MAX_RETRIES,
    );
    this.retryBaseMs = normalizedInteger(
      retryBaseMs,
      DEFAULT_RETRY_BASE_MS,
    );
    this.retryMaxMs = normalizedInteger(
      retryMaxMs,
      DEFAULT_RETRY_MAX_MS,
      1,
    );
    this.logger = logger;
    this.now = now;
    this.random = random;
    this.sleep = sleep;
    this.active = 0;
    this.nextStartAt = 0;
    this.waiters = [];
    this.dispatchTimer = null;
  }

  async acquire() {
    await new Promise((resolve) => {
      this.waiters.push(resolve);
      this.dispatch();
    });
  }

  release() {
    this.active = Math.max(0, this.active - 1);
    this.dispatch();
  }

  dispatch() {
    if (this.dispatchTimer) {
      return;
    }
    while (
      this.active < this.maxConcurrency &&
      this.waiters.length > 0
    ) {
      const now = this.now();
      const delayMs = Math.max(0, this.nextStartAt - now);
      if (delayMs > 0) {
        this.dispatchTimer = setTimeout(() => {
          this.dispatchTimer = null;
          this.dispatch();
        }, delayMs);
        this.dispatchTimer.unref?.();
        return;
      }

      this.active += 1;
      this.nextStartAt = now + this.minIntervalMs;
      this.waiters.shift()();
      if (this.minIntervalMs > 0) {
        this.dispatchTimer = setTimeout(() => {
          this.dispatchTimer = null;
          this.dispatch();
        }, this.minIntervalMs);
        this.dispatchTimer.unref?.();
        return;
      }
    }
  }

  retryDelayMs(response, retryIndex) {
    const retryAfterMs = retryAfterMilliseconds(response, this.now());
    if (retryAfterMs !== null) {
      return Math.min(this.retryMaxMs, retryAfterMs);
    }
    const exponential =
      this.retryBaseMs * 2 ** Math.max(0, retryIndex);
    const jitter = Math.floor(exponential * 0.25 * this.random());
    return Math.min(this.retryMaxMs, exponential + jitter);
  }

  async writeLog({
    level,
    action,
    message,
    label,
    input,
    method,
    statusCode = null,
    durationMs,
    retryCount,
    retryDelayMs = null,
  }) {
    if (!this.logger) {
      return;
    }
    const location = requestLocation(input);
    try {
      await this.logger({
        category: "network",
        action,
        level,
        message,
        metadata: {
          label,
          method,
          host: location.host,
          path: location.path,
          statusCode,
          durationMs,
          retryCount,
          retryDelayMs,
        },
      });
    } catch (error) {
      console.error(
        `上游请求日志写入失败：${error?.message || "未知错误"}`,
      );
    }
  }

  async fetch(
    input,
    init = {},
    {
      fetchImpl = globalThis.fetch,
      timeoutMs = 15_000,
      label = "红果上游请求",
      readBody = null,
    } = {},
  ) {
    const startedAt = this.now();
    const method = String(init.method || "GET").toUpperCase();
    let retryCount = 0;

    while (true) {
      const attemptStartedAt = this.now();
      let result;
      let response;
      let requestError = null;
      await this.acquire();
      try {
        result = await executeRequestAttempt(
          fetchImpl,
          input,
          init,
          {
            timeoutMs: normalizedInteger(timeoutMs, 15_000),
            readBody,
          },
        );
        response = result.response;
      } catch (error) {
        requestError = error;
      } finally {
        this.release();
      }

      if (requestError) {
        const durationMs = Math.max(0, this.now() - attemptStartedAt);
        if (retryCount < this.maxRetries && retryableError(requestError)) {
          const retryDelayMs = Math.min(
            this.retryMaxMs,
            this.retryBaseMs * 2 ** retryCount +
              Math.floor(
                this.retryBaseMs *
                  2 ** retryCount *
                  0.25 *
                  this.random(),
              ),
          );
          await this.writeLog({
            level: "warning",
            action: "upstream.request.retry",
            message: `${label}连接失败，${Math.ceil(retryDelayMs / 1000)} 秒后进行第 ${retryCount + 1} 次重试。`,
            label,
            input,
            method,
            durationMs,
            retryCount: retryCount + 1,
            retryDelayMs,
          });
          retryCount += 1;
          await this.sleep(retryDelayMs);
          continue;
        }
        requestError.upstreamRequestAttempts = retryCount + 1;
        requestError.upstreamRequestRetryCount = retryCount;
        requestError.upstreamRequestDurationMs = Math.max(
          0,
          this.now() - startedAt,
        );
        await this.writeLog({
          level: "error",
          action: "upstream.request.failed",
          message: `${label}请求失败，已尝试 ${retryCount + 1} 次。`,
          label,
          input,
          method,
          durationMs: Math.max(0, this.now() - startedAt),
          retryCount,
        });
        throw requestError;
      }

      const durationMs = Math.max(0, this.now() - attemptStartedAt);
      if (retryableStatus(response.status) && retryCount < this.maxRetries) {
        const retryDelayMs = this.retryDelayMs(response, retryCount);
        await this.writeLog({
          level: "warning",
          action: "upstream.request.retry",
          message: `${label}返回 HTTP ${response.status}，${Math.ceil(retryDelayMs / 1000)} 秒后进行第 ${retryCount + 1} 次重试。`,
          label,
          input,
          method,
          statusCode: response.status,
          durationMs,
          retryCount: retryCount + 1,
          retryDelayMs,
        });
        retryCount += 1;
        await this.sleep(retryDelayMs);
        continue;
      }

      if (response.status >= 400) {
        const message = response.status === 429
          ? `${label}触发上游限流（HTTP 429），已尝试 ${retryCount + 1} 次。`
          : `${label}返回 HTTP ${response.status}，已尝试 ${retryCount + 1} 次。`;
        await this.writeLog({
          level: response.status === 429 || response.status >= 500
            ? "error"
            : "warning",
          action: "upstream.request.rejected",
          message,
          label,
          input,
          method,
          statusCode: response.status,
          durationMs: Math.max(0, this.now() - startedAt),
          retryCount,
        });
      } else if (retryCount > 0) {
        await this.writeLog({
          level: "success",
          action: "upstream.request.recovered",
          message: `${label}在 ${retryCount} 次重试后成功。`,
          label,
          input,
          method,
          statusCode: response.status,
          durationMs: Math.max(0, this.now() - startedAt),
          retryCount,
        });
      }
      return result;
    }
  }
}

export function performUpstreamFetch(
  fetchImpl,
  input,
  init = {},
  {
    scheduler = null,
    timeoutMs = 15_000,
    label = "红果上游请求",
    readBody = null,
  } = {},
) {
  if (scheduler) {
    return scheduler.fetch(input, init, {
      fetchImpl,
      timeoutMs,
      label,
      readBody,
    });
  }
  return executeRequestAttempt(fetchImpl, input, init, {
    timeoutMs: normalizedInteger(timeoutMs, 15_000),
    readBody,
  });
}

export const __test = {
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MIN_INTERVAL_MS,
  executeRequestAttempt,
  retryableError,
  retryableStatus,
};
