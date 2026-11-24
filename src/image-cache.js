import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { fetchSeriesDetail } from "./hongguo.js";
import { performUpstreamFetch } from "./request-scheduler.js";

const CACHE_DIRECTORY_NAME = "covers";
const CACHE_FILE_SUFFIX = ".cover";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CACHE_HEADER_BYTES = 64 * 1024;
const MAX_REDIRECTS = 4;
const MAX_SOURCE_URL_LENGTH = 4096;
const REQUEST_TIMEOUT_MS = 15_000;
const OFFICIAL_IMAGE_HOST_SUFFIXES = Object.freeze([
  "byteimg.com",
  "fqnovelpic.com",
]);
const IMAGE_CONTENT_TYPES = Object.freeze({
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});

function imageCacheError(message, code, statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function hostMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function isOfficialImageHost(hostname) {
  const normalizedHostname = String(hostname || "").toLowerCase();
  return OFFICIAL_IMAGE_HOST_SUFFIXES.some((suffix) =>
    hostMatchesSuffix(normalizedHostname, suffix),
  );
}

function normalizeImageUrl(value) {
  const text = String(value || "").trim();
  if (!text || text.length > MAX_SOURCE_URL_LENGTH) {
    throw imageCacheError("封面地址格式不正确。", "INVALID_COVER_URL", 400);
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    throw imageCacheError("封面地址格式不正确。", "INVALID_COVER_URL", 400);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !isOfficialImageHost(url.hostname)
  ) {
    throw imageCacheError(
      "只允许缓存红果官方 HTTPS 封面图片。",
      "COVER_HOST_NOT_ALLOWED",
      400,
    );
  }

  return url.href;
}

function normalizeSeriesId(value) {
  const seriesId = String(value || "").trim();
  return /^\d{8,25}$/.test(seriesId) ? seriesId : "";
}

function hashText(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function cacheKeyFor(sourceUrl, seriesId) {
  return seriesId ? `series-${seriesId}` : hashText(sourceUrl);
}

function cachePathFor(cacheDirectory, cacheKey) {
  return path.join(cacheDirectory, `${cacheKey}${CACHE_FILE_SUFFIX}`);
}

function encodeCacheFile({ image, metadata }) {
  const header = Buffer.from(JSON.stringify(metadata), "utf8");
  const headerLength = Buffer.allocUnsafe(4);
  headerLength.writeUInt32BE(header.length, 0);
  return Buffer.concat([headerLength, header, image]);
}

function decodeCacheFile(content) {
  if (!Buffer.isBuffer(content) || content.length < 5) {
    throw new Error("缓存文件内容不完整。");
  }
  const headerLength = content.readUInt32BE(0);
  if (
    headerLength <= 0 ||
    headerLength > MAX_CACHE_HEADER_BYTES ||
    headerLength + 4 >= content.length
  ) {
    throw new Error("缓存文件头无效。");
  }

  let metadata;
  try {
    metadata = JSON.parse(
      content.subarray(4, headerLength + 4).toString("utf8"),
    );
  } catch {
    throw new Error("缓存文件头无法解析。");
  }

  const image = content.subarray(headerLength + 4);
  const contentType = String(metadata?.contentType || "");
  if (
    !image.length ||
    image.length > MAX_IMAGE_BYTES ||
    !Object.values(IMAGE_CONTENT_TYPES).includes(contentType)
  ) {
    throw new Error("缓存图片内容无效。");
  }

  return {
    image,
    contentType,
    cachedAt: String(metadata.cachedAt || ""),
    sourceUrl: String(metadata.sourceUrl || ""),
  };
}

async function readResponseBody(response, maxBytes) {
  if (!response.ok) {
    try {
      await response.body?.cancel?.();
    } catch {
      // Error response bodies are not needed.
    }
    return null;
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    try {
      await response.body?.cancel?.();
    } catch {
      // The oversized response is no longer needed.
    }
    throw imageCacheError(
      "封面图片超过 5 MB，已停止缓存。",
      "COVER_TOO_LARGE",
      413,
    );
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw imageCacheError(
        "封面图片超过 5 MB，已停止缓存。",
        "COVER_TOO_LARGE",
        413,
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function downloadImage(
  initialUrl,
  {
    fetchImpl,
    requestScheduler = null,
    timeoutMs,
    maxRedirects = MAX_REDIRECTS,
    maxBytes = MAX_IMAGE_BYTES,
  } = {},
) {
  let currentUrl = normalizeImageUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let result;
    try {
      result = await performUpstreamFetch(
        fetchImpl,
        currentUrl,
        {
          redirect: "manual",
          headers: {
            accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "accept-language": "zh-CN,zh;q=0.9",
            referer: "https://hongguoduanju.com/",
            "user-agent":
              "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
          },
        },
        {
          scheduler: requestScheduler,
          timeoutMs,
          label: "红果封面图片",
          readBody: (response) => readResponseBody(response, maxBytes),
          priority: -1,
        },
      );
    } catch (error) {
      if (error?.statusCode) {
        throw error;
      }
      if (error?.name === "AbortError") {
        throw imageCacheError(
          "下载封面图片超时，请稍后重试。",
          "COVER_REQUEST_TIMEOUT",
          504,
        );
      }
      throw imageCacheError(
        `无法下载封面图片：${error?.message || "网络请求失败"}`,
        "COVER_REQUEST_FAILED",
      );
    }

    const response = result.response;
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === maxRedirects) {
        throw imageCacheError(
          "封面图片跳转次数过多。",
          "COVER_REDIRECT_FAILED",
        );
      }
      try {
        currentUrl = normalizeImageUrl(new URL(location, currentUrl).href);
      } catch {
        throw imageCacheError(
          "封面图片跳转到了非官方地址。",
          "COVER_REDIRECT_NOT_ALLOWED",
        );
      }
      continue;
    }

    if (!response.ok || !result.body) {
      throw imageCacheError(
        `封面图片请求失败（HTTP ${response.status}）。`,
        "COVER_UPSTREAM_ERROR",
        response.status === 404 ? 404 : 502,
      );
    }
    return {
      image: result.body,
      sourceUrl: currentUrl,
    };
  }

  throw imageCacheError("封面图片跳转次数过多。", "COVER_REDIRECT_FAILED");
}

async function inspectImage(image) {
  if (!Buffer.isBuffer(image) || !image.length || image.length > MAX_IMAGE_BYTES) {
    throw imageCacheError(
      "下载内容不是有效图片。",
      "COVER_NOT_IMAGE",
      415,
    );
  }

  let metadata;
  try {
    metadata = await sharp(image, {
      failOn: "error",
      limitInputPixels: 100_000_000,
    }).metadata();
  } catch {
    throw imageCacheError(
      "下载内容不是浏览器支持的图片。",
      "COVER_NOT_IMAGE",
      415,
    );
  }

  const contentType = IMAGE_CONTENT_TYPES[metadata?.format];
  if (!contentType || !metadata.width || !metadata.height) {
    throw imageCacheError(
      "下载内容不是浏览器支持的图片。",
      "COVER_NOT_IMAGE",
      415,
    );
  }

  return {
    contentType,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
  };
}

export class ImageCache {
  constructor({
    dataDir,
    cacheDir = null,
    fetchImpl = globalThis.fetch,
    requestScheduler = null,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxBytes = MAX_IMAGE_BYTES,
    now = () => new Date(),
    resolveSeriesCover = null,
  } = {}) {
    if (!dataDir && !cacheDir) {
      throw new Error("封面缓存需要数据目录。");
    }
    this.cacheDir =
      cacheDir || path.join(path.resolve(dataDir), CACHE_DIRECTORY_NAME);
    this.fetchImpl = fetchImpl;
    this.requestScheduler = requestScheduler;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.now = now;
    this.resolveSeriesCover = resolveSeriesCover;
    this.inflight = new Map();
  }

  async resolveCoverForSeries(seriesId) {
    if (this.resolveSeriesCover) {
      return this.resolveSeriesCover(seriesId);
    }
    const { detail } = await fetchSeriesDetail(seriesId, {
      fetchImpl: this.fetchImpl,
      requestScheduler: this.requestScheduler,
      timeoutMs: this.timeoutMs,
      requestPriority: -1,
    });
    return detail.coverUrl;
  }

  async readCached(cachePath) {
    let content;
    try {
      content = await fs.readFile(cachePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    try {
      const cached = decodeCacheFile(content);
      return {
        ...cached,
        etag: hashText(cached.image),
        cacheHit: true,
      };
    } catch {
      return null;
    }
  }

  async writeCached(cachePath, cached) {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = path.join(
      path.dirname(cachePath),
      `.${path.basename(cachePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const payload = encodeCacheFile(cached);
    let handle;
    try {
      handle = await fs.open(temporaryPath, "wx", 0o600);
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close();
      handle = null;
      await fs.rename(temporaryPath, cachePath);
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
      }
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  async fetchAndStore({ sourceUrl, seriesId, cachePath }) {
    let lastError = null;
    let resolvedSourceUrl = sourceUrl;

    if (sourceUrl) {
      try {
        const downloaded = await downloadImage(sourceUrl, {
          fetchImpl: this.fetchImpl,
          requestScheduler: this.requestScheduler,
          timeoutMs: this.timeoutMs,
          maxBytes: this.maxBytes,
        });
        resolvedSourceUrl = downloaded.sourceUrl;
        const inspected = await inspectImage(downloaded.image);
        const cached = {
          image: downloaded.image,
          metadata: {
            contentType: inspected.contentType,
            format: inspected.format,
            width: inspected.width,
            height: inspected.height,
            sourceUrl: resolvedSourceUrl,
            cachedAt: this.now().toISOString(),
          },
        };
        await this.writeCached(cachePath, cached);
        return {
          image: cached.image,
          contentType: inspected.contentType,
          cachedAt: cached.metadata.cachedAt,
          sourceUrl: resolvedSourceUrl,
          etag: hashText(cached.image),
          cacheHit: false,
        };
      } catch (error) {
        lastError = error;
      }
    }

    if (seriesId) {
      try {
        const detailCoverUrl = normalizeImageUrl(
          await this.resolveCoverForSeries(seriesId),
        );
        const downloaded = await downloadImage(detailCoverUrl, {
          fetchImpl: this.fetchImpl,
          requestScheduler: this.requestScheduler,
          timeoutMs: this.timeoutMs,
          maxBytes: this.maxBytes,
        });
        resolvedSourceUrl = downloaded.sourceUrl;
        const inspected = await inspectImage(downloaded.image);
        const cached = {
          image: downloaded.image,
          metadata: {
            contentType: inspected.contentType,
            format: inspected.format,
            width: inspected.width,
            height: inspected.height,
            sourceUrl: resolvedSourceUrl,
            cachedAt: this.now().toISOString(),
          },
        };
        await this.writeCached(cachePath, cached);
        return {
          image: cached.image,
          contentType: inspected.contentType,
          cachedAt: cached.metadata.cachedAt,
          sourceUrl: resolvedSourceUrl,
          etag: hashText(cached.image),
          cacheHit: false,
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ||
      imageCacheError("无法获取封面图片。", "COVER_FETCH_FAILED")
    );
  }

  async get({ url = "", seriesId = "", refresh = false } = {}) {
    const normalizedSeriesId = normalizeSeriesId(seriesId);
    let sourceUrl = "";
    try {
      sourceUrl = normalizeImageUrl(url);
    } catch (error) {
      if (!normalizedSeriesId) {
        throw error;
      }
    }
    if (!sourceUrl && !normalizedSeriesId) {
      throw imageCacheError(
        "缺少封面地址或剧集 ID。",
        "COVER_SOURCE_REQUIRED",
        400,
      );
    }

    const cacheKey = cacheKeyFor(sourceUrl, normalizedSeriesId);
    const cachePath = cachePathFor(this.cacheDir, cacheKey);
    if (!refresh) {
      const cached = await this.readCached(cachePath);
      if (cached) {
        return cached;
      }
    }

    const existingTask = this.inflight.get(cacheKey);
    if (existingTask) {
      return existingTask;
    }

    const task = this.fetchAndStore({
      sourceUrl,
      seriesId: normalizedSeriesId,
      cachePath,
    }).finally(() => {
      this.inflight.delete(cacheKey);
    });
    this.inflight.set(cacheKey, task);
    return task;
  }
}

export const __test = {
  CACHE_DIRECTORY_NAME,
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  decodeCacheFile,
  encodeCacheFile,
  normalizeImageUrl,
};
