import assert from "node:assert/strict";
import test from "node:test";
import { CatalogService, catalogDayKey } from "../src/catalog.js";

function catalogItem(overrides = {}) {
  return {
    seriesId: "7694653385668037001",
    title: "测试短剧",
    intro: "普通剧情简介",
    tags: ["剧情"],
    episodeCount: 24,
    totalEpisodeCount: 24,
    status: "updating",
    officialRank: 1,
    detailUrl:
      "https://hongguoduanju.com/detail?series_id=7694653385668037001",
    ...overrides,
  };
}

function catalogPage(pageNum, items, overrides = {}) {
  return {
    pageNum,
    total: 100,
    totalPages: 8,
    canonicalUrl: "https://hongguoduanju.com/category/real-drama",
    topics: [
      { id: "romance", name: "爱情" },
      { id: "suspense", name: "悬疑" },
    ],
    items,
    ...overrides,
  };
}

function createLoader(pages, calls = [], failures = new Set()) {
  return async ({ page }) => {
    calls.push(page);
    if (failures.has(page)) {
      throw new Error(`page ${page} unavailable`);
    }
    return pages.get(page);
  };
}

test("catalogDayKey follows the Asia/Shanghai natural day", () => {
  assert.equal(
    catalogDayKey(Date.parse("2026-11-14T15:59:59.000Z")),
    "2026-11-14",
  );
  assert.equal(
    catalogDayKey(Date.parse("2026-11-14T16:00:00.000Z")),
    "2026-11-15",
  );
});

test("CatalogService scans six official pages and reuses the same-day cache", async () => {
  const calls = [];
  let nowMs = Date.parse("2026-11-15T08:00:00.000Z");
  const pages = new Map(
    Array.from({ length: 8 }, (_, index) => {
      const page = index + 1;
      return [
        page,
        catalogPage(page, [
          catalogItem({
            seriesId: `76946533856680${String(page).padStart(5, "0")}`,
            title: `测试短剧 ${page}`,
            officialRank: page,
          }),
        ]),
      ];
    }),
  );
  const service = new CatalogService({
    now: () => nowMs,
    loader: createLoader(pages, calls),
  });

  const first = await service.getCatalog();
  const cached = await service.getCatalog();
  nowMs = Date.parse("2026-11-15T15:59:59.000Z");
  const sameDay = await service.getCatalog();

  assert.deepEqual(calls, [1, 2, 3, 4, 5, 6]);
  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(sameDay.cached, true);
  assert.deepEqual(first.scannedPages, [1, 2, 3, 4, 5, 6]);
  assert.equal(first.scannedCount, 6);
  assert.equal(first.nextOfficialPage, 7);
  assert.equal(first.hasMore, true);
});

test("CatalogService continues from a cursor and de-duplicates series", async () => {
  const calls = [];
  const duplicate = catalogItem({
    seriesId: "7694653385668037002",
    title: "跨页重复短剧",
  });
  const pages = new Map([
    [
      1,
      catalogPage(
        1,
        [
          catalogItem({ seriesId: "7694653385668037001", officialRank: 1 }),
          duplicate,
        ],
        { totalPages: 4 },
      ),
    ],
    [
      2,
      catalogPage(
        2,
        [
          duplicate,
          catalogItem({
            seriesId: "7694653385668037003",
            officialRank: 3,
          }),
        ],
        { totalPages: 4 },
      ),
    ],
    [
      3,
      catalogPage(
        3,
        [
          catalogItem({
            seriesId: "7694653385668037004",
            officialRank: 4,
          }),
        ],
        { totalPages: 4 },
      ),
    ],
    [
      4,
      catalogPage(
        4,
        [
          catalogItem({
            seriesId: "7694653385668037005",
            officialRank: 5,
          }),
        ],
        { totalPages: 4 },
      ),
    ],
  ]);
  const service = new CatalogService({
    loader: createLoader(pages, calls),
  });

  await service.getCatalog({ scanPages: 2 });
  const second = await service.getCatalog({ cursor: 3, scanPages: 2 });

  assert.deepEqual(calls, [1, 2, 3, 4]);
  assert.equal(second.scannedCount, 5);
  assert.equal(second.nextOfficialPage, null);
  assert.equal(second.hasMore, false);
});

test("CatalogService combines detailed catalog filters", async () => {
  const items = [
    catalogItem({
      seriesId: "7694653385668037101",
      title: "闪婚后被宠上天",
      intro: "甜宠爱情故事",
      tags: ["甜宠", "先婚后爱"],
      totalEpisodeCount: 24,
      status: "updating",
      officialRank: 1,
    }),
    catalogItem({
      seriesId: "7694653385668037102",
      title: "迷雾追凶",
      intro: "悬疑推理故事",
      tags: ["悬疑", "推理"],
      totalEpisodeCount: 72,
      status: "completed",
      officialRank: 2,
    }),
    catalogItem({
      seriesId: "7694653385668037103",
      title: "重生后逆风翻盘",
      intro: "爱情与复仇",
      tags: ["重生", "复仇"],
      totalEpisodeCount: 130,
      status: "unknown",
      officialRank: 3,
    }),
  ];
  const pages = new Map([
    [1, catalogPage(1, items, { totalPages: 1, total: items.length })],
  ]);
  const service = new CatalogService({
    loader: createLoader(pages),
  });
  const tracked = new Set(["7694653385668037101"]);

  const base = await service.getCatalog({
    scanPages: 1,
    trackedSeriesIds: tracked,
  });
  const completed = await service.getCatalog({
    status: "completed",
    trackedSeriesIds: tracked,
  });
  const trackedOnly = await service.getCatalog({
    tracked: "tracked",
    trackedSeriesIds: tracked,
  });
  const untracked = await service.getCatalog({
    tracked: "untracked",
    trackedSeriesIds: tracked,
  });
  const longSeries = await service.getCatalog({
    episodes: "121-plus",
    trackedSeriesIds: tracked,
  });
  const tagMatch = await service.getCatalog({
    tags: "重生,悬疑",
    trackedSeriesIds: tracked,
  });
  const topicMatch = await service.getCatalog({
    topic: "romance",
    trackedSeriesIds: tracked,
  });
  const queryMatch = await service.getCatalog({
    query: "逆风",
    trackedSeriesIds: tracked,
  });
  const sorted = await service.getCatalog({
    sort: "episodes-desc",
    trackedSeriesIds: tracked,
  });
  const inactive = await service.getCatalog({
    status: "inactive",
    trackedSeriesIds: tracked,
  });

  assert.equal(base.scannedCount, 3);
  assert.equal(base.items[0].tracked, true);
  assert.deepEqual(completed.items.map((item) => item.title), ["迷雾追凶"]);
  assert.deepEqual(trackedOnly.items.map((item) => item.title), [
    "闪婚后被宠上天",
  ]);
  assert.deepEqual(untracked.items.map((item) => item.title), [
    "迷雾追凶",
    "重生后逆风翻盘",
  ]);
  assert.deepEqual(longSeries.items.map((item) => item.title), [
    "重生后逆风翻盘",
  ]);
  assert.deepEqual(tagMatch.items.map((item) => item.title), [
    "迷雾追凶",
    "重生后逆风翻盘",
  ]);
  assert.deepEqual(topicMatch.items.map((item) => item.title), [
    "闪婚后被宠上天",
    "重生后逆风翻盘",
  ]);
  assert.deepEqual(queryMatch.items.map((item) => item.title), [
    "重生后逆风翻盘",
  ]);
  assert.deepEqual(sorted.items.map((item) => item.title), [
    "重生后逆风翻盘",
    "迷雾追凶",
    "闪婚后被宠上天",
  ]);
  assert.equal(inactive.items.length, 0);
  assert.deepEqual(
    new Set(base.availableTags.map((tag) => tag.name)),
    new Set(["复仇", "推理", "悬疑", "甜宠", "重生", "先婚后爱"]),
  );
});

test("CatalogService keeps successful pages when part of a scan fails", async () => {
  const calls = [];
  const pages = new Map([
    [
      1,
      catalogPage(1, [
        catalogItem({
          seriesId: "7694653385668037201",
          title: "成功读取短剧",
        }),
      ]),
    ],
    [
      2,
      catalogPage(2, [
        catalogItem({
          seriesId: "7694653385668037202",
          title: "不应展示短剧",
        }),
      ]),
    ],
  ]);
  const service = new CatalogService({
    loader: createLoader(pages, calls, new Set([2])),
  });

  const result = await service.getCatalog({ scanPages: 2 });

  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.stale, true);
  assert.match(result.warning, /部分分类页加载失败/);
  assert.deepEqual(result.items.map((item) => item.title), ["成功读取短剧"]);
});
