import { performUpstreamFetch } from "./request-scheduler.js";
import {
  accountUserAgent,
  discoveryDeviceIdentity,
  discoveryDevicePairs,
  signAppPost,
} from "./hongguo-sign.js";
import { normalizeWhitespace } from "./utils.js";

const DISCOVERY_ORIGIN = "https://api5-normal-sinfonlineb.fqnovel.com";
const DISCOVERY_PATH = "/reading/distribution/category/landpage/v/";
const DISCOVERY_PAGE_SIZE = 24;
const DISCOVERY_MAX_PAGE = 100;
const DISCOVERY_MAX_SESSION_LENGTH = 4096;
const DISCOVERY_MAX_RESPONSE_BYTES = 1024 * 1024;
const DISCOVERY_TIMEOUT_MS = 15_000;
const DISCOVERY_SELECTION_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const DISCOVERY_SERIES_ID_PATTERN = /^\d{1,30}$/;
const DISCOVERY_NAMESPACE_SCENES = new Set(["comic_series", "ai_series"]);
const DISCOVERY_PUBLIC_COVER_ORIGIN = "https://p3-novel.byteimg.com";
const DISCOVERY_SIGNED_COVER_PATH =
  /^\/novel-pic\/([A-Za-z0-9_-]{8,128})~tplv-[^/]+\.heic$/i;

export const DISCOVERY_GROUP_LABELS = Object.freeze({
  genre: "类型",
  category_dim_theme: "主题",
  category_dim_role: "设定",
  category_dim_epoch: "背景",
  sort: "推荐",
  gender: "受众",
  online_time: "时间",
  creation_status: "状态",
});

const DISCOVERY_GROUP_IDS = Object.freeze(Object.keys(DISCOVERY_GROUP_LABELS));

function discoveryError(message, code, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeDiscoverySelection(value = {}) {
  if (value == null) {
    return {};
  }
  if (!isPlainObject(value)) {
    throw discoveryError(
      "筛选条件格式不正确。",
      "INVALID_DISCOVERY_SELECTION",
    );
  }

  const selection = {};
  for (const [group, rawValue] of Object.entries(value)) {
    if (!DISCOVERY_GROUP_IDS.includes(group)) {
      throw discoveryError(
        "筛选条件包含未知分组。",
        "INVALID_DISCOVERY_SELECTION",
      );
    }
    if (rawValue == null || rawValue === "") {
      continue;
    }
    if (
      typeof rawValue !== "string" ||
      !DISCOVERY_SELECTION_PATTERN.test(rawValue)
    ) {
      throw discoveryError(
        "筛选选项格式不正确。",
        "INVALID_DISCOVERY_SELECTION",
      );
    }
    selection[group] = rawValue;
  }
  return selection;
}

export function encodeDiscoveryCursor(cursor) {
  return Buffer.from(
    JSON.stringify({
      offset: cursor.offset,
      session: cursor.session,
      page: cursor.page,
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeDiscoveryCursor(value) {
  if (value == null || value === "") {
    return null;
  }
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,8192}$/.test(value)
  ) {
    throw discoveryError(
      "筛选续页标记格式不正确。",
      "INVALID_DISCOVERY_CURSOR",
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw discoveryError(
      "筛选续页标记已失效，请重新筛选。",
      "INVALID_DISCOVERY_CURSOR",
    );
  }

  const offset = Number(parsed?.offset);
  const page = Number(parsed?.page);
  const session = typeof parsed?.session === "string" ? parsed.session : "";
  if (
    !Number.isSafeInteger(offset) ||
    offset <= 0 ||
    !Number.isInteger(page) ||
    page < 2 ||
    page > DISCOVERY_MAX_PAGE ||
    !session ||
    session.length > DISCOVERY_MAX_SESSION_LENGTH
  ) {
    throw discoveryError(
      "筛选续页标记已失效，请重新筛选。",
      "INVALID_DISCOVERY_CURSOR",
    );
  }
  return { offset, page, session };
}

function requestBody(selection, cursor) {
  const selected = {};
  for (const group of DISCOVERY_GROUP_IDS) {
    selected[group] = selection[group] ? [selection[group]] : [];
  }
  return {
    offset: cursor?.offset || 0,
    limit: DISCOVERY_PAGE_SIZE,
    need_selector_panel: cursor === null,
    select_items: selected,
    session_id: cursor?.session || "",
    req_type: cursor === null ? "default" : "only_content",
    client_req_type: 3,
    filter_ids: "",
    req_scene: DISCOVERY_NAMESPACE_SCENES.has(selection.genre)
      ? selection.genre
      : "default",
  };
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function renderableCoverUrl(value) {
  const coverUrl = safeHttpsUrl(value);
  if (!coverUrl) {
    return "";
  }

  const url = new URL(coverUrl);
  const isSignedFqnovelCover =
    (url.hostname === "fqnovelpic.com" ||
      url.hostname.endsWith(".fqnovelpic.com")) &&
    DISCOVERY_SIGNED_COVER_PATH.test(url.pathname);
  if (!isSignedFqnovelCover) {
    return coverUrl;
  }

  const imageId = url.pathname.match(DISCOVERY_SIGNED_COVER_PATH)?.[1];
  return imageId
    ? `${DISCOVERY_PUBLIC_COVER_ORIGIN}/novel-pic/${imageId}~tplv-shrink:400:0.image`
    : coverUrl;
}

function schemaTags(value) {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) {
    return [];
  }
  return [
    ...new Set(
      source
        .map((entry) =>
          typeof entry === "string"
            ? normalizeWhitespace(entry)
            : normalizeWhitespace(entry?.name || ""),
        )
        .filter(Boolean)
        .slice(0, 8),
    ),
  ];
}

function normalizeDiscoveryItem(item) {
  const seriesId = String(item?.series_id ?? "").trim();
  const title = normalizeWhitespace(item?.title || "").slice(0, 120);
  if (!DISCOVERY_SERIES_ID_PATTERN.test(seriesId) || !title) {
    return null;
  }
  const episodeCount = Math.max(
    0,
    Math.floor(Number(item?.episode_cnt) || 0),
  );
  return {
    seriesId,
    title,
    coverUrl: renderableCoverUrl(item?.cover),
    intro: normalizeWhitespace(item?.video_desc || "").slice(0, 500),
    episodeCount,
    tags: schemaTags(item?.category_schema),
    detailUrl: `https://hongguoduanju.com/detail?series_id=${seriesId}`,
  };
}

function normalizeDiscoveryGroups(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  const groups = [];
  const seenGroups = new Set();
  for (const row of rows) {
    const type = String(row?.type || "").trim();
    if (
      seenGroups.has(type) ||
      !Object.hasOwn(DISCOVERY_GROUP_LABELS, type)
    ) {
      continue;
    }
    seenGroups.add(type);
    const seenOptions = new Set();
    const options = [];
    for (const item of Array.isArray(row?.items) ? row.items : []) {
      const id = String(item?.selector_item_id ?? "").trim();
      const label = normalizeWhitespace(item?.show_name || "").slice(0, 40);
      if (
        !DISCOVERY_SELECTION_PATTERN.test(id) ||
        !label ||
        seenOptions.has(id)
      ) {
        continue;
      }
      seenOptions.add(id);
      options.push({ id, label });
      if (options.length >= 128) {
        break;
      }
    }
    groups.push({
      type,
      label: DISCOVERY_GROUP_LABELS[type],
      options,
    });
  }
  return groups.sort(
    (left, right) =>
      DISCOVERY_GROUP_IDS.indexOf(left.type) -
      DISCOVERY_GROUP_IDS.indexOf(right.type),
  );
}

function parseDiscoveryPayload(raw, cursor) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw discoveryError(
      "红果筛选返回了无法解析的数据。",
      "DISCOVERY_DATA_INVALID",
      502,
    );
  }
  if (Number(payload?.code) !== 0) {
    throw discoveryError(
      "红果筛选服务暂时不可用。",
      "DISCOVERY_UPSTREAM_ERROR",
      502,
    );
  }
  const data = payload?.data;
  if (!isPlainObject(data) || !Array.isArray(data.video_data)) {
    throw discoveryError(
      "红果筛选数据不完整。",
      "DISCOVERY_DATA_INVALID",
      502,
    );
  }

  const items = [];
  const seenSeriesIds = new Set();
  for (const rawItem of data.video_data) {
    const item = normalizeDiscoveryItem(rawItem);
    if (!item || seenSeriesIds.has(item.seriesId)) {
      continue;
    }
    seenSeriesIds.add(item.seriesId);
    items.push(item);
  }
  if (data.video_data.length > 0 && items.length === 0) {
    throw discoveryError(
      "红果筛选剧集格式异常。",
      "DISCOVERY_DATA_INVALID",
      502,
    );
  }

  const groups = normalizeDiscoveryGroups(data.selector_rows);
  if (cursor === null && !groups.some((group) => group.type === "genre")) {
    throw discoveryError(
      "红果筛选条件暂未完整加载，请重试。",
      "DISCOVERY_FILTERS_INVALID",
      502,
    );
  }

  const hasMore =
    Boolean(data.has_more) &&
    (cursor?.page || 1) < DISCOVERY_MAX_PAGE;
  let nextCursor = null;
  if (hasMore) {
    const offset = Number(data.next_offset);
    const session = normalizeWhitespace(
      data.session_id || cursor?.session || "",
    );
    if (
      !Number.isSafeInteger(offset) ||
      offset <= (cursor?.offset || 0) ||
      !session ||
      session.length > DISCOVERY_MAX_SESSION_LENGTH
    ) {
      throw discoveryError(
        "红果筛选续页信息异常，请刷新后重试。",
        "DISCOVERY_CURSOR_INVALID",
        502,
      );
    }
    nextCursor = encodeDiscoveryCursor({
      offset,
      session,
      page: (cursor?.page || 1) + 1,
    });
  }

  return {
    items,
    groups,
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

async function readLimitedBody(response, maxBytes) {
  if (!response.ok) {
    try {
      await response.body?.cancel?.();
    } catch {
      // The response body is not needed for an unsuccessful request.
    }
    return "";
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
      throw discoveryError(
        "红果筛选响应过大，已停止读取。",
        "DISCOVERY_RESPONSE_TOO_LARGE",
        502,
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class AppDiscoveryService {
  constructor({
    fetchImpl = globalThis.fetch,
    requestScheduler = null,
    signer = signAppPost,
    identity = discoveryDeviceIdentity,
    pairs = discoveryDevicePairs,
    userAgent = accountUserAgent,
    now = Date.now,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.requestScheduler = requestScheduler;
    this.signer = signer;
    this.identity = identity;
    this.pairs = pairs;
    this.userAgent = userAgent;
    this.now = now;
  }

  async getDiscovery({ selection: rawSelection = {}, cursor: rawCursor = null } = {}) {
    const selection = normalizeDiscoverySelection(rawSelection);
    const cursor = decodeDiscoveryCursor(rawCursor);
    const body = requestBody(selection, cursor);
    const bodyText = JSON.stringify(body);
    const identity =
      typeof this.identity === "function" ? this.identity() : this.identity;
    const signed = this.signer({
      path: DISCOVERY_PATH,
      origin: DISCOVERY_ORIGIN,
      versionName: identity.versionName,
      deviceId: identity.deviceId,
      pairs:
        typeof this.pairs === "function" ? this.pairs() : this.pairs,
      body: bodyText,
      requireBranch: 0,
    });

    let result;
    try {
      result = await performUpstreamFetch(
        this.fetchImpl,
        `${DISCOVERY_ORIGIN}${DISCOVERY_PATH}?${signed.query}`,
        {
          method: "POST",
          headers: {
            ...signed.headers,
            accept: "application/json",
            "accept-language": "zh-CN,zh;q=0.9",
            "content-type": "application/json; charset=utf-8",
            "user-agent":
              typeof this.userAgent === "function"
                ? this.userAgent()
                : this.userAgent,
          },
          body: bodyText,
        },
        {
          scheduler: this.requestScheduler,
          timeoutMs: DISCOVERY_TIMEOUT_MS,
          label: "红果官方筛选",
          readBody: (response) =>
            readLimitedBody(response, DISCOVERY_MAX_RESPONSE_BYTES),
        },
      );
    } catch (cause) {
      if (cause?.statusCode) {
        throw cause;
      }
      if (cause?.name === "AbortError" || cause?.code === "UPSTREAM_TIMEOUT") {
        throw discoveryError(
          "红果筛选请求超时，请稍后重试。",
          "DISCOVERY_TIMEOUT",
          504,
        );
      }
      throw discoveryError(
        "暂时无法连接红果筛选服务，请稍后重试。",
        "DISCOVERY_UNAVAILABLE",
        502,
      );
    }

    const response = result.response;
    if (!response.ok) {
      throw discoveryError(
        response.status === 429
          ? "红果筛选请求过于频繁，请稍后重试。"
          : "红果筛选服务暂时不可用，请稍后重试。",
        response.status === 429
          ? "DISCOVERY_RATE_LIMITED"
          : "DISCOVERY_UPSTREAM_ERROR",
        response.status === 429 ? 429 : 502,
      );
    }
    const parsed = parseDiscoveryPayload(result.body || "", cursor);
    return {
      ok: true,
      fetchedAt: new Date(this.now()).toISOString(),
      ...parsed,
    };
  }
}

export const __test = {
  DISCOVERY_GROUP_IDS,
  DISCOVERY_ORIGIN,
  DISCOVERY_PATH,
  normalizeDiscoveryGroups,
  normalizeDiscoveryItem,
  renderableCoverUrl,
  requestBody,
};
