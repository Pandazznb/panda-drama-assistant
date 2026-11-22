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
import {
  performUpstreamFetch,
  retryAfterMilliseconds,
} from "./request-scheduler.js";

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_ALBUM_RESPONSE_BYTES = 512 * 1024;
const MAX_SEARCH_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 18_000;
const ALBUM_REQUEST_TIMEOUT_MS = 12_000;
const SEARCH_REQUEST_TIMEOUT_MS = 12_000;
const MAX_SEARCH_QUERY_LENGTH = 30;
const RANKING_GROUP_TYPES = ["human", "comic", "ai"];
export const RANKING_CATEGORY_TYPES = Object.freeze([
  "all",
  "comic",
  "human",
  "ai",
]);
export const RANKING_KIND_TYPES = Object.freeze([
  "hot",
  "prestige",
  "subscribe",
  "new",
  "hot-search",
  "must-watch",
  "followed",
]);
export const RANKING_AVAILABILITY = Object.freeze({
  hot: Object.freeze(["all", "comic", "human", "ai"]),
  prestige: Object.freeze(["all"]),
  subscribe: Object.freeze(["all"]),
  new: Object.freeze(["all", "comic", "human", "ai"]),
  "hot-search": Object.freeze(["all", "comic", "human", "ai"]),
  "must-watch": Object.freeze(["all", "human", "ai"]),
  followed: Object.freeze(["all", "human", "ai"]),
});
export const RANKING_ITEM_LIMIT = 50;
export const CATALOG_CONTENT_TYPES = Object.freeze(["human", "comic", "ai"]);
export const CATALOG_TOPICS = Object.freeze({
  human: Object.freeze([
    { id: "romance", name: "爱情" },
    { id: "period", name: "年代" },
    { id: "comeback", name: "逆袭" },
    { id: "legend", name: "传奇" },
    { id: "growth", name: "成长" },
    { id: "family", name: "家庭" },
    { id: "clan", name: "家族" },
    { id: "cute-kids", name: "萌宝" },
    { id: "suspense", name: "悬疑" },
    { id: "thriller", name: "惊悚" },
    { id: "horror", name: "恐怖" },
    { id: "supernatural", name: "志怪" },
    { id: "costume", name: "古装" },
    { id: "fantasy", name: "玄幻" },
    { id: "wonder", name: "奇幻" },
    { id: "urban", name: "都市" },
    { id: "youth", name: "青春" },
    { id: "comedy", name: "喜剧" },
    { id: "sci-fi", name: "科幻" },
    { id: "disaster", name: "灾难" },
    { id: "action-adventure", name: "动作冒险" },
    { id: "war", name: "战争" },
    { id: "variety", name: "综艺" },
    { id: "drama", name: "剧情" },
  ]),
  comic: Object.freeze([
    { id: "creative", name: "脑洞" },
    { id: "fantasy", name: "玄幻" },
    { id: "drama", name: "剧情" },
    { id: "apocalypse", name: "末世" },
    { id: "wealthy-family", name: "豪门" },
    { id: "wonder", name: "奇幻" },
    { id: "sci-fi", name: "科幻" },
    { id: "adventure", name: "冒险" },
  ]),
  ai: Object.freeze([
    { id: "creative", name: "脑洞" },
    { id: "fantasy", name: "玄幻" },
    { id: "drama", name: "剧情" },
    { id: "apocalypse", name: "末世" },
    { id: "wealthy-family", name: "豪门" },
    { id: "wonder", name: "奇幻" },
    { id: "sci-fi", name: "科幻" },
    { id: "adventure", name: "冒险" },
  ]),
});
const CATALOG_CONTENT_ROUTES = Object.freeze({
  human: { route: "real-drama", label: "真人剧" },
  comic: { route: "comic-drama", label: "漫剧" },
  ai: { route: "ai-drama", label: "AI剧" },
});
const OFFICIAL_SEARCH_URL = `${OFFICIAL_WEB_URL}/api/search/result/`;
const OFFICIAL_PACK_FIELDS_URL =
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

async function readSuccessfulBody(response, maxBytes) {
  if (!response.ok) {
    try {
      await response.body?.cancel?.();
    } catch {
      // Non-success response bodies are not needed by the caller.
    }
    return null;
  }
  return readLimitedBody(response, maxBytes);
}

async function fetchWithSafeRedirects(
  initialUrl,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxRedirects = MAX_REDIRECTS,
    requestScheduler = null,
    requestPriority = 0,
  } = {},
) {
  let currentUrl = initialUrl;
  let redirects = 0;

  while (redirects <= maxRedirects) {
    const parsed = assertAllowedSharedUrl(currentUrl);
    if (parsed.protocol === "dragon8662:") {
      return { response: null, finalUrl: currentUrl, html: "" };
    }

    let result;
    try {
      result = await performUpstreamFetch(
        fetchImpl,
        parsed.href,
        {
          redirect: "manual",
          headers: {
            accept: "text/html,application/xhtml+xml",
            "accept-language": "zh-CN,zh;q=0.9",
            "user-agent":
              "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
          },
        },
        {
          scheduler: requestScheduler,
          timeoutMs,
          label: "红果分享链接",
          priority: requestPriority,
          readBody: (response) => readSuccessfulBody(response),
        },
      );
    } catch (error) {
      if (error?.upstreamBodyRead) {
        throw error;
      }
      if (error?.name === "AbortError") {
        throw new HongguoError("请求红果超时，请稍后重试。", "REQUEST_TIMEOUT", 504);
      }
      throw new HongguoError(
        `无法连接红果：${error.message}`,
        "REQUEST_FAILED",
        502,
      );
    }
    const response = result.response;

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
      const rateLimited = response.status === 429;
      const error = new HongguoError(
        response.status === 404
          ? "红果页面不存在，请检查分享链接。"
          : rateLimited
            ? "红果请求过于频繁，请稍后重试。"
            : `红果返回 HTTP ${response.status}。`,
        rateLimited ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_HTTP_ERROR",
        rateLimited ? 429 : 502,
      );
      const retryAfterMs = retryAfterMilliseconds(response);
      if (rateLimited && retryAfterMs !== null) {
        error.retryAfterSeconds = Math.max(
          1,
          Math.ceil(retryAfterMs / 1_000),
        );
      }
      throw error;
    }

    const html = result.body;
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
  const status = normalizeSeriesStatus(
    series.series_status ?? episodeInfo.series_status,
  );

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

function normalizeSeriesStatus(value) {
  const rawStatus = Number(value);
  if (rawStatus === 0) {
    return SERIES_STATUS.UPDATING;
  }
  if (rawStatus === 1) {
    return SERIES_STATUS.COMPLETED;
  }
  return SERIES_STATUS.UNKNOWN;
}

function normalizeRankingCoverUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function parseOfficialRankings(routerData) {
  let data = routerData;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }

  const sections = data?.loaderData?.page?.homeSections;
  if (!Array.isArray(sections)) {
    throw dataError(
      "官网榜单数据暂时无法解析，请稍后重试。",
      "RANKINGS_DATA_INVALID",
    );
  }

  const groups = Object.fromEntries(
    RANKING_GROUP_TYPES.map((type) => [type, []]),
  );
  for (const section of sections) {
    const type = normalizeWhitespace(section?.tab_type).toLowerCase();
    if (!RANKING_GROUP_TYPES.includes(type)) {
      continue;
    }

    const seenSeriesIds = new Set();
    const items = Array.isArray(section?.video_list)
      ? section.video_list
      : [];
    for (const [index, item] of items.entries()) {
      const seriesId = String(item?.series_id || "");
      if (
        !/^\d{8,25}$/.test(seriesId) ||
        seenSeriesIds.has(seriesId)
      ) {
        continue;
      }
      seenSeriesIds.add(seriesId);

      const rank = toSafeInteger(item.rank, index + 1);
      groups[type].push({
        seriesId,
        title: normalizeWhitespace(item.series_title || "未命名短剧"),
        coverUrl: normalizeRankingCoverUrl(item.series_cover),
        episodeCount: toSafeInteger(item.episode_cnt, 0),
        rightText: normalizeWhitespace(item.episode_right_text || ""),
        status: normalizeSeriesStatus(item.series_status),
        categories: (Array.isArray(item.category_list)
          ? item.category_list
          : []
        )
          .map((category) => normalizeWhitespace(category?.name || ""))
          .filter(Boolean)
          .slice(0, 3),
        rank: rank > 0 ? rank : index + 1,
        detailUrl: `${OFFICIAL_DETAIL_URL}${encodeURIComponent(seriesId)}`,
      });
    }
  }

  if (!RANKING_GROUP_TYPES.some((type) => groups[type].length)) {
    throw dataError(
      "官网暂未返回可展示的榜单内容。",
      "RANKINGS_EMPTY",
    );
  }
  return groups;
}

export function resolveOfficialRankingPath(category = "all", type = "hot") {
  const normalizedCategory = String(category || "").trim().toLowerCase();
  const normalizedType = String(type || "").trim().toLowerCase();
  if (!RANKING_CATEGORY_TYPES.includes(normalizedCategory)) {
    throw new HongguoError(
      "红果榜单分类不正确。",
      "INVALID_RANKING_CATEGORY",
      400,
    );
  }
  if (!RANKING_KIND_TYPES.includes(normalizedType)) {
    throw new HongguoError(
      "红果榜单类型不正确。",
      "INVALID_RANKING_TYPE",
      400,
    );
  }
  if (!RANKING_AVAILABILITY[normalizedType].includes(normalizedCategory)) {
    throw new HongguoError(
      "红果官方暂未提供这个榜单分类。",
      "RANKING_COMBINATION_UNAVAILABLE",
      404,
    );
  }

  const categorySegment =
    normalizedCategory === "all"
      ? ""
      : normalizedCategory === "human"
        ? "real-"
        : `${normalizedCategory}-`;
  return `/rank/${normalizedType}-${categorySegment}drama`;
}

function normalizeRankingDetailUrl(value, seriesId) {
  try {
    const url = new URL(String(value || ""), OFFICIAL_WEB_URL);
    if (url.origin === new URL(OFFICIAL_WEB_URL).origin) {
      return url.href;
    }
  } catch {
    // Fall back to the canonical detail URL below.
  }
  return `${OFFICIAL_DETAIL_URL}${encodeURIComponent(seriesId)}`;
}

function normalizeCatalogTopics(selectorList) {
  if (!Array.isArray(selectorList)) {
    return [];
  }

  const topics = new Map();
  for (const selector of selectorList) {
    const items = Array.isArray(selector?.items) ? selector.items : [];
    for (const item of items) {
      const id = normalizeWhitespace(item?.selector_item_id || "");
      const name = normalizeWhitespace(item?.show_name || "");
      if (!id || !name) {
        continue;
      }
      topics.set(id, {
        id,
        name,
        categoryIds: (Array.isArray(item?.category_json_ids)
          ? item.category_json_ids
          : []
        )
          .map((categoryId) => String(categoryId || "").trim())
          .filter(Boolean),
      });
    }
  }
  return [...topics.values()];
}

function findCatalogPageData(routerData) {
  const loaderData = routerData?.loaderData;
  if (!loaderData || typeof loaderData !== "object") {
    return null;
  }

  if (loaderData["category_$"]) {
    return loaderData["category_$"];
  }
  for (const [key, value] of Object.entries(loaderData)) {
    if (
      key.startsWith("category") &&
      value &&
      typeof value === "object" &&
      Array.isArray(value.recommendList)
    ) {
      return value;
    }
  }
  return null;
}

export function parseOfficialCatalogPage(routerData) {
  let data = routerData;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }

  const page = findCatalogPageData(data);
  if (!page || page.isSuccess === false || !Array.isArray(page.recommendList)) {
    throw dataError(
      "官网分类数据暂时无法解析，请稍后重试。",
      "CATALOG_DATA_INVALID",
    );
  }

  const pageSize = Math.max(
    1,
    toSafeInteger(page.pagination?.pageSize, 24),
  );
  const pageNum = Math.max(1, toSafeInteger(page.pagination?.pageNum, 1));
  const seenSeriesIds = new Set();
  const items = [];
  for (const [index, series] of page.recommendList.entries()) {
    const seriesId = String(series?.series_id || "");
    if (!/^\d{8,25}$/.test(seriesId) || seenSeriesIds.has(seriesId)) {
      continue;
    }
    seenSeriesIds.add(seriesId);

    const episodeInfo = series?.series_episode_info || {};
    const episodeCount = toSafeInteger(
      series?.episode_cnt ?? episodeInfo.episode_cnt,
      0,
    );
    const totalEpisodeCount = Math.max(
      episodeCount,
      toSafeInteger(episodeInfo.episode_total_cnt, episodeCount),
    );
    items.push({
      seriesId,
      title: normalizeWhitespace(series?.series_name || "未命名短剧"),
      coverUrl: normalizeRankingCoverUrl(series?.series_cover),
      intro: normalizeWhitespace(series?.series_intro || ""),
      tags: [
        ...new Set(
          (Array.isArray(series?.tags) ? series.tags : [])
            .map((tag) => normalizeWhitespace(tag))
            .filter(Boolean),
        ),
      ].slice(0, 12),
      episodeCount,
      totalEpisodeCount,
      accessibleEpisodeCount: toSafeInteger(
        series?.accessible_episode_cnt,
        0,
      ),
      status: normalizeSeriesStatus(
        episodeInfo.series_status ?? series?.series_status,
      ),
      rightText: normalizeWhitespace(series?.episode_right_text || ""),
      officialRank: (pageNum - 1) * pageSize + index + 1,
      detailUrl: `${OFFICIAL_DETAIL_URL}${encodeURIComponent(seriesId)}`,
    });
  }

  if (!items.length) {
    throw dataError(
      "官网暂未返回这个分类下可展示的短剧。",
      "CATALOG_EMPTY",
    );
  }

  const total = Math.max(
    items.length,
    toSafeInteger(page.pagination?.total, items.length),
  );
  return {
    contentType: normalizeWhitespace(page.categoryRoute?.displayName || ""),
    contentTypeKey: normalizeWhitespace(
      page.categoryRoute?.contentType || "",
    ),
    canonicalUrl: normalizeRankingDetailUrl(
      page.canonicalUrl,
      items[0].seriesId,
    ),
    topics: normalizeCatalogTopics(page.selectorList),
    items,
    pageNum,
    pageSize,
    total,
    totalPages: Math.max(
      pageNum,
      toSafeInteger(page.pagination?.totalPages, pageNum),
    ),
  };
}

export function resolveOfficialCatalogPath(contentType = "human") {
  const normalizedContentType = String(contentType || "")
    .trim()
    .toLowerCase();
  if (!CATALOG_CONTENT_TYPES.includes(normalizedContentType)) {
    throw new HongguoError(
      "红果内容类型不正确。",
      "INVALID_CATALOG_CONTENT_TYPE",
      400,
    );
  }
  return `/category/${CATALOG_CONTENT_ROUTES[normalizedContentType].route}`;
}

export function parseOfficialRankingPage(routerData) {
  let data = routerData;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }

  const loaderData = data?.loaderData;
  if (!loaderData || typeof loaderData !== "object") {
    throw dataError(
      "官网榜单数据暂时无法解析，请稍后重试。",
      "RANKINGS_DATA_INVALID",
    );
  }

  let page = null;
  for (const [key, value] of Object.entries(loaderData)) {
    if (key === "rank_layout" || !value || typeof value !== "object") {
      continue;
    }
    const candidate =
      value.page && typeof value.page === "object" ? value.page : value;
    if (Array.isArray(candidate?.content?.rankList)) {
      page = candidate;
      break;
    }
  }
  if (!page) {
    throw dataError(
      "官网榜单数据暂时无法解析，请稍后重试。",
      "RANKINGS_DATA_INVALID",
    );
  }

  const rankList = page.content.rankList;
  const seenSeriesIds = new Set();
  const items = [];
  for (const [index, item] of rankList.entries()) {
    const seriesId = String(item?.seriesId || item?.id || "");
    if (!/^\d{8,25}$/.test(seriesId) || seenSeriesIds.has(seriesId)) {
      continue;
    }
    seenSeriesIds.add(seriesId);

    const episodeCount = toSafeInteger(item?.episodeCount, 0);
    const openEpisodeCount = toSafeInteger(item?.openEpisodeCount, 0);
    const reservationOnly = item?.reservationOnly === true;
    const tags = [
      ...(Array.isArray(item?.tags) ? item.tags : []),
      ...(Array.isArray(item?.statusTags) ? item.statusTags : []),
    ]
      .map((tag) => normalizeWhitespace(tag))
      .filter(Boolean);
    const categories = tags.filter(
      (tag) => !["真人剧", "漫剧", "AI剧"].includes(tag),
    );
    const rank = toSafeInteger(item?.rank, index + 1);

    items.push({
      seriesId,
      title: normalizeWhitespace(item?.title || "未命名短剧"),
      coverUrl: normalizeRankingCoverUrl(item?.cover),
      episodeCount,
      openEpisodeCount,
      rightText:
        episodeCount > 0
          ? `共 ${episodeCount} 集`
          : reservationOnly
            ? "待上线"
            : "",
      metricText: normalizeWhitespace(item?.primaryMetricText || ""),
      categories: [...new Set(categories)].slice(0, 3),
      statusTags: [
        ...new Set(
          (Array.isArray(item?.statusTags) ? item.statusTags : [])
            .map((tag) => normalizeWhitespace(tag))
            .filter(Boolean),
        ),
      ].slice(0, 3),
      reservationOnly,
      rank: rank > 0 ? rank : index + 1,
      detailUrl: normalizeRankingDetailUrl(item?.href, seriesId),
    });
  }

  if (!items.length) {
    throw dataError(
      "官网暂未返回可展示的榜单内容。",
      "RANKINGS_EMPTY",
    );
  }

  return {
    items,
    updatedText: normalizeWhitespace(page.updatedText || ""),
    pageNum: toSafeInteger(page.pageNum, 1),
    totalPages: toSafeInteger(page.content?.pagination?.totalPages, 1),
    canonicalUrl: normalizeRankingDetailUrl(
      page.canonicalUrl,
      items[0].seriesId,
    ),
  };
}

export async function fetchOfficialRanking(
  {
    category = "all",
    type = "hot",
    limit = RANKING_ITEM_LIMIT,
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    requestScheduler = null,
  } = {},
) {
  const path = resolveOfficialRankingPath(category, type);
  const itemLimit = Math.max(
    1,
    Math.min(RANKING_ITEM_LIMIT, toSafeInteger(limit, RANKING_ITEM_LIMIT)),
  );
  const items = [];
  const seenSeriesIds = new Set();
  let updatedText = "";
  let totalPages = 1;
  let maxPages = 1;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pageUrl =
      pageNumber === 1
        ? `${OFFICIAL_WEB_URL}${path}`
        : `${OFFICIAL_WEB_URL}${path}?page=${pageNumber}`;
    const { html } = await fetchWithSafeRedirects(pageUrl, {
      fetchImpl,
      timeoutMs,
      requestScheduler,
    });

    let routerData;
    try {
      routerData = extractBalancedJson(html, "_ROUTER_DATA");
    } catch (error) {
      throw dataError(
        `官网榜单数据无法解析：${error.message}`,
        "RANKINGS_DATA_INVALID",
      );
    }
    if (!routerData) {
      throw dataError(
        "官网榜单数据暂时无法解析，请稍后重试。",
        "RANKINGS_DATA_INVALID",
      );
    }

    const page = parseOfficialRankingPage(routerData);
    if (pageNumber === 1) {
      totalPages = Math.max(1, page.totalPages);
      maxPages = Math.max(
        1,
        Math.min(totalPages, Math.ceil(itemLimit / page.items.length)),
      );
      updatedText = page.updatedText;
    }

    for (const item of page.items) {
      if (seenSeriesIds.has(item.seriesId)) {
        continue;
      }
      seenSeriesIds.add(item.seriesId);
      items.push(item);
      if (items.length >= itemLimit) {
        break;
      }
    }
    if (items.length >= itemLimit) {
      break;
    }
  }

  return {
    category: String(category),
    type: String(type),
    updatedText,
    items: items.slice(0, itemLimit),
  };
}

export async function fetchOfficialCatalogPage(
  {
    contentType = "human",
    page = 1,
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    requestScheduler = null,
  } = {},
) {
  const path = resolveOfficialCatalogPath(contentType);
  const pageNumber = Math.max(1, toSafeInteger(page, 1));
  const pageUrl =
    pageNumber === 1
      ? `${OFFICIAL_WEB_URL}${path}`
      : `${OFFICIAL_WEB_URL}${path}?page=${pageNumber}`;
  const { html } = await fetchWithSafeRedirects(pageUrl, {
    fetchImpl,
    timeoutMs,
    requestScheduler,
  });

  let routerData;
  try {
    routerData = extractBalancedJson(html, "_ROUTER_DATA");
  } catch (error) {
    throw dataError(
      `官网分类数据无法解析：${error.message}`,
      "CATALOG_DATA_INVALID",
    );
  }
  if (!routerData) {
    throw dataError(
      "官网分类数据暂时无法解析，请稍后重试。",
      "CATALOG_DATA_INVALID",
    );
  }

  const parsed = parseOfficialCatalogPage(routerData);
  if (parsed.pageNum !== pageNumber) {
    throw dataError(
      "红果返回了其他分页的分类数据。",
      "CATALOG_PAGE_MISMATCH",
    );
  }
  return {
    ...parsed,
    contentType: String(contentType),
  };
}

export async function fetchSeriesDetail(
  seriesId,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    requestScheduler = null,
    requestPriority = 0,
  } = {},
) {
  if (!/^\d{8,25}$/.test(String(seriesId))) {
    throw new HongguoError("剧集 ID 格式不正确。", "INVALID_SERIES_ID");
  }

  const url = `${OFFICIAL_DETAIL_URL}${encodeURIComponent(seriesId)}`;
  const { html } = await fetchWithSafeRedirects(url, {
    fetchImpl,
    timeoutMs,
    requestScheduler,
    requestPriority,
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

export async function fetchOfficialRankings(
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    requestScheduler = null,
  } = {},
) {
  const { html } = await fetchWithSafeRedirects(OFFICIAL_WEB_URL, {
    fetchImpl,
    timeoutMs,
    requestScheduler,
  });

  let routerData;
  try {
    routerData = extractBalancedJson(html, "_ROUTER_DATA");
  } catch (error) {
    throw dataError(
      `官网榜单数据无法解析：${error.message}`,
      "RANKINGS_DATA_INVALID",
    );
  }
  if (!routerData) {
    throw dataError(
      "官网榜单数据暂时无法解析，请稍后重试。",
      "RANKINGS_DATA_INVALID",
    );
  }
  return parseOfficialRankings(routerData);
}

function normalizeAlbumSeriesInfo(albumInfo) {
  const seriesItems = Array.isArray(albumInfo.album_series_item)
    ? albumInfo.album_series_item
    : [];
  const publishedSeriesIds = new Set();
  const unpublishedSeriesIds = new Set();
  const unpublishedSeasons = new Map();
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
        unpublishedSeasons.set(candidateId, {
          seriesId: candidateId,
          seasonIndex: toSafeInteger(item.season_index, null),
          coverUrl: normalizeWhitespace(item.series_cover || ""),
        });
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
    unpublishedSeasons: [...unpublishedSeasons.values()],
    unpublishedSeasonCount: unpublishedSlots.size,
    declaredSeasonCount: toSafeInteger(
      albumInfo.album_serial_count,
      null,
    ),
    itemCount: seriesItems.length,
  };
}

async function fetchPackFieldsPayload(
  seriesIds,
  reqFields,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = ALBUM_REQUEST_TIMEOUT_MS,
    requestScheduler = null,
    label = "红果数据接口",
    errorPrefix = "PACK_FIELDS",
    maxBytes = MAX_ALBUM_RESPONSE_BYTES,
  } = {},
) {
  let result;
  try {
    result = await performUpstreamFetch(
      fetchImpl,
      OFFICIAL_PACK_FIELDS_URL,
      {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent":
            "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
        },
        // The upstream model requires a JSON number, while 19-digit IDs exceed
        // Number.MAX_SAFE_INTEGER. IDs are validated before numeric splicing.
        body: `{"book_pack_channel":"inner_feed_detail","req_ids":[${seriesIds.join(",")}],"req_fields":${JSON.stringify(reqFields)}}`,
      },
      {
        scheduler: requestScheduler,
        timeoutMs,
        label,
        readBody: (response) =>
          readSuccessfulBody(response, maxBytes),
      },
    );
  } catch (error) {
    if (error?.upstreamBodyRead) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new HongguoError(
        `请求${label}超时。`,
        `${errorPrefix}_REQUEST_TIMEOUT`,
        504,
      );
    }
    throw new HongguoError(
      `无法连接${label}：${error.message}`,
      `${errorPrefix}_REQUEST_FAILED`,
      502,
    );
  }
  const response = result.response;

  if (!response.ok) {
    const rateLimited = response.status === 429;
    const error = new HongguoError(
      rateLimited
        ? `${label}请求过于频繁，请稍后重试。`
        : `${label}返回 HTTP ${response.status}。`,
      rateLimited
        ? `${errorPrefix}_UPSTREAM_RATE_LIMITED`
        : `${errorPrefix}_UPSTREAM_HTTP_ERROR`,
      rateLimited ? 429 : 502,
    );
    const retryAfterMs = retryAfterMilliseconds(response);
    if (rateLimited && retryAfterMs !== null) {
      error.retryAfterSeconds = Math.max(
        1,
        Math.ceil(retryAfterMs / 1_000),
      );
    }
    throw error;
  }

  const body = result.body;
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new HongguoError(
      `${label}数据无法解析。`,
      `${errorPrefix}_DATA_INVALID`,
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
      `${label}返回错误${message ? `：${message}` : "。"}`,
      `${errorPrefix}_API_ERROR`,
      502,
    );
  }

  return payload;
}

async function fetchAlbumSeriesPayload(seriesIds, options = {}) {
  return fetchPackFieldsPayload(
    seriesIds,
    [
      "album_id",
      "album_serial_count",
      "series_in_album_order",
      "album_series_item",
    ],
    {
      ...options,
      label: "红果多季列表",
      errorPrefix: "ALBUM",
    },
  );
}

export async function fetchAlbumSeriesInfoBatch(
  inputSeriesIds,
  options = {},
) {
  const seriesIds = [
    ...new Set(
      (Array.isArray(inputSeriesIds) ? inputSeriesIds : [])
        .map((seriesId) => String(seriesId || ""))
        .filter(Boolean),
    ),
  ];
  if (!seriesIds.length) {
    return new Map();
  }
  for (const seriesId of seriesIds) {
    if (!/^\d{8,25}$/.test(seriesId)) {
      throw new HongguoError("剧集 ID 格式不正确。", "INVALID_SERIES_ID");
    }
  }

  const payload = await fetchAlbumSeriesPayload(seriesIds, options);
  return new Map(
    seriesIds.map((seriesId) => {
      const albumInfo = payload?.data?.[seriesId]?.album_info;
      if (!albumInfo || typeof albumInfo !== "object") {
        return [
          seriesId,
          {
            album: null,
            error: new HongguoError(
              "官方多季列表暂时没有返回该系列，稍后会自动重试。",
              "ALBUM_DATA_UNAVAILABLE",
              502,
            ),
          },
        ];
      }
      try {
        return [
          seriesId,
          {
            album: normalizeAlbumSeriesInfo(albumInfo),
            error: null,
          },
        ];
      } catch (error) {
        return [seriesId, { album: null, error }];
      }
    }),
  );
}

export async function fetchAlbumSeriesInfo(
  seriesId,
  options = {},
) {
  const normalizedSeriesId = String(seriesId || "");
  if (!/^\d{8,25}$/.test(normalizedSeriesId)) {
    throw new HongguoError("剧集 ID 格式不正确。", "INVALID_SERIES_ID");
  }
  const result = (
    await fetchAlbumSeriesInfoBatch([normalizedSeriesId], options)
  ).get(normalizedSeriesId);
  if (result?.error) {
    throw result.error;
  }
  if (!result?.album) {
    throw new HongguoError(
      "官方多季列表暂时没有返回该系列，稍后会自动重试。",
      "ALBUM_DATA_UNAVAILABLE",
      502,
    );
  }
  return result.album;
}

export async function fetchAlbumSeriesIds(seriesId, options = {}) {
  const album = await fetchAlbumSeriesInfo(seriesId, options);
  return album.publishedSeriesIds;
}

export async function fetchSeriesProgressBatch(
  inputSeriesIds,
  options = {},
) {
  const seriesIds = [
    ...new Set(
      (Array.isArray(inputSeriesIds) ? inputSeriesIds : [])
        .map((seriesId) => String(seriesId || ""))
        .filter(Boolean),
    ),
  ];
  if (!seriesIds.length) {
    return new Map();
  }
  for (const seriesId of seriesIds) {
    if (!/^\d{8,25}$/.test(seriesId)) {
      throw new HongguoError("剧集 ID 格式不正确。", "INVALID_SERIES_ID");
    }
  }

  const payload = await fetchPackFieldsPayload(
    seriesIds,
    ["episode_cnt", "series_status"],
    {
      ...options,
      label: "红果更新状态",
      errorPrefix: "SERIES_PROGRESS",
      maxBytes: MAX_SEARCH_RESPONSE_BYTES,
    },
  );

  return new Map(
    seriesIds.map((seriesId) => {
      const baseInfo = payload?.data?.[seriesId]?.base_info;
      const episodeCount = toSafeInteger(baseInfo?.episode_cnt, null);
      if (!baseInfo || typeof baseInfo !== "object" || episodeCount === null) {
        return [
          seriesId,
          {
            episodeCount: null,
            status: null,
            error: new HongguoError(
              "官方更新状态暂时没有返回该系列，将回退到详情页检查。",
              "SERIES_PROGRESS_UNAVAILABLE",
              502,
            ),
          },
        ];
      }
      return [
        seriesId,
        {
          episodeCount,
          status: normalizeSeriesStatus(baseInfo.series_status),
          error: null,
        },
      ];
    }),
  );
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
    requestScheduler = null,
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
  let result;
  try {
    result = await performUpstreamFetch(
      fetchImpl,
      url,
      {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "accept-language": "zh-CN,zh;q=0.9",
          "user-agent":
            "Mozilla/5.0 (compatible; HongguoReminder/1.0; +https://hongguoduanju.com)",
        },
      },
      {
        scheduler: requestScheduler,
        timeoutMs,
        label: "红果搜索",
        readBody: (response) =>
          readSuccessfulBody(response, MAX_SEARCH_RESPONSE_BYTES),
      },
    );
  } catch (error) {
    if (error?.upstreamBodyRead) {
      throw error;
    }
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
  }
  const response = result.response;

  if (!response.ok) {
    const rateLimited = response.status === 429;
    const error = new HongguoError(
      rateLimited
        ? "红果搜索请求过于频繁，请稍后重试。"
        : `红果搜索返回 HTTP ${response.status}。`,
      rateLimited
        ? "SEARCH_UPSTREAM_RATE_LIMITED"
        : "SEARCH_UPSTREAM_HTTP_ERROR",
      rateLimited ? 429 : 502,
    );
    const retryAfterMs = retryAfterMilliseconds(response);
    if (rateLimited && retryAfterMs !== null) {
      error.retryAfterSeconds = Math.max(
        1,
        Math.ceil(retryAfterMs / 1_000),
      );
    }
    throw error;
  }

  const body = result.body;
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
