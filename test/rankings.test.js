import assert from "node:assert/strict";
import test from "node:test";
import { RankingsService, shanghaiDayKey } from "../src/rankings.js";

function rankingFixture({
  title = "测试短剧",
  category = "all",
  type = "hot",
} = {}) {
  return {
    category,
    type,
    updatedText: "11月15日已更新·按热度排序",
    items: [
      {
        seriesId: "7694653385668037657",
        title,
        coverUrl: "",
        episodeCount: 12,
        rightText: "共12集",
        metricText: "8000万热度",
        categories: ["剧情"],
        rank: 1,
        detailUrl:
          "https://hongguoduanju.com/detail?series_id=7694653385668037657",
      },
    ],
  };
}

test("shanghaiDayKey follows the Asia/Shanghai natural day", () => {
  assert.equal(
    shanghaiDayKey(Date.parse("2026-11-14T15:59:59.000Z")),
    "2026-11-14",
  );
  assert.equal(
    shanghaiDayKey(Date.parse("2026-11-14T16:00:00.000Z")),
    "2026-11-15",
  );
});

test("RankingsService caches each official combination for one local day", async () => {
  let calls = 0;
  let nowMs = Date.parse("2026-11-15T08:00:00.000Z");
  const service = new RankingsService({
    now: () => nowMs,
    loader: async ({ category, type }) => {
      calls += 1;
      return rankingFixture({
        title: `第 ${calls} 次`,
        category,
        type,
      });
    },
  });

  const first = await service.getRankings({
    category: "human",
    type: "new",
  });
  const cached = await service.getRankings({
    category: "human",
    type: "new",
  });
  nowMs = Date.parse("2026-11-15T15:59:59.000Z");
  const sameDay = await service.getRankings({
    category: "human",
    type: "new",
  });
  nowMs = Date.parse("2026-11-15T16:00:01.000Z");
  const nextDay = await service.getRankings({
    category: "human",
    type: "new",
  });
  const forced = await service.getRankings({
    category: "human",
    type: "new",
    force: true,
  });

  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(sameDay.cached, true);
  assert.equal(sameDay.items[0].title, "第 1 次");
  assert.equal(nextDay.cached, false);
  assert.equal(nextDay.items[0].title, "第 2 次");
  assert.equal(forced.cached, false);
  assert.equal(forced.items[0].title, "第 3 次");
  assert.equal(calls, 3);
});

test("RankingsService keeps separate cache entries for official combinations", async () => {
  const calls = [];
  const service = new RankingsService({
    loader: async ({ category, type }) => {
      calls.push(`${type}:${category}`);
      return rankingFixture({ category, type });
    },
  });

  await service.getRankings({ category: "comic", type: "hot-search" });
  await service.getRankings({ category: "human", type: "hot-search" });
  await service.getRankings({ category: "comic", type: "hot-search" });

  assert.deepEqual(calls, ["hot-search:comic", "hot-search:human"]);
});

test("RankingsService merges concurrent loads for the same combination", async () => {
  let calls = 0;
  let resolveLoad;
  const service = new RankingsService({
    loader: ({ category, type }) => {
      calls += 1;
      return new Promise((resolve) => {
        resolveLoad = () => resolve(rankingFixture({ category, type }));
      });
    },
  });

  const first = service.getRankings({ category: "ai", type: "new" });
  const second = service.getRankings({ category: "ai", type: "new" });
  assert.equal(calls, 1);

  resolveLoad();
  const [firstPayload, secondPayload] = await Promise.all([first, second]);
  assert.equal(firstPayload.cached, false);
  assert.equal(secondPayload.cached, false);
  assert.equal(firstPayload.items.length, 1);
  assert.equal(calls, 1);
});

test("RankingsService rejects unsupported official combinations", async () => {
  let called = false;
  const service = new RankingsService({
    loader: async () => {
      called = true;
      return rankingFixture();
    },
  });

  await assert.rejects(
    service.getRankings({ category: "comic", type: "prestige" }),
    (error) =>
      error.code === "RANKING_COMBINATION_UNAVAILABLE" &&
      error.statusCode === 404,
  );
  assert.equal(called, false);
});

test("RankingsService falls back to the last daily cache when refresh fails", async () => {
  let shouldFail = false;
  let nowMs = Date.parse("2026-11-15T08:00:00.000Z");
  const service = new RankingsService({
    now: () => nowMs,
    loader: async ({ category, type }) => {
      if (shouldFail) {
        throw new Error("upstream unavailable");
      }
      return rankingFixture({ category, type });
    },
  });

  await service.getRankings({ category: "all", type: "hot" });
  nowMs = Date.parse("2026-11-16T08:00:00.000Z");
  shouldFail = true;
  const stale = await service.getRankings({
    category: "all",
    type: "hot",
  });

  assert.equal(stale.ok, true);
  assert.equal(stale.cached, true);
  assert.equal(stale.stale, true);
  assert.match(stale.warning, /上次成功获取/);
  assert.equal(stale.items[0].title, "测试短剧");
});

test("RankingsService reports an unavailable upstream without cache", async () => {
  const service = new RankingsService({
    loader: async () => {
      throw new Error("upstream unavailable");
    },
  });

  await assert.rejects(
    service.getRankings({ category: "all", type: "hot" }),
    (error) =>
      error.code === "RANKINGS_UNAVAILABLE" &&
      error.statusCode === 502,
  );
});
