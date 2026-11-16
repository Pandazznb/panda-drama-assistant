import {
  CATALOG_CONTENT_TYPES,
  CATALOG_TOPICS,
  fetchOfficialCatalogPage,
} from "./hongguo.js";

const APP_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_SCAN_PAGES = 6;
const MAX_SCAN_PAGES = 8;

export const CATALOG_CONTENT_META = Object.freeze({
  human: Object.freeze({ label: "真人剧", sourcePath: "/category/real-drama" }),
  comic: Object.freeze({ label: "漫剧", sourcePath: "/category/comic-drama" }),
  ai: Object.freeze({ label: "AI剧", sourcePath: "/category/ai-drama" }),
});

export const CATALOG_STATUS_TYPES = Object.freeze([
  "all",
  "updating",
  "completed",
  "inactive",
  "unknown",
]);
export const CATALOG_TRACKED_TYPES = Object.freeze([
  "all",
  "tracked",
  "untracked",
]);
export const CATALOG_EPISODE_RANGES = Object.freeze([
  "all",
  "1-30",
  "31-60",
  "61-80",
  "81-100",
  "101-120",
  "121-plus",
]);
export const CATALOG_SORT_TYPES = Object.freeze([
  "official",
  "episodes-desc",
  "episodes-asc",
]);

const EPISODE_RANGE_VALUES = Object.freeze({
  all: null,
  "1-30": Object.freeze({ min: 1, max: 30 }),
  "31-60": Object.freeze({ min: 31, max: 60 }),
  "61-80": Object.freeze({ min: 61, max: 80 }),
  "81-100": Object.freeze({ min: 81, max: 100 }),
  "101-120": Object.freeze({ min: 101, max: 120 }),
  "121-plus": Object.freeze({ min: 121, max: Number.POSITIVE_INFINITY }),
});

const TOPIC_KEYWORDS = Object.freeze({
  romance: ["爱情", "甜宠", "恋爱", "情感"],
  period: ["年代", "民国"],
  comeback: ["逆袭", "逆风翻盘", "重生", "复仇"],
  legend: ["传奇"],
  growth: ["成长", "励志"],
  family: ["家庭", "亲情"],
  clan: ["家族", "世家", "豪门"],
  "cute-kids": ["萌宝", "亲子", "带娃"],
  suspense: ["悬疑", "推理", "谜案"],
  thriller: ["惊悚"],
  horror: ["恐怖"],
  supernatural: ["志怪", "灵异"],
  costume: ["古装", "古代"],
  fantasy: ["玄幻"],
  wonder: ["奇幻"],
  urban: ["都市", "现代"],
  youth: ["青春", "校园"],
  comedy: ["喜剧", "搞笑"],
  "sci-fi": ["科幻"],
  disaster: ["灾难", "末世"],
  "action-adventure": ["动作", "冒险"],
  war: ["战争", "抗战"],
  variety: ["综艺"],
  drama: ["剧情"],
  creative: ["脑洞"],
  apocalypse: ["末世", "末日"],
  "wealthy-family": ["豪门", "家族"],
  adventure: ["冒险"],
});

function catalogError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function catalogDayKey(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeContentType(value) {
  const contentType = String(value || "human").trim().toLowerCase();
  if (!CATALOG_CONTENT_TYPES.includes(contentType)) {
    throw catalogError("短剧内容类型不正确。", "INVALID_CATALOG_CONTENT_TYPE");
  }
  return contentType;
}

function normalizeChoice(value, choices, fallback, message, code) {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (!choices.includes(normalized)) {
    throw catalogError(message, code);
  }
  return normalized;
}

function normalizePositiveInteger(value, fallback, { min = 1, max = 10_000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeTags(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  return [
    ...new Set(
      source
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
        .slice(0, 8),
    ),
  ];
}

function normalizeFilters(options) {
  return {
    query: String(options.query || "").trim().slice(0, 60),
    topic: String(options.topic || "").trim(),
    status: normalizeChoice(
      options.status,
      CATALOG_STATUS_TYPES,
      "all",
      "短剧更新状态筛选值不正确。",
      "INVALID_CATALOG_STATUS",
    ),
    tracked: normalizeChoice(
      options.tracked,
      CATALOG_TRACKED_TYPES,
      "all",
      "追更状态筛选值不正确。",
      "INVALID_CATALOG_TRACKED",
    ),
    episodes: normalizeChoice(
      options.episodes,
      CATALOG_EPISODE_RANGES,
      "all",
      "短剧集数筛选值不正确。",
      "INVALID_CATALOG_EPISODES",
    ),
    tags: normalizeTags(options.tags),
    sort: normalizeChoice(
      options.sort,
      CATALOG_SORT_TYPES,
      "official",
      "短剧排序方式不正确。",
      "INVALID_CATALOG_SORT",
    ),
  };
}

function itemEpisodeCount(item) {
  return Math.max(
    Number(item?.totalEpisodeCount) || 0,
    Number(item?.episodeCount) || 0,
  );
}

function topicKeywords(topic) {
  return [
    topic?.name,
    ...(TOPIC_KEYWORDS[topic?.id] || []),
  ]
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean);
}

function itemMatchesTopic(item, topic) {
  if (!topic) {
    return true;
  }
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  const title = String(item?.title || "");
  const intro = String(item?.intro || "");
  return topicKeywords(topic).some(
    (keyword) =>
      tags.some((tag) => String(tag).includes(keyword)) ||
      title.includes(keyword) ||
      intro.includes(keyword),
  );
}

function availableTopicList(contentType, pageTopics, items) {
  const source =
    Array.isArray(pageTopics) && pageTopics.length
      ? pageTopics
      : CATALOG_TOPICS[contentType] || [];
  const seen = new Set();
  return source
    .map((topic) => ({
      id: String(topic?.id || ""),
      name: String(topic?.name || ""),
    }))
    .filter((topic) => {
      if (!topic.id || !topic.name || seen.has(topic.id)) {
        return false;
      }
      seen.add(topic.id);
      return true;
    })
    .map((topic) => ({
      ...topic,
      count: items.filter((item) => itemMatchesTopic(item, topic)).length,
    }));
}

function tagCounts(items) {
  const counts = new Map();
  for (const item of items) {
    for (const tag of Array.isArray(item?.tags) ? item.tags : []) {
      const normalized = String(tag || "").trim();
      if (!normalized) {
        continue;
      }
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.name.localeCompare(right.name, "zh-CN"),
    );
}

function cloneItems(items) {
  return structuredClone(
    [...items].sort(
      (left, right) =>
        (Number(left?.officialRank) || 0) -
        (Number(right?.officialRank) || 0),
    ),
  );
}

function filterItems(items, filters, trackedSeriesIds, topics) {
  const query = filters.query.toLocaleLowerCase("zh-CN");
  const selectedTopic = topics.find((topic) => topic.id === filters.topic);
  if (filters.topic && !selectedTopic) {
    throw catalogError(
      "官方题材筛选值不正确。",
      "INVALID_CATALOG_TOPIC",
    );
  }
  const episodeRange = EPISODE_RANGE_VALUES[filters.episodes];

  return items
    .map((item) => ({
      ...item,
      tracked: trackedSeriesIds.has(String(item.seriesId || "")),
    }))
    .filter((item) => {
      if (filters.status !== "all" && item.status !== filters.status) {
        return false;
      }
      if (
        filters.tracked === "tracked" &&
        item.tracked !== true
      ) {
        return false;
      }
      if (
        filters.tracked === "untracked" &&
        item.tracked !== false
      ) {
        return false;
      }
      if (filters.topic && !itemMatchesTopic(item, selectedTopic)) {
        return false;
      }
      if (filters.tags.length) {
        const itemTags = new Set(
          (Array.isArray(item.tags) ? item.tags : []).map((tag) =>
            String(tag),
          ),
        );
        if (!filters.tags.some((tag) => itemTags.has(tag))) {
          return false;
        }
      }
      if (episodeRange) {
        const episodes = itemEpisodeCount(item);
        if (episodes < episodeRange.min || episodes > episodeRange.max) {
          return false;
        }
      }
      if (query) {
        const haystack = [
          item.title,
          item.intro,
          ...(Array.isArray(item.tags) ? item.tags : []),
        ]
          .map((value) => String(value || "").toLocaleLowerCase("zh-CN"))
          .join(" ");
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => {
      if (filters.sort === "episodes-desc") {
        return itemEpisodeCount(right) - itemEpisodeCount(left);
      }
      if (filters.sort === "episodes-asc") {
        return itemEpisodeCount(left) - itemEpisodeCount(right);
      }
      return (
        (Number(left.officialRank) || 0) -
        (Number(right.officialRank) || 0)
      );
    });
}

function pageRange(startPage, count, totalPages = Number.POSITIVE_INFINITY) {
  const pages = [];
  for (let page = startPage; page < startPage + count; page += 1) {
    if (page > totalPages) {
      break;
    }
    pages.push(page);
  }
  return pages;
}

export class CatalogService {
  constructor({
    fetchImpl = globalThis.fetch,
    requestScheduler = null,
    dayKey = catalogDayKey,
    now = Date.now,
    loader = fetchOfficialCatalogPage,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.requestScheduler = requestScheduler;
    this.dayKey = dayKey;
    this.now = now;
    this.loader = loader;
    this.cache = new Map();
    this.pendingPages = new Map();
  }

  cacheKey(contentType, dayKey) {
    return `${dayKey}:${contentType}`;
  }

  latestCached(contentType) {
    let latest = null;
    for (const cache of this.cache.values()) {
      if (
        cache.contentType === contentType &&
        cache.pages.size > 0 &&
        (!latest || cache.createdAtMs > latest.createdAtMs)
      ) {
        latest = cache;
      }
    }
    return latest;
  }

  ensureCache(contentType, dayKey, nowMs) {
    const key = this.cacheKey(contentType, dayKey);
    let cache = this.cache.get(key);
    if (!cache) {
      cache = {
        key,
        dayKey,
        contentType,
        createdAtMs: nowMs,
        pages: new Map(),
        topics: [],
        total: 0,
        totalPages: 0,
        sourceUrl: "",
      };
      this.cache.set(key, cache);
    }
    return cache;
  }

  async loadPage(cache, pageNumber) {
    const pageKey = `${cache.key}:${pageNumber}`;
    let pending = this.pendingPages.get(pageKey);
    if (!pending) {
      pending = this.loader({
        contentType: cache.contentType,
        page: pageNumber,
        fetchImpl: this.fetchImpl,
        requestScheduler: this.requestScheduler,
      })
        .then((page) => {
          cache.pages.set(pageNumber, {
            ...page,
            fetchedAt: new Date(this.now()).toISOString(),
          });
          if (Array.isArray(page?.topics) && page.topics.length) {
            cache.topics = structuredClone(page.topics);
          }
          cache.total = Math.max(
            Number(cache.total) || 0,
            Number(page?.total) || 0,
          );
          cache.totalPages = Math.max(
            Number(cache.totalPages) || 0,
            Number(page?.totalPages) || 0,
          );
          if (!cache.sourceUrl && page?.canonicalUrl) {
            cache.sourceUrl = String(page.canonicalUrl);
          }
          return page;
        })
        .finally(() => {
          this.pendingPages.delete(pageKey);
        });
      this.pendingPages.set(pageKey, pending);
    }
    return pending;
  }

  async loadPages(cache, pages) {
    const settled = await Promise.allSettled(
      pages.map((pageNumber) => this.loadPage(cache, pageNumber)),
    );
    const failures = settled
      .map((result, index) => ({ result, page: pages[index] }))
      .filter(({ result }) => result.status === "rejected");
    return {
      failures,
      loadedCount: settled.length - failures.length,
    };
  }

  responseFromCache(
    cache,
    filters,
    trackedSeriesIds,
    {
      cached,
      stale = false,
      warning = "",
      requestedPages = [],
    } = {},
  ) {
    const pages = [...cache.pages.values()].sort(
      (left, right) =>
        (Number(left?.pageNum) || 0) - (Number(right?.pageNum) || 0),
    );
    const seen = new Set();
    const items = [];
    for (const page of pages) {
      for (const item of Array.isArray(page?.items) ? page.items : []) {
        const seriesId = String(item?.seriesId || "");
        if (!seriesId || seen.has(seriesId)) {
          continue;
        }
        seen.add(seriesId);
        items.push(item);
      }
    }
    const topics = availableTopicList(
      cache.contentType,
      cache.topics,
      items,
    );
    const filteredItems = filterItems(
      items,
      filters,
      trackedSeriesIds,
      topics,
    );
    const fetchedAtMs = pages.reduce((latest, page) => {
      const value = Date.parse(page?.fetchedAt || "");
      return Number.isFinite(value) ? Math.max(latest, value) : latest;
    }, 0);
    const scannedPages = pages
      .map((page) => Number(page?.pageNum) || 0)
      .filter(Boolean);
    const highestScannedPage = scannedPages.length
      ? Math.max(...scannedPages)
      : 0;
    const totalPages = Math.max(
      Number(cache.totalPages) || 0,
      highestScannedPage,
    );
    const hasMore =
      totalPages > highestScannedPage && highestScannedPage > 0;

    return {
      ok: true,
      contentType: cache.contentType,
      contentLabel: CATALOG_CONTENT_META[cache.contentType].label,
      sourceUrl:
        cache.sourceUrl ||
        `https://hongguoduanju.com${
          CATALOG_CONTENT_META[cache.contentType].sourcePath
        }`,
      fetchedAt: fetchedAtMs
        ? new Date(fetchedAtMs).toISOString()
        : null,
      cached,
      stale,
      warning,
      requestedPages,
      scannedPages,
      scannedCount: items.length,
      matchedCount: filteredItems.length,
      total: Math.max(Number(cache.total) || 0, items.length),
      totalPages,
      nextOfficialPage: hasMore ? highestScannedPage + 1 : null,
      hasMore,
      topics,
      availableTags: tagCounts(items),
      filters,
      items: filteredItems,
    };
  }

  async getCatalog({
    contentType = "human",
    cursor = null,
    scanPages = DEFAULT_SCAN_PAGES,
    force = false,
    trackedSeriesIds = new Set(),
    ...filterOptions
  } = {}) {
    const normalizedContentType = normalizeContentType(contentType);
    const filters = normalizeFilters(filterOptions);
    const requestedScanPages = normalizePositiveInteger(
      scanPages,
      DEFAULT_SCAN_PAGES,
      { min: 1, max: MAX_SCAN_PAGES },
    );
    const normalizedCursor =
      cursor === null || cursor === undefined || cursor === ""
        ? null
        : normalizePositiveInteger(cursor, 1, { min: 1, max: 10_000 });
    const nowMs = this.now();
    const dayKey = this.dayKey(nowMs);
    const cache = this.ensureCache(
      normalizedContentType,
      dayKey,
      nowMs,
    );
    const tracked =
      trackedSeriesIds instanceof Set
        ? trackedSeriesIds
        : new Set(trackedSeriesIds || []);

    const startPage =
      normalizedCursor ??
      (cache.pages.size ? Math.max(...cache.pages.keys()) + 1 : 1);
    const shouldLoad =
      force ||
      normalizedCursor !== null ||
      cache.pages.size === 0;
    const requestedPages = shouldLoad
      ? force
        ? pageRange(1, requestedScanPages)
        : pageRange(
            Math.max(1, startPage),
            requestedScanPages,
            cache.totalPages || Number.POSITIVE_INFINITY,
          )
      : [];
    if (
      shouldLoad &&
      !cache.pages.has(1) &&
      !requestedPages.includes(1)
    ) {
      requestedPages.unshift(1);
    }

    let stale = false;
    let warning = "";
    let cached = requestedPages.length === 0;
    if (shouldLoad) {
      try {
        const result = await this.loadPages(cache, requestedPages);
        cached = result.loadedCount === 0 && cache.pages.size > 0;
        if (result.failures.length) {
          stale = true;
          warning =
            result.loadedCount > 0
              ? "部分分类页加载失败，当前先展示已成功读取的内容。"
              : "分类数据更新失败，当前显示今天已读取的内容。";
        }
      } catch (cause) {
        const fallback = this.latestCached(normalizedContentType);
        if (fallback?.pages.size) {
          return this.responseFromCache(
            fallback,
            filters,
            tracked,
            {
              cached: true,
              stale: true,
              warning: "分类数据更新失败，当前显示上次成功读取的内容。",
              requestedPages,
            },
          );
        }
        const error = catalogError(
          "筛选数据暂时无法加载，请稍后重试。",
          "CATALOG_UNAVAILABLE",
          502,
        );
        error.cause = cause;
        throw error;
      }
    }

    if (!cache.pages.size) {
      const fallback = this.latestCached(normalizedContentType);
      if (fallback?.pages.size) {
        return this.responseFromCache(
          fallback,
          filters,
          tracked,
          {
            cached: true,
            stale: true,
            warning: "分类数据更新失败，当前显示上次成功读取的内容。",
            requestedPages,
          },
        );
      }
      throw catalogError(
        "筛选数据暂时无法加载，请稍后重试。",
        "CATALOG_UNAVAILABLE",
        502,
      );
    }

    return this.responseFromCache(
      cache,
      filters,
      tracked,
      {
        cached,
        stale,
        warning,
        requestedPages,
      },
    );
  }
}

export const __test = {
  DEFAULT_SCAN_PAGES,
  MAX_SCAN_PAGES,
  normalizeFilters,
  itemMatchesTopic,
};
