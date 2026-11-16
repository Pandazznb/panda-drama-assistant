import {
  fetchOfficialRanking,
  RANKING_AVAILABILITY,
  RANKING_CATEGORY_TYPES,
  RANKING_ITEM_LIMIT,
  RANKING_KIND_TYPES,
} from "./hongguo.js";

const APP_TIME_ZONE = "Asia/Shanghai";

function catalogError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeSelection(category, type) {
  const normalizedCategory = String(category || "all").trim().toLowerCase();
  const normalizedType = String(type || "hot").trim().toLowerCase();
  if (!RANKING_CATEGORY_TYPES.includes(normalizedCategory)) {
    throw catalogError(
      "红果榜单分类不正确。",
      "INVALID_RANKING_CATEGORY",
    );
  }
  if (!RANKING_KIND_TYPES.includes(normalizedType)) {
    throw catalogError(
      "红果榜单类型不正确。",
      "INVALID_RANKING_TYPE",
    );
  }
  if (!RANKING_AVAILABILITY[normalizedType].includes(normalizedCategory)) {
    throw catalogError(
      "红果官方暂未提供这个榜单分类。",
      "RANKING_COMBINATION_UNAVAILABLE",
      404,
    );
  }
  return {
    category: normalizedCategory,
    type: normalizedType,
    key: `${normalizedType}:${normalizedCategory}`,
  };
}

export function shanghaiDayKey(value = Date.now()) {
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

function responsePayload(
  cache,
  {
    cached,
    stale = false,
    warning = "",
  },
) {
  return {
    ok: true,
    fetchedAt: cache.fetchedAt,
    cached,
    stale,
    warning,
    category: cache.category,
    type: cache.type,
    updatedText: cache.updatedText,
    availableCategories: [...RANKING_AVAILABILITY[cache.type]],
    items: structuredClone(cache.items),
  };
}

export class RankingsService {
  constructor({
    fetchImpl = globalThis.fetch,
    requestScheduler = null,
    dayKey = shanghaiDayKey,
    now = Date.now,
    loader = fetchOfficialRanking,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.requestScheduler = requestScheduler;
    this.dayKey = dayKey;
    this.now = now;
    this.loader = loader;
    this.cache = new Map();
    this.pending = new Map();
  }

  async loadFresh(selection) {
    const result = await this.loader({
      category: selection.category,
      type: selection.type,
      limit: RANKING_ITEM_LIMIT,
      fetchImpl: this.fetchImpl,
      requestScheduler: this.requestScheduler,
    });
    if (!Array.isArray(result?.items) || !result.items.length) {
      throw catalogError(
        "红果榜单暂时没有可展示的内容。",
        "RANKINGS_EMPTY",
        502,
      );
    }

    const fetchedAtMs = this.now();
    const cache = {
      key: selection.key,
      category: selection.category,
      type: selection.type,
      dayKey: this.dayKey(fetchedAtMs),
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      fetchedAtMs,
      updatedText: String(result.updatedText || ""),
      items: structuredClone(result.items.slice(0, RANKING_ITEM_LIMIT)),
    };
    this.cache.set(selection.key, cache);
    return responsePayload(cache, { cached: false });
  }

  async getRankings({
    category = "all",
    type = "hot",
    force = false,
  } = {}) {
    const selection = normalizeSelection(category, type);
    const nowMs = this.now();
    const currentDayKey = this.dayKey(nowMs);
    const cached = this.cache.get(selection.key);
    if (!force && cached && cached.dayKey === currentDayKey) {
      return responsePayload(cached, { cached: true });
    }

    let pending = this.pending.get(selection.key);
    if (!pending) {
      pending = this.loadFresh(selection).finally(() => {
        this.pending.delete(selection.key);
      });
      this.pending.set(selection.key, pending);
    }

    try {
      return await pending;
    } catch (cause) {
      if (cached) {
        return responsePayload(cached, {
          cached: true,
          stale: true,
          warning: "榜单更新失败，当前显示上次成功获取的内容。",
        });
      }
      const error = catalogError(
        "榜单暂时无法加载，请稍后重试。",
        "RANKINGS_UNAVAILABLE",
        502,
      );
      error.cause = cause;
      throw error;
    }
  }
}

export const __test = {
  APP_TIME_ZONE,
  normalizeSelection,
};
