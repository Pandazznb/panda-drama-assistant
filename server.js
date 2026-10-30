import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_NAME,
  DEFAULT_HOST,
  DEFAULT_PORT,
} from "./src/constants.js";
import { ReminderService } from "./src/monitor.js";
import { ScreenshotImportService } from "./src/screenshot-import.js";
import {
  SqliteStateStore,
  databaseFileForStateFile,
} from "./src/store.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MAX_JSON_BYTES = 64 * 1024;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
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
    "/assets/panda-drama-assistant-icon.svg",
    { file: "assets/panda-drama-assistant-icon.svg", type: "image/svg+xml" },
  ],
  [
    "/assets/panda-drama-assistant-icon.png",
    { file: "assets/panda-drama-assistant-icon.png", type: "image/png" },
  ],
]);

function securityHeaders(contentType) {
  return {
    "content-type": contentType,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
    "content-security-policy":
      "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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
    /^\/api\/subscriptions\/([^/]+)(?:\/(seasons|check|watched|status|reminder))?$/,
  );
  if (!match) {
    return null;
  }
  return {
    id: decodeURIComponent(match[1]),
    action: match[2] || null,
  };
}

export function createRequestHandler(service, screenshotImport, eventLog) {
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

      if (request.method === "GET" && pathname === "/api/state") {
        sendJson(response, 200, await service.getDashboard());
        return;
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
        const messageParts = [
          `已导入 ${result.importedCount} 部`,
        ];
        if (result.skippedCount) {
          messageParts.push(`跳过 ${result.skippedCount} 部重复项`);
        }
        if (result.failedCount) {
          messageParts.push(`${result.failedCount} 部失败`);
        }
        if (result.checkErrors) {
          messageParts.push(`${result.checkErrors} 个系列暂未完成最新季检查`);
        }
        sendJson(response, 200, {
          ok: true,
          result,
          message: `${messageParts.join("，")}。`,
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/subscriptions") {
        const body = await readJsonBody(request);
        const input = body.input ?? body.shareText ?? "";
        const result = await service.addSubscription(input);
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
        const checkedSubscriptions =
          result.checkedSubscriptions ??
          Math.max(0, result.subscriptions - skippedCompleted);
        const checkMessage =
          result.subscriptions === 0
            ? "当前还没有追更条目。"
            : checkedSubscriptions === 0 && skippedCompleted > 0
              ? `没有需要检查的系列：${skippedCompleted} 个已完结系列已跳过。`
              : `检查完成：${result.seasonsChecked} 个季，${result.updatedSeasons} 个有新更新。${
                  skippedCompleted > 0
                    ? ` 已跳过 ${skippedCompleted} 个已完结系列。`
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
              : null;
          sendJson(response, 200, {
            ok: true,
            result,
            message:
              skippedMessage ||
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

        if (request.method === "POST" && subRoute.action === "watched") {
          const body = await readJsonBody(request);
          const watched = body?.watched !== false;
          const result = watched
            ? await service.markSubscriptionWatched(subRoute.id)
            : await service.markSubscriptionUnwatched(subRoute.id);
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
  screenshotImport = new ScreenshotImportService(),
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
  const service = new ReminderService({ store });
  const server = http.createServer(
    createRequestHandler(service, screenshotImport, store.eventLog),
  );
  return {
    store,
    service,
    screenshotImport,
    eventLog: store.eventLog,
    server,
    stateFile: legacyStateFile,
    databaseFile: sqliteDatabaseFile,
  };
}

async function main() {
  const host = process.env.HOST || DEFAULT_HOST;
  const port = Number(process.env.PORT || DEFAULT_PORT);
  const { store, service, screenshotImport, server, databaseFile } =
    await createApplication();

  server.on("error", (error) => {
    console.error(`服务启动失败：${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, async () => {
    await service.start();
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
