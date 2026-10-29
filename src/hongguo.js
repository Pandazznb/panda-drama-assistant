import {
  ALLOWED_SHARE_HOST_SUFFIXES,
  OFFICIAL_DETAIL_URL,
  OFFICIAL_WEB_URL,
  SERIES_STATUS,
} from "./constants.js";
import {
  normalizeWhitespace,
  parseTimestamp,
  toSafeInteger,
} from "./utils.js";

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_ALBUM_RESPONSE_BYTES = 512 * 1024;
const MAX_SEARCH_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 18_000;
const ALBUM_REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_REQUEST_TIMEOUT_MS = 12_000;
const MAX_SEARCH_QUERY_LENGTH = 30;
const OFFICIAL_SEARCH_URL = `${OFFICIAL_WEB_URL}/api/search/result/`;
const OFFICIAL_ALBUM_FIELDS_URL =
  "https://api5-normal-sinfonlineb.fqnovel.com/reading/distribution/book_pack_fields/inner_feed_detail/v1/";
const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const DEEP_LINK_PATTERN = /dragon8662:\/\/[^\s<>"']+/i;

export class HongguoError extends Error {
  constructor(message, code = "HONGGUO_ERROR", statusCode = 400) {
    super(message);
    this.name = "HongguoError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isAllowedShareHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  return ALLOWED_SHARE_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function extractSeriesId(input) {
  const text = String(input || "").trim();
  if (!text) {
    return null;
  }

  if (/^\d{8,25}$/.test(text)) {
    return text;
  }

  const decodedVariants = [text];
  try {
    const decoded = decodeURIComponent(text);
    if (decoded !== text) {
      decodedVariants.push(decoded);
    }
  } catch {
    // A malformed percent escape should not prevent direct ID extraction.
  }

  for (const candidate of decodedVariants) {
    const queryMatch = candidate.match(
      /(?:series_id|video_series_id|seriesId)=([0-9]{8,25})/i,
    );
    if (queryMatch) {
      return queryMatch[1];
    }

    const playerMatch = candidate.match(/\/(?:player|detail)\/([0-9]{8,25})/i);
    if (playerMatch) {
      return playerMatch[1];
    }
  }

  return null;
}

export function extractAnimationSeriesId(input) {
  let parsed;
  try {
    parsed = new URL(String(input || "").trim());
  } catch {
    return null;
  }

  if (!/\/video-animation-share\/?$/.test(parsed.pathname)) {
    return null;
  }

  const videoId = parsed.searchParams.get("video_id");
  return /^\d{8,25}$/.test(videoId || "") ? videoId : null;
}

export function extractSharedUrl(input) {
  const text = String(input || "").trim();
  if (!text) {
    return null;
  }

  const match =
    text.match(HTTP_URL_PATTERN) ||
    text.match(DEEP_LINK_PATTERN);
  return match ? match[0].replace(/[),.;，。；]+$/, "") : null;
}

function assertAllowedSharedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new HongguoError("分享链接格式不正确。", "INVALID_URL");
  }

  if (parsed.protocol === "dragon8662:") {
    return parsed;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HongguoError("仅支持 http 或 https 分享链接。", "INVALID_PROTOCOL");
  }

  if (!isAllowedShareHost(parsed.hostname)) {
    throw new HongguoError(
      "出于安全考虑，只请求红果及其官方分享域名。",
      "HOST_NOT_ALLOWED",
    );
  }

  return parsed;
}

async function readLimitedBody(response, maxBytes = MAX_HTML_BYTES) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new HongguoError("红果页面响应过大，已停止读取。", "RESPONSE_TOO_LARGE");
  }

  if (!response.body) {
    return "";
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
      throw new HongguoError("红果页面响应过大，已停止读取。", "RESPONSE_TOO_LARGE");
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

async function fetchWithSafeRedirects(
  initialUrl,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
  } = {},
) {
  let currentUrl = initialUrl;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const parsed = assertAllowedSharedUrl(currentUrl);
    if (parsed.protocol === "dragon8662:") {
      return { response: null, finalUrl: currentUrl, html: "" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(parsed.href, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "zh-CN,zh;q=0.9",
          "user-agent":
            "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
        },
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new HongguoError("请求红果超时，请稍后重试。", "REQUEST_TIMEOUT", 504);
      }
      throw new HongguoError(
        `无法连接红果：${error.message}`,
        "REQUEST_FAILED",
        502,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new HongguoError("分享链接跳转缺少目标地址。", "INVALID_REDIRECT", 502);
      }
      currentUrl = new URL(location, parsed).href;
      redirects += 1;
      continue;
    }

    if (!response.ok) {
      throw new HongguoError(
        response.status === 404
          ? "红果页面不存在，请检查分享链接。"
          : `红果返回 HTTP ${response.status}。`,
        "UPSTREAM_HTTP_ERROR",
        502,
      );
    }

    const html = await readLimitedBody(response);
    return { response, finalUrl: parsed.href, html };
  }

  throw new HongguoError("分享链接跳转次数过多。", "TOO_MANY_REDIRECTS", 502);
}

export function decodeHtmlEntities(text) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: "\u00a0",
    quot: '"',
  };

  return String(text).replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match, decimal, hexadecimal, name) => {
      if (decimal) {
        return String.fromCodePoint(Number(decimal));
      }
      if (hexadecimal) {
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      }
      return named[name.toLowerCase()] ?? match;
    },
  );
}

export function extractBalancedJson(html, anchor) {
  const source = String(html || "");
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex === -1) {
    return null;
  }

  const start = source.indexOf("{", anchorIndex + anchor.length);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(start, index + 1));
      }
    }
  }

  return null;
}

function extractDataAttribute(html, attributeName) {
  const source = String(html || "");
  const marker = `${attributeName}="`;
  const start = source.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const valueStart = start + marker.length;
  const valueEnd = source.indexOf('"', valueStart);
  if (valueEnd === -1) {
    return null;
  }
  return decodeHtmlEntities(source.slice(valueStart, valueEnd));
}

function recursivelyParseJsonStrings(value, results = []) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      trimmed.length > 2 &&
      trimmed.length < MAX_HTML_BYTES &&
      ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))) &&
      trimmed.includes("series_id")
    ) {
      try {
        recursivelyParseJsonStrings(JSON.parse(trimmed), results);
      } catch {
        // Recommendation data is optional; malformed nested JSON is ignored.
      }
    }
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      recursivelyParseJsonStrings(item, results);
    }
    return results;
  }

  if (value && typeof value === "object") {
    results.push(value);
    for (const nested of Object.values(value)) {
      recursivelyParseJsonStrings(nested, results);
    }
  }

  return results;
}

export function extractRecommendations(html) {
  const decodedArgs = extractDataAttribute(html, "data-fn-args");
  if (!decodedArgs) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(decodedArgs);
  } catch {
    return [];
  }

  const objects = recursivelyParseJsonStrings(parsed);
  const recommendations = new Map();

  for (const object of objects) {
    const seriesId = String(object.series_id ?? object.seriesId ?? "");
    const title = normalizeWhitespace(
      object.series_name ?? object.seriesName ?? object.title ?? "",
    );
    if (!/^\d{8,25}$/.test(seriesId) || !title) {
      continue;
    }

    recommendations.set(seriesId, {
      seriesId,
      title,
      coverUrl: String(object.series_cover ?? object.cover ?? ""),
      episodeCount: toSafeInteger(
        object.episode_cnt ?? object.series_episode_info?.episode_cnt,
        0,
      ),
    });
  }

  return [...recommendations.values()];
}

function dataError(message, code = "DETAIL_DATA_INVALID") {
  return new HongguoError(message, code, 502);
}

export function parseSeriesDetailHtml(html) {
  let routerData;
  try {
    routerData = extractBalancedJson(html, "_ROUTER_DATA");
  } catch (error) {
    throw dataError(`详情页数据无法解析：${error.message}`);
  }

  const detailPage = routerData?.loaderData?.detail_page;
  const series = detailPage?.seriesDetail;
  if (!detailPage?.isSuccess || !series?.series_id) {
    throw dataError("未从红果页面找到剧集信息。", "SERIES_NOT_FOUND");
  }

  return normalizeSeriesDetail(series);
}

export function normalizeSeriesDetail(series) {
  const episodeInfo = series.series_episode_info || {};
  const episodeCount = toSafeInteger(
    series.episode_cnt ?? episodeInfo.episode_cnt,
    0,
  );
  const totalEpisodeCount = toSafeInteger(
    episodeInfo.episode_total_cnt ?? episodeCount,
    episodeCount,
  );
  const rawStatus = Number(series.series_status ?? episodeInfo.series_status);
  const status =
    rawStatus === 0
      ? SERIES_STATUS.UPDATING
      : rawStatus === 1
        ? SERIES_STATUS.COMPLETED
        : SERIES_STATUS.UNKNOWN;

  const firstVisibleTimestamp = parseTimestamp(series.first_visible_time);
  return {
    seriesId: String(series.series_id),
    seriesGroupId: series.season_info?.series_group_id
      ? String(series.season_info.series_group_id)
      : null,
    title: normalizeWhitespace(series.series_name || "未命名短剧"),
    coverUrl: String(series.series_cover || ""),
    intro: normalizeWhitespace(series.series_intro || ""),
    tags: Array.isArray(series.tags)
      ? series.tags.map((tag) => normalizeWhitespace(tag)).filter(Boolean)
      : [],
    episodeCount,
    totalEpisodeCount,
    accessibleEpisodeCount: toSafeInteger(series.accessible_episode_cnt, 0),
    status,
    rightText: normalizeWhitespace(series.episode_right_text || ""),
    firstVisibleTime: firstVisibleTimestamp
      ? new Date(firstVisibleTimestamp).toISOString()
      : null,
    detailUrl: `${OFFICIAL_DETAIL_URL}${encodeURIComponent(series.series_id)}`,
  };
}

export async function fetchSeriesDetail(
  seriesId,
  { fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  if (!/^\d{8,25}$/.test(String(seriesId))) {
    throw new HongguoError("剧集 ID 格式不正确。", "INVALID_SERIES_ID");
  }

  const url = `${OFFICIAL_DETAIL_URL}${encodeURIComponent(seriesId)}`;
  const { html } = await fetchWithSafeRedirects(url, {
    fetchImpl,
    timeoutMs,
  });
  const detail = parseSeriesDetailHtml(html);

  if (detail.seriesId !== String(seriesId)) {
    throw dataError("红果返回了另一部剧集的数据。", "SERIES_ID_MISMATCH");
  }

  return {
    detail,
    recommendations: extractRecommendations(html),
  };
}

export async function fetchAlbumSeriesInfo(
  seriesId,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = ALBUM_REQUEST_TIMEOUT_MS,
  } = {},
) {
  const normalizedSeriesId = String(seriesId || "");
  if (!/^\d{8,25}$/.test(normalizedSeriesId)) {
    throw new HongguoError("剧集 ID 格式不正确。", "INVALID_SERIES_ID");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(OFFICIAL_ALBUM_FIELDS_URL, {
      method: "POST",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
      },
      // The upstream model requires a JSON number, while 19-digit IDs exceed
      // Number.MAX_SAFE_INTEGER. The ID is validated as digits before splicing.
      body: `{"book_pack_channel":"inner_feed_detail","req_ids":[${normalizedSeriesId}],"req_fields":["album_id","album_serial_count","series_in_album_order","album_series_item"]}`,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HongguoError(
        "请求红果多季列表超时。",
        "ALBUM_REQUEST_TIMEOUT",
        504,
      );
    }
    throw new HongguoError(
      `无法连接红果多季列表：${error.message}`,
      "ALBUM_REQUEST_FAILED",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new HongguoError(
      `红果多季列表返回 HTTP ${response.status}。`,
      "ALBUM_UPSTREAM_HTTP_ERROR",
      502,
    );
  }

  const body = await readLimitedBody(response, MAX_ALBUM_RESPONSE_BYTES);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new HongguoError(
      "红果多季列表数据无法解析。",
      "ALBUM_DATA_INVALID",
      502,
    );
  }

  const responseCode = Number(
    payload?.code ?? payload?.BaseResp?.StatusCode ?? 0,
  );
  if (responseCode !== 0) {
    const message = normalizeWhitespace(
      payload?.message || payload?.BaseResp?.StatusMessage || "",
    );
    throw new HongguoError(
      `红果多季列表返回错误${message ? `：${message}` : "。"}`,
      "ALBUM_API_ERROR",
      502,
    );
  }

  const albumInfo = payload?.data?.[normalizedSeriesId]?.album_info;
  if (!albumInfo || typeof albumInfo !== "object") {
    throw new HongguoError(
      "官方多季列表暂时没有返回该系列，稍后会自动重试。",
      "ALBUM_DATA_UNAVAILABLE",
      502,
    );
  }

  const seriesItems = Array.isArray(albumInfo.album_series_item)
    ? albumInfo.album_series_item
    : [];
  const publishedSeriesIds = new Set();
  const unpublishedSeriesIds = new Set();
  const unpublishedSlots = new Set();
  for (const [index, item] of seriesItems.entries()) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const candidateId = String(item.item_id || "");
    if (item.is_subscribe_shell === true) {
      unpublishedSlots.add(candidateId || `shell-${index}`);
      if (/^\d{8,25}$/.test(candidateId)) {
        unpublishedSeriesIds.add(candidateId);
      }
      continue;
    }
    if (/^\d{8,25}$/.test(candidateId)) {
      publishedSeriesIds.add(candidateId);
    }
  }

  if (!publishedSeriesIds.size) {
    throw new HongguoError(
      "红果多季列表没有可确认的已发布季度。",
      "ALBUM_DATA_INCOMPLETE",
      502,
    );
  }

  return {
    publishedSeriesIds: [...publishedSeriesIds],
    seriesIds: [...publishedSeriesIds],
    unpublishedSeriesIds: [...unpublishedSeriesIds],
    unpublishedSeasonCount: unpublishedSlots.size,
    declaredSeasonCount: toSafeInteger(
      albumInfo.album_serial_count,
      null,
    ),
    itemCount: seriesItems.length,
  };
}

export async function fetchAlbumSeriesIds(seriesId, options = {}) {
  const album = await fetchAlbumSeriesInfo(seriesId, options);
  return album.publishedSeriesIds;
}

function normalizeSearchStatus(value) {
  const status = Number(value);
  if (status === 0) {
    return SERIES_STATUS.UPDATING;
  }
  if (status === 1) {
    return SERIES_STATUS.COMPLETED;
  }
  return SERIES_STATUS.UNKNOWN;
}

export function parseOfficialSearchResults(payload) {
  const searchList = Array.isArray(payload?.searchList)
    ? payload.searchList
    : [];
  const results = new Map();

  for (const item of searchList) {
    const video = item?.video_data;
    const seriesId = String(video?.series_id || "");
    const title = normalizeWhitespace(
      video?.series_title || item?.name || "",
    );
    if (
      !video ||
      !/^\d{8,25}$/.test(seriesId) ||
      !title ||
      results.has(seriesId)
    ) {
      continue;
    }

    results.set(seriesId, {
      seriesId,
      title,
      episodeCount: toSafeInteger(video.episode_cnt, 0),
      status: normalizeSearchStatus(video.series_status),
      coverUrl: String(video.series_cover || ""),
    });
  }

  return [...results.values()];
}

export async function searchOfficialSeries(
  input,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = SEARCH_REQUEST_TIMEOUT_MS,
  } = {},
) {
  const query = normalizeWhitespace(input);
  if (!query) {
    throw new HongguoError("请输入要搜索的剧名。", "EMPTY_SEARCH_QUERY");
  }
  if ([...query].length > MAX_SEARCH_QUERY_LENGTH) {
    throw new HongguoError(
      `搜索剧名不能超过 ${MAX_SEARCH_QUERY_LENGTH} 个字符。`,
      "SEARCH_QUERY_TOO_LONG",
    );
  }

  const url = new URL(OFFICIAL_SEARCH_URL);
  url.searchParams.set("query", query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "accept-language": "zh-CN,zh;q=0.9",
        "user-agent":
          "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HongguoError(
        "搜索红果剧集超时，请稍后重试。",
        "SEARCH_REQUEST_TIMEOUT",
        504,
      );
    }
    throw new HongguoError(
      `无法连接红果搜索：${error.message}`,
      "SEARCH_REQUEST_FAILED",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new HongguoError(
      `红果搜索返回 HTTP ${response.status}。`,
      "SEARCH_UPSTREAM_HTTP_ERROR",
      502,
    );
  }

  const body = await readLimitedBody(response, MAX_SEARCH_RESPONSE_BYTES);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new HongguoError(
      "红果搜索结果无法解析。",
      "SEARCH_DATA_INVALID",
      502,
    );
  }

  return parseOfficialSearchResults(payload);
}

export async function resolveSharedSeries(input, options = {}) {
  const text = String(input || "").trim();
  if (!text) {
    throw new HongguoError("请粘贴红果分享链接或剧集 ID。", "EMPTY_INPUT");
  }

  const sharedUrl = extractSharedUrl(text);
  if (sharedUrl) {
    assertAllowedSharedUrl(sharedUrl);
  }

  const directId = extractSeriesId(text);
  if (directId) {
    return {
      seriesId: directId,
      sharedUrl: sharedUrl || "",
    };
  }

  if (!sharedUrl) {
    throw new HongguoError(
      "没有识别到分享链接或剧集 ID，请重新复制红果分享内容。",
      "SHARE_URL_NOT_FOUND",
    );
  }

  const parsed = assertAllowedSharedUrl(sharedUrl);
  const idFromUrl = extractSeriesId(parsed.href);
  if (idFromUrl) {
    return { seriesId: idFromUrl, sharedUrl: parsed.href };
  }

  const animationIdFromUrl = extractAnimationSeriesId(parsed.href);
  if (animationIdFromUrl) {
    return { seriesId: animationIdFromUrl, sharedUrl: parsed.href };
  }

  if (parsed.protocol === "dragon8662:") {
    throw new HongguoError(
      "这是 App 深链，请改用红果网页的分享链接。",
      "APP_DEEP_LINK_ONLY",
    );
  }

  const { finalUrl, html } = await fetchWithSafeRedirects(parsed.href, options);
  const redirectedId = extractSeriesId(finalUrl);
  if (redirectedId) {
    return { seriesId: redirectedId, sharedUrl: finalUrl };
  }

  const redirectedAnimationId = extractAnimationSeriesId(finalUrl);
  if (redirectedAnimationId) {
    return { seriesId: redirectedAnimationId, sharedUrl: finalUrl };
  }

  const htmlId = extractSeriesId(html);
  if (htmlId) {
    return { seriesId: htmlId, sharedUrl: finalUrl };
  }

  throw new HongguoError(
    "分享链接没有指向红果剧集详情，请打开短剧后重新分享。",
    "SERIES_ID_NOT_FOUND",
  );
}

export function officialSeriesUrl(seriesId) {
  return `${OFFICIAL_DETAIL_URL}${encodeURIComponent(seriesId)}`;
}

export function officialSeriesGroupReference(seriesGroupId) {
  return seriesGroupId
    ? `${OFFICIAL_WEB_URL}/#series-group-${encodeURIComponent(seriesGroupId)}`
    : "";
}

export const __test = {
  assertAllowedSharedUrl,
  fetchWithSafeRedirects,
  readLimitedBody,
};
