import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_NAME,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from "./src/constants.js";
import { AccountService } from "./src/account.js";
import { AccountSyncService } from "./src/account-sync.js";
import { ReminderService } from "./src/monitor.js";
import { UpstreamRequestScheduler } from "./src/request-scheduler.js";
import { ScreenshotImportService } from "./src/screenshot-import.js";
import { SystemLogStore } from "./src/system-log.js";
import {
  SqliteStateStore,
  databaseFileForStateFile,
} from "./src/store.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MAX_JSON_BYTES = 64 * 1024;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_ACCOUNT_IMPORT_SERIES = 20;
const STATIC_FILES = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/logs", { file: "logs.html", type: "text/html; charset=utf-8" }],
  ["/logs.html", { file: "logs.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  [
    "/theme.js",
    { file: "theme.js", type: "text/javascript; charset=utf-8" },
  ],
  [
    "/app.js",
    { file: "app.js", type: "text/javascript; charset=utf-8" },
  ],
  [
    "/logs.js",
    { file: "logs.js", type: "text/javascript; charset=utf-8" },
  ],
  [
    "/pwa.js",
    { file: "pwa.js", type: "text/javascript; charset=utf-8" },
  ],
  [
    "/sw.js",
    { file: "sw.js", type: "text/javascript; charset=utf-8" },
  ],
  [
    "/manifest.webmanifest",
    {
      file: "manifest.webmanifest",
      type: "application/manifest+json; charset=utf-8",
    },
  ],
  [
    "/assets/panda-drama-assistant-icon.svg",
    { file: "assets/panda-drama-assistant-icon.svg", type: "image/svg+xml" },
  ],
  [
    "/assets/panda-drama-assistant-icon.png",
    { file: "assets/panda-drama-assistant-icon.png", type: "image/png" },
  ],
  [
    "/assets/pwa-icon-192.png",
    { file: "assets/pwa-icon-192.png", type: "image/png" },
  ],
  [
    "/assets/pwa-icon-512.png",
    { file: "assets/pwa-icon-512.png", type: "image/png" },
  ],
  [
    "/assets/pwa-icon-maskable-512.png",
    { file: "assets/pwa-icon-maskable-512.png", type: "image/png" },
  ],
  [
    "/assets/apple-touch-icon.png",
    { file: "assets/apple-touch-icon.png", type: "image/png" },
  ],
]);

function securityHeaders(contentType) {
  // Codex's built-in browser annotation overlay injects an unstamped style
  // element into HTML pages, so only document responses allow inline styles.
  const inlineStyleSource = contentType.startsWith("text/html")
    ? " 'unsafe-inline'"
    : "";
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
    "content-security-policy":
      `default-src 'self'; img-src 'self' data: blob: https:; style-src 'self'${inlineStyleSource}; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    ...securityHeaders("application/json; charset=utf-8"),
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendLogFile(response, statusCode, file) {
  const content = Buffer.isBuffer(file.content)
    ? file.content
    : Buffer.from(file.content, "utf8");
  const fileName = String(file.fileName || "hongguo-events-all.jsonl")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  response.writeHead(statusCode, {
    ...securityHeaders("text/plain; charset=utf-8"),
    "cache-control": "no-store",
    "content-disposition": `inline; filename="${fileName}"`,
    "content-length": content.length,
  });
  response.end(content);
}

function sendPng(response, statusCode, content) {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  response.writeHead(statusCode, {
    ...securityHeaders("image/png"),
    "cache-control": "no-store",
    "content-length": buffer.length,
  });
  response.end(buffer);
}

function sendError(response, error) {
  const statusCode =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;
  if (statusCode >= 500) {
    console.error(error);
  }
  response.writeHead(statusCode, {
    ...securityHeaders("application/json; charset=utf-8"),
    "cache-control": "no-store",
    ...(error?.retryAfterSeconds
      ? { "retry-after": String(error.retryAfterSeconds) }
      : {}),
  });
  response.end(
    JSON.stringify({
      error: {
        code: error?.code || "INTERNAL_ERROR",
        message:
          statusCode >= 500 && !error?.statusCode
            ? "服务处理失败，请稍后重试。"
            : error?.message || "请求处理失败。",
        ...(error?.retryAfterSeconds
          ? { retryAfterSeconds: error.retryAfterSeconds }
          : {}),
      },
    }),
  );
}

async function readJsonBody(request) {
  const contentType = String(request.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    const error = new Error("请求必须使用 application/json。");
    error.statusCode = 415;
    error.code = "UNSUPPORTED_MEDIA_TYPE";
    throw error;
  }

  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > MAX_JSON_BYTES) {
    const error = new Error("请求内容过大。");
    error.statusCode = 413;
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        settled = true;
        const error = new Error("请求内容过大。");
        error.statusCode = 413;
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        const error = new Error("JSON 请求格式不正确。");
        error.statusCode = 400;
        error.code = "INVALID_JSON";
        reject(error);
      }
    });

    request.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });
  });
}

async function readBinaryBody(request, maxBytes) {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > maxBytes) {
    request.resume();
    const error = new Error("截图文件不能超过 8 MB。");
    error.statusCode = 413;
    error.code = "IMAGE_TOO_LARGE";
    throw error;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        const error = new Error("截图文件不能超过 8 MB。");
        error.statusCode = 413;
        error.code = "IMAGE_TOO_LARGE";
        reject(error);
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks));
    });

    request.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });
  });
}

async function serveStatic(pathname, response) {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) {
    return false;
  }

  const filePath = path.resolve(PUBLIC_DIR, entry.file);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    return false;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      ...securityHeaders(entry.type),
      "cache-control": "no-cache",
      "content-length": content.length,
      ...(pathname === "/sw.js"
        ? { "service-worker-allowed": "/" }
        : {}),
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function subscriptionRoute(pathname) {
  const match = pathname.match(
    /^\/api\/subscriptions\/([^/]+)(?:\/(seasons|check|watched|status|reminder|tracking))?$/,
  );
  if (!match) {
    return null;
  }
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] || null,
  };
}

function accountLoginRoute(pathname) {
  const match = pathname.match(
    /^\/api\/account\/login\/([^/]+)(?:\/(qrcode))?$/,
  );
  if (!match) {
    return null;
  }
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] || null,
  };
}

function accountSmsLoginRoute(pathname) {
  const match = pathname.match(
    /^\/api\/account\/sms-login\/([^/]+)(?:\/(send-code|verify))?$/,
  );
  if (!match) {
    return null;
  }
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] || null,
  };
}

function smsLoginRequest(body) {
  const countryCode = String(body?.countryCode ?? "86")
    .trim()
    .replace(/^\+/, "");
  const mobile = String(body?.mobile ?? "").trim();
  if (!countryCode || !mobile) {
    const error = new Error("请填写手机号和区号。");
    error.statusCode = 400;
    error.code = "ACCOUNT_SMS_MOBILE_REQUIRED";
    throw error;
  }
  return { countryCode, mobile };
}

function smsVerificationCode(body) {
  const code = String(body?.code ?? "").trim();
  if (!code) {
    const error = new Error("请填写短信验证码。");
    error.statusCode = 400;
    error.code = "ACCOUNT_SMS_CODE_REQUIRED";
    throw error;
  }
  return code;
}

function accountImportSeriesIds(value) {
  if (!Array.isArray(value) || value.length === 0) {
    const error = new Error("请至少选择一部要导入的短剧。");
    error.statusCode = 400;
    error.code = "ACCOUNT_IMPORT_EMPTY";
    throw error;
  }
  if (value.length > MAX_ACCOUNT_IMPORT_SERIES) {
    const error = new Error(
      `一次最多导入 ${MAX_ACCOUNT_IMPORT_SERIES} 部短剧。`,
    );
    error.statusCode = 400;
    error.code = "ACCOUNT_IMPORT_LIMIT";
    throw error;
  }
  const seriesIds = [];
  for (const item of value) {
    const seriesId = String(item ?? "").trim();
    if (!/^\d{1,30}$/.test(seriesId) || seriesId === "0") {
      const error = new Error("账号导入的剧集 ID 格式不正确。");
      error.statusCode = 400;
      error.code = "ACCOUNT_IMPORT_INVALID_ID";
      throw error;
    }
    if (!seriesIds.includes(seriesId)) {
      seriesIds.push(seriesId);
    }
  }
  return seriesIds;
}

function importResultMessage(result) {
  const parts = [`已导入 ${result.importedCount} 部`];
  if (result.skippedCount) {
    parts.push(`跳过 ${result.skippedCount} 部重复项`);
  }
  if (result.failedCount) {
    parts.push(`${result.failedCount} 部失败`);
  }
  if (result.checkErrors) {
    parts.push(`${result.checkErrors} 个系列暂未完成最新季检查`);
  }
  return `${parts.join("，")}。`;
}

function accountSyncTrigger(value, fallback = "manual") {
  if (value === undefined) {
    return fallback;
  }
  if (!["login", "manual", "cron"].includes(value)) {
    const error = new Error(
      "账号同步触发类型必须是 login、manual 或 cron。",
    );
    error.statusCode = 400;
    error.code = "INVALID_ACCOUNT_SYNC_TRIGGER";
    throw error;
  }
  return value;
}

async function recordSystemLog(systemLog, entry) {
  if (!systemLog) {
    return;
  }
  try {
    await systemLog.append(entry);
  } catch (error) {
    console.error(
      `系统操作日志写入失败：${error?.message || "未知错误"}`,
    );
  }
}

async function recordImportOutcomes(systemLog, result, source) {
  const sourceLabel = source === "account" ? "红果账号" : "截图";
  for (const outcome of result?.outcomes || []) {
    const title = outcome.title || "未命名短剧";
    const level =
      outcome.status === "failed"
        ? "error"
        : outcome.status === "skipped"
          ? "warning"
          : "success";
    const actionLabel = {
      imported: "导入",
      skipped: "跳过",
      failed: "导入失败",
    }[outcome.status] || "处理";
    await recordSystemLog(systemLog, {
      category: "subscription",
      action: `subscription.import.${outcome.status || "unknown"}`,
      level,
      message: `从${sourceLabel}${actionLabel}《${title}》：${outcome.message || importResultMessage(result)}`,
      metadata: {
        subscriptionId: outcome.subscriptionId || null,
        seriesId: outcome.seriesId || null,
      },
    });
  }
}

function accountDisplayName(profile) {
  return String(profile?.name || "").trim();
}

function loggedSettingsFields(body) {
  const labels = {
    notifications: "通知渠道",
    notificationTemplates: "通知模板",
    checkCron: "自动检查计划",
    intervalMinutes: "检查间隔",
    staleCompletionDays: "自动停更期限",
    episodeNotificationWindowMinutes: "更新提醒汇总窗口",
    discoveryReminderDurationMinutes: "持续提醒时长",
    discoveryReminderCron: "持续提醒频率",
    accountSyncCron: "账号同步计划",
  };
  return Object.keys(body || {})
    .map((key) => labels[key] || key)
    .filter(Boolean);
}

export function createRequestHandler(
  service,
  screenshotImport,
  eventLog,
  systemLog,
  accountService,
  accountSyncService,
) {
  return async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/api/logs") {
        const offset = Math.max(
          0,
          Number.parseInt(url.searchParams.get("offset") || "0", 10) ||
            0,
        );
        const requestedLimit =
          Number.parseInt(url.searchParams.get("limit") || "200", 10) ||
          200;
        const limit = Math.min(500, Math.max(1, requestedLimit));
        const page = await eventLog.readPage({ offset, limit });
        sendJson(response, 200, {
          ok: true,
          ...page,
          offset,
          limit,
          hasMore: offset + page.events.length < page.total,
          nextOffset:
            offset + page.events.length < page.total
              ? offset + page.events.length
              : null,
          storage: {
            policy: "daily-size",
            maxFileBytes: page.maxFileBytes,
            retentionDays: page.retentionDays,
            timeZone: page.timeZone,
          },
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/logs/file") {
        const file = await eventLog.readAllFiles();
        if (!file) {
          sendLogFile(response, 404, {
            fileName: "hongguo-events-all.jsonl",
            content: "暂无日志记录。\n",
          });
          return;
        }
        sendLogFile(response, 200, file);
        return;
      }

      if (
        request.method === "GET" &&
        pathname === "/api/system-logs"
      ) {
        const offset = Math.max(
          0,
          Number.parseInt(url.searchParams.get("offset") || "0", 10) ||
            0,
        );
        const requestedLimit =
          Number.parseInt(url.searchParams.get("limit") || "200", 10) ||
          200;
        const limit = Math.min(500, Math.max(1, requestedLimit));
        const page = await systemLog.readPage({ offset, limit });
        sendJson(response, 200, {
          ok: true,
          ...page,
          offset,
          limit,
          hasMore: offset + page.entries.length < page.total,
          nextOffset:
            offset + page.entries.length < page.total
              ? offset + page.entries.length
              : null,
          storage: {
            policy: "daily-size",
            maxFileBytes: page.maxFileBytes,
            retentionDays: page.retentionDays,
            timeZone: page.timeZone,
          },
        });
        return;
      }

      if (
        request.method === "GET" &&
        pathname === "/api/system-logs/file"
      ) {
        const file = await systemLog.readAllFiles();
        if (!file) {
          sendLogFile(response, 404, {
            fileName: "hongguo-system-actions-all.jsonl",
            content: "暂无系统操作日志。\n",
          });
          return;
        }
        sendLogFile(response, 200, file);
        return;
      }

      if (request.method === "GET" && pathname === "/api/state") {
        sendJson(response, 200, await service.getDashboard());
        return;
      }

      if (
        request.method === "GET" &&
        pathname === "/api/account/status"
      ) {
        sendJson(response, 200, {
          ok: true,
          account: accountService.status(),
          sync: await accountSyncService.status(),
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/account/login"
      ) {
        const login = await accountService.createLogin();
        await recordSystemLog(systemLog, {
          category: "account",
          action: "account.login.qr-created",
          message: "已生成红果账号扫码登录二维码。",
        });
        sendJson(response, 201, {
          ok: true,
          login,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/account/sms-login"
      ) {
        const body = await readJsonBody(request);
        const login = await accountService.createSmsLogin(
          smsLoginRequest(body),
        );
        await recordSystemLog(systemLog, {
          category: "account",
          action: "account.login.sms-started",
          message: "已创建红果账号短信登录会话。",
        });
        sendJson(response, 201, {
          ok: true,
          login,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/account/logout"
      ) {
        const account = await accountService.logout();
        await recordSystemLog(systemLog, {
          category: "account",
          action: "account.logout",
          message: "已退出红果账号，后续将停止账号同步。",
        });
        sendJson(response, 200, {
          ok: true,
          account,
          message: "已退出红果账号。",
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/account/refresh"
      ) {
        const account = await accountService.refresh();
        await recordSystemLog(systemLog, {
          category: "account",
          action: "account.snapshot.refreshed",
          message: `已刷新红果账号收藏和预约${
            accountDisplayName(account.profile)
              ? `（${accountDisplayName(account.profile)}）`
              : ""
          }。`,
        });
        sendJson(response, 200, {
          ok: true,
          account,
          message: "账号收藏和预约已刷新。",
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/account/sync"
      ) {
        const body = await readJsonBody(request);
        const result = await accountSyncService.sync({
          trigger: accountSyncTrigger(body.trigger),
        });
        sendJson(response, 200, {
          ok: true,
          result,
          account: accountService.status(),
          sync: await accountSyncService.status(),
          message: result.message,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/account/import"
      ) {
        const body = await readJsonBody(request);
        const seriesIds = accountImportSeriesIds(body.seriesIds);
        const result = await screenshotImport.importSeriesIds(
          seriesIds,
          service,
        );
        await recordImportOutcomes(systemLog, result, "account");
        sendJson(response, 200, {
          ok: true,
          result,
          message: importResultMessage(result),
        });
        return;
      }

      const accountLogin = accountLoginRoute(pathname);
      if (accountLogin) {
        if (request.method === "GET" && accountLogin.action === null) {
          const login = await accountService.pollLogin(accountLogin.id);
          if (login.status === "succeeded") {
            await recordSystemLog(systemLog, {
              category: "account",
              action: "account.login.qr-succeeded",
              level: "success",
              message: `红果账号扫码登录成功${
                accountDisplayName(login.profile)
                  ? `：${accountDisplayName(login.profile)}`
                  : ""
              }。`,
            });
          } else if (login.status === "expired") {
            await recordSystemLog(systemLog, {
              category: "account",
              action: "account.login.qr-expired",
              level: "warning",
              message: "红果账号扫码登录二维码已失效。",
            });
          } else if (login.status === "failed") {
            await recordSystemLog(systemLog, {
              category: "account",
              action: "account.login.qr-failed",
              level: "error",
              message: `红果账号扫码登录失败：${
                login.error || "登录未完成"
              }`,
            });
          }
          sendJson(response, 200, {
            ok: true,
            login,
          });
          return;
        }
        if (
          request.method === "GET" &&
          accountLogin.action === "qrcode"
        ) {
          const qrCode = accountService.getLoginQr(accountLogin.id);
          sendPng(response, 200, qrCode);
          return;
        }
        if (
          request.method === "DELETE" &&
          accountLogin.action === null
        ) {
          const result = await accountService.cancelLogin(accountLogin.id);
          await recordSystemLog(systemLog, {
            category: "account",
            action: "account.login.qr-cancelled",
            message: "已取消红果账号扫码登录。",
          });
          sendJson(response, 200, {
            ok: true,
            result,
          });
          return;
        }
      }

      const accountSmsLogin = accountSmsLoginRoute(pathname);
      if (accountSmsLogin) {
        if (request.method === "GET" && accountSmsLogin.action === null) {
          const login = await accountService.pollSmsLogin(accountSmsLogin.id);
          if (login.status === "succeeded") {
            await recordSystemLog(systemLog, {
              category: "account",
              action: "account.login.sms-succeeded",
              level: "success",
              message: `红果账号短信登录成功${
                accountDisplayName(login.profile)
                  ? `：${accountDisplayName(login.profile)}`
                  : ""
              }。`,
            });
          } else if (
            login.status === "expired" ||
            login.status === "failed"
          ) {
            await recordSystemLog(systemLog, {
              category: "account",
              action: "account.login.sms-failed",
              level: login.status === "failed" ? "error" : "warning",
              message:
                login.status === "expired"
                  ? "红果账号短信登录会话已过期。"
                  : `红果账号短信登录失败：${
                      login.error || "登录未完成"
                    }`,
            });
          }
          sendJson(response, 200, {
            ok: true,
            login,
          });
          return;
        }
        if (
          request.method === "POST" &&
          accountSmsLogin.action === "send-code"
        ) {
          await readJsonBody(request);
          const login = await accountService.sendSmsCode(accountSmsLogin.id);
          await recordSystemLog(systemLog, {
            category: "account",
            action: "account.login.sms-code-sent",
            message: "已请求发送红果账号短信验证码。",
          });
          sendJson(response, 200, {
            ok: true,
            login,
          });
          return;
        }
        if (
          request.method === "POST" &&
          accountSmsLogin.action === "verify"
        ) {
          const body = await readJsonBody(request);
          const login = await accountService.verifySmsCode(
            accountSmsLogin.id,
            smsVerificationCode(body),
          );
          await recordSystemLog(systemLog, {
            category: "account",
            action: "account.login.sms-verified",
            message: "短信验证码已提交，正在确认红果账号登录。",
          });
          sendJson(response, 200, {
            ok: true,
            login,
          });
          return;
        }
        if (
          request.method === "DELETE" &&
          accountSmsLogin.action === null
        ) {
          const result = await accountService.cancelSmsLogin(
            accountSmsLogin.id,
          );
          await recordSystemLog(systemLog, {
            category: "account",
            action: "account.login.sms-cancelled",
            message: "已取消红果账号短信登录。",
          });
          sendJson(response, 200, {
            ok: true,
            result,
          });
          return;
        }
      }

      if (
        request.method === "GET" &&
        pathname === "/api/series/search"
      ) {
        const query = url.searchParams.get("query") || "";
        const results = await screenshotImport.search(query);
        sendJson(response, 200, {
          ok: true,
          results,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/screenshot-import/warmup"
      ) {
        const result = await screenshotImport.warmup();
        sendJson(response, 200, {
          ok: true,
          result,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/screenshot-import/analyze"
      ) {
        const image = await readBinaryBody(
          request,
          MAX_SCREENSHOT_BYTES,
        );
        const result = await screenshotImport.analyze(
          image,
          String(request.headers["content-type"] || ""),
        );
        await recordSystemLog(systemLog, {
          category: "screenshot",
          action: "screenshot.analyzed",
          level: result.items?.length ? "success" : "warning",
          message: `截图识别完成：找到 ${result.items?.length || 0} 部短剧候选。`,
          metadata: {
            itemCount: result.items?.length || 0,
            imageBytes: image.length,
          },
        });
        sendJson(response, 200, {
          ok: true,
          ...result,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/screenshot-import/import"
      ) {
        const body = await readJsonBody(request);
        const result = await screenshotImport.importSeriesIds(
          body.seriesIds,
          service,
        );
        await recordImportOutcomes(systemLog, result, "screenshot");
        sendJson(response, 200, {
          ok: true,
          result,
          message: importResultMessage(result),
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/subscriptions") {
        const body = await readJsonBody(request);
        const input = body.input ?? body.shareText ?? "";
        const result = await service.addSubscription(input);
        await recordSystemLog(systemLog, {
          category: "subscription",
          action:
            result.action === "season_added"
              ? "subscription.season.added"
              : "subscription.created",
          level: "success",
          message:
            result.action === "season_added"
              ? `已把《${result.seasonTitle}》加入《${result.title}》系列。`
              : `已开始追更《${result.title}》，当前 ${result.episodeCount} 集。`,
          metadata: {
            subscriptionId: result.subscriptionId,
            seriesId: result.seasonId,
          },
        });
        let discoveryResult = null;
        let discoveryError = null;
        try {
          discoveryResult = await service.checkSubscription(
            result.subscriptionId,
            {
              notify: false,
              discover: true,
              forceDiscovery: true,
              markUnread: false,
            },
          );
        } catch (error) {
          discoveryError =
            error?.message || "官方多季列表核验失败，稍后会自动重试。";
        }
        if (!discoveryError) {
          discoveryError =
            discoveryResult?.discoveryError ||
            (discoveryResult?.errors > 0
              ? `${discoveryResult.errors} 个季度暂未检查成功，稍后会自动重试。`
              : null);
        }
        const actualSeasonCopy =
          result.seasonTitle && result.seasonTitle !== result.title
            ? `，本次加入《${result.seasonTitle}》`
            : "";
        const baseMessage =
          result.action === "season_added"
            ? `已把《${result.seasonTitle}》加入《${result.title}》系列。`
            : `已开始追更《${result.title}》${actualSeasonCopy}，当前 ${result.episodeCount} 集。`;
        sendJson(response, 201, {
          ok: true,
          result: {
            ...result,
            discoveryCompleted: !discoveryError,
            discoveryError,
          },
          message: discoveryError
            ? `${baseMessage} 官方多季列表暂未补全，稍后会自动重试。`
            : baseMessage,
        });
        return;
      }

      if (request.method === "PATCH" && pathname === "/api/settings") {
        const body = await readJsonBody(request);
        const settings = await service.updateSettings(body);
        if (Object.hasOwn(body, "accountSyncCron")) {
          await accountSyncService.updateSettings({
            accountSyncCron: body.accountSyncCron,
          });
        }
        const changedFields = loggedSettingsFields(body);
        await recordSystemLog(systemLog, {
          category: "settings",
          action: "settings.updated",
          level: "success",
          message: changedFields.length
            ? `已保存设置：${changedFields.join("、")}。`
            : "已保存设置。",
          metadata: {
            fields: changedFields.join(","),
          },
        });
        sendJson(response, 200, {
          ok: true,
          settings,
          message: "设置已保存。",
        });
        return;
      }

      if (
        request.method === "POST" &&
        (pathname === "/api/notifications/test" ||
          pathname === "/api/bark/test")
      ) {
        await readJsonBody(request);
        const result = await service.sendTestNotification();
        await recordSystemLog(systemLog, {
          category: "notification",
          action: "notification.test",
          level: result.ok ? "success" : "warning",
          message: result.ok
            ? "测试通知发送成功。"
            : `测试通知未完全发送：${result.message}`,
        });
        sendJson(response, 200, {
          ok: result.ok,
          result,
          message: result.message,
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/check") {
        await readJsonBody(request);
        const result = await service.checkAll({
          notify: true,
          discover: true,
          forceDiscovery: true,
        });
        const skippedCompleted = result.skippedCompleted || 0;
        const skippedInactive = result.skippedInactive || 0;
        const skippedPaused = result.skippedPaused || 0;
        const checkedSubscriptions =
          result.checkedSubscriptions ??
          Math.max(
            0,
            result.subscriptions -
              skippedCompleted -
              skippedInactive -
              skippedPaused,
          );
        const checkMessage =
          result.subscriptions === 0
            ? "当前还没有追更条目。"
            : checkedSubscriptions === 0 &&
                (skippedCompleted > 0 ||
                  skippedInactive > 0 ||
                  skippedPaused > 0)
              ? `没有需要检查的系列：${[
                  skippedCompleted ? `${skippedCompleted} 个已完结` : "",
                  skippedInactive
                    ? `${skippedInactive} 个今天已核验停更`
                    : "",
                  skippedPaused ? `${skippedPaused} 个已暂停` : "",
                ]
                  .filter(Boolean)
                  .join("、")}已跳过。`
              : `检查完成：${result.seasonsChecked} 个季，${result.updatedSeasons} 个有新更新。${
                  skippedCompleted > 0
                    ? ` 已跳过 ${skippedCompleted} 个已完结系列。`
                    : ""
                }${
                  skippedInactive > 0
                    ? ` 已跳过 ${skippedInactive} 个今天已完成停更核验的系列。`
                    : ""
                }${
                  skippedPaused > 0
                    ? ` 已跳过 ${skippedPaused} 个暂停追更系列。`
                    : ""
                }`;
        sendJson(response, 200, {
          ok: true,
          result,
          message: checkMessage,
        });
        return;
      }

      const subRoute = subscriptionRoute(pathname);
      if (subRoute) {
        if (
          request.method === "DELETE" &&
          subRoute.action === null
        ) {
          const result = await service.removeSubscription(subRoute.id);
          await accountSyncService.queueRemoteDeletion(
            result.subscription,
          );
          await recordSystemLog(systemLog, {
            category: "subscription",
            action: "subscription.removed",
            level: "warning",
            message: `已删除《${result.title}》追更，并安排从红果账号移除对应收藏和预约。`,
            metadata: {
              subscriptionId: result.id,
            },
          });
          sendJson(response, 200, {
            ok: true,
            result,
            message: `已删除《${result.title}》。`,
          });
          return;
        }

        if (
          request.method === "POST" &&
          subRoute.action === "seasons"
        ) {
          const body = await readJsonBody(request);
          const input = body.input ?? body.shareText ?? "";
          const result = await service.addSeason(subRoute.id, input);
          await recordSystemLog(systemLog, {
            category: "subscription",
            action: "subscription.season.added",
            level: "success",
            message: `已把《${result.seasonTitle}》加入《${result.title}》系列。`,
            metadata: {
              subscriptionId: result.subscriptionId,
              seriesId: result.seasonId,
            },
          });
          sendJson(response, 201, {
            ok: true,
            result,
            message: `已把《${result.seasonTitle}》加入《${result.title}》系列。`,
          });
          return;
        }

        if (request.method === "POST" && subRoute.action === "check") {
          await readJsonBody(request);
          const result = await service.checkSubscription(subRoute.id, {
            notify: true,
            discover: true,
            forceDiscovery: true,
            forceCompletedCheck: true,
          });
          const skippedMessage =
            result.skipped === "completed"
              ? "该系列已完结，已跳过检查。"
              : result.skipped === "inactive"
                ? "该系列今天已完成停更核验，已跳过本次自动检查。"
              : null;
          sendJson(response, 200, {
            ok: true,
            result,
            message:
              skippedMessage ||
              (result.autoInactive
                ? "检查完成：系列超过无更新期限，已转为停更；系统每天会自动核验一次。"
                : null) ||
              (result.reactivatedFromInactive
                ? "检查完成：发现新更新，系列已从停更恢复为未完结。"
                : null) ||
              (result.reactivatedFromCompleted
                ? "强制检查完成：发现新更新，系列已从已完结恢复为未完结。"
                : null) ||
              (result.errors > 0
                ? `检查完成，但有 ${result.errors} 个季失败。`
                : `检查完成：${result.updatedSeasons} 个剧集有新更新。`),
          });
          return;
        }

        if (
          request.method === "PATCH" &&
          subRoute.action === "status"
        ) {
          const body = await readJsonBody(request);
          if (
            !Object.hasOwn(body, "status") ||
            ![
              null,
              "auto",
              "updating",
              "completed",
              "unknown",
            ].includes(body.status)
          ) {
            const error = new Error(
              "系列状态必须是自动判断、更新中、已完结或状态未知。",
            );
            error.statusCode = 400;
            error.code = "INVALID_SERIES_STATUS";
            throw error;
          }
          const result = await service.updateSubscriptionStatus(
            subRoute.id,
            body.status,
          );
          await recordSystemLog(systemLog, {
            category: "subscription",
            action: "subscription.status.updated",
            message: `已调整《${result.title}》的系列状态。`,
            metadata: {
              subscriptionId: result.id,
              status: result.seriesStatusOverride || "auto",
            },
          });
          const message =
            result.seriesStatusOverride === "completed"
              ? `已将《${result.title}》标记为已完结，已停止检查。`
              : result.seriesStatusOverride === "updating"
                ? `已将《${result.title}》标记为更新中，将继续检查。`
                : result.seriesStatusOverride === "unknown"
                  ? `已将《${result.title}》标记为状态未知，将继续检查。`
                  : `已将《${result.title}》恢复为自动判断系列状态。`;
          sendJson(response, 200, {
            ok: true,
            result,
            message,
          });
          return;
        }

        if (
          request.method === "PATCH" &&
          subRoute.action === "tracking"
        ) {
          const body = await readJsonBody(request);
          const paused =
            typeof body?.paused === "boolean"
              ? body.paused
              : typeof body?.trackingPaused === "boolean"
                ? body.trackingPaused
                : null;
          if (paused === null) {
            const error = new Error("停止追更状态必须是布尔值。");
            error.statusCode = 400;
            error.code = "INVALID_TRACKING_STATE";
            throw error;
          }
          const result = await service.setSubscriptionTrackingState(
            subRoute.id,
            paused,
          );
          await recordSystemLog(systemLog, {
            category: "subscription",
            action: paused
              ? "subscription.tracking.paused"
              : "subscription.tracking.resumed",
            level: paused ? "warning" : "success",
            message: paused
              ? `已停止追更《${result.title}》。`
              : `已恢复追更《${result.title}》。`,
            metadata: {
              subscriptionId: result.id,
            },
          });
          sendJson(response, 200, {
            ok: true,
            result,
            message: paused
              ? `已停止追更《${result.title}》，自动检查将跳过该系列。`
              : `已恢复追更《${result.title}》。`,
          });
          return;
        }

        if (request.method === "POST" && subRoute.action === "watched") {
          const body = await readJsonBody(request);
          const watched = body?.watched !== false;
          const result = watched
            ? await service.markSubscriptionWatched(subRoute.id)
            : await service.markSubscriptionUnwatched(subRoute.id);
          await recordSystemLog(systemLog, {
            category: "subscription",
            action: watched
              ? "subscription.marked-watched"
              : "subscription.marked-unwatched",
            message: watched
              ? `已将《${result.title}》标记为已观看。`
              : `已将《${result.title}》恢复为有更新。`,
            metadata: {
              subscriptionId: result.id,
            },
          });
          sendJson(response, 200, {
            ok: true,
            result,
            message: watched
              ? `已将《${result.title}》标记为已观看。`
              : `已将《${result.title}》恢复为有更新。`,
          });
          return;
        }

        if (request.method === "POST" && subRoute.action === "reminder") {
          const body = await readJsonBody(request);
          const requestedMode =
            typeof body?.mode === "string"
              ? body.mode
              : typeof body?.enabled === "boolean"
                ? body.enabled
                  ? "enabled"
                  : "disabled"
                : null;
          if (
            requestedMode === null ||
            !["enabled", "muted", "disabled"].includes(requestedMode)
          ) {
            const error = new Error(
              "提醒状态必须为 enabled、muted 或 disabled。",
            );
            error.statusCode = 400;
            error.code = "INVALID_REMINDER_STATE";
            throw error;
          }
          const result = await service.setSubscriptionReminderState(
            subRoute.id,
            requestedMode,
          );
          await recordSystemLog(systemLog, {
            category: "subscription",
            action: "subscription.reminder.updated",
            message: `已把《${result.title}》的提醒状态调整为${
              {
                enabled: "开启",
                muted: "本次不再提醒",
                disabled: "长期关闭",
              }[requestedMode]
            }。`,
            metadata: {
              subscriptionId: result.id,
              mode: requestedMode,
            },
          });
          const message = {
            enabled: `已开启《${result.title}》的更新提醒。`,
            muted: `已关闭《${result.title}》本次更新的提醒，下次更新会自动恢复。`,
            disabled: `已长期关闭《${result.title}》的更新提醒，有更新状态会保留。`,
          }[requestedMode];
          sendJson(response, 200, {
            ok: true,
            result,
            message,
          });
          return;
        }
      }

      if (request.method === "GET" && (await serveStatic(pathname, response))) {
        return;
      }

      if (pathname.startsWith("/api/")) {
        const error = new Error("接口不存在。");
        error.statusCode = 404;
        error.code = "NOT_FOUND";
        throw error;
      }

      const error = new Error("页面不存在。");
      error.statusCode = 404;
      error.code = "NOT_FOUND";
      throw error;
    } catch (error) {
      if (!response.headersSent) {
        sendError(response, error);
      } else {
        response.destroy();
      }
    }
  };
}

export async function createApplication({
  stateFile,
  databaseFile,
  screenshotImport = null,
  accountService = null,
  accountSyncService = null,
  requestScheduler = null,
} = {}) {
  const legacyStateFile = path.resolve(
    stateFile ||
      process.env.HONGUO_STATE_FILE ||
      path.join(ROOT_DIR, "data", "state.json"),
  );
  const sqliteDatabaseFile = path.resolve(
    databaseFile ||
      process.env.HONGUO_DATABASE_FILE ||
      databaseFileForStateFile(legacyStateFile),
  );
  if (legacyStateFile === sqliteDatabaseFile) {
    throw new Error("旧版 state.json 与 SQLite 数据库不能使用同一路径。");
  }

  const store = new SqliteStateStore(sqliteDatabaseFile, {
    legacyStateFile,
  });
  await store.init();
  const systemLog = new SystemLogStore(
    path.join(path.dirname(sqliteDatabaseFile), "system-logs"),
  );
  await systemLog.init();
  const resolvedRequestScheduler =
    requestScheduler ||
    new UpstreamRequestScheduler({
      maxConcurrency: 2,
      minIntervalMs: 250,
      maxRetries: 3,
      logger: (entry) => systemLog.append(entry),
    });
  const resolvedScreenshotImport =
    screenshotImport ||
    new ScreenshotImportService({
      requestScheduler: resolvedRequestScheduler,
    });
  const resolvedAccountService =
    accountService ||
    new AccountService({
      dataDir: path.dirname(sqliteDatabaseFile),
      requestScheduler: resolvedRequestScheduler,
    });
  await resolvedAccountService.start();
  const service = new ReminderService({
    store,
    systemLog,
    requestScheduler: resolvedRequestScheduler,
  });
  const resolvedAccountSyncService =
    accountSyncService ||
    new AccountSyncService({
      store,
      accountService: resolvedAccountService,
      reminderService: service,
      screenshotImport: resolvedScreenshotImport,
      systemLog,
    });
  const server = http.createServer(
    createRequestHandler(
      service,
      resolvedScreenshotImport,
      store.eventLog,
      systemLog,
      resolvedAccountService,
      resolvedAccountSyncService,
    ),
  );
  return {
    store,
    service,
    screenshotImport: resolvedScreenshotImport,
    accountService: resolvedAccountService,
    accountSyncService: resolvedAccountSyncService,
    eventLog: store.eventLog,
    systemLog,
    requestScheduler: resolvedRequestScheduler,
    server,
    stateFile: legacyStateFile,
    databaseFile: sqliteDatabaseFile,
  };
}

async function main() {
  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const {
    store,
    service,
    screenshotImport,
    accountService,
    accountSyncService,
    server,
    databaseFile,
  } = await createApplication();

  server.on("error", (error) => {
    console.error(`服务启动失败：${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, async () => {
    await service.start();
    await accountSyncService.start();
    console.log(
      `${APP_NAME}已启动：http://${host}:${port}（SQLite：${databaseFile}）`,
    );
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    service.stop();
    accountSyncService.stop();
    await accountService.stop();
    await screenshotImport.stop();
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
