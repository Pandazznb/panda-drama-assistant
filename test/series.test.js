import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSeriesStatus,
  highestSeason,
  isSeasonCompleted,
  normalizeAlbumMetadata,
  normalizeOfficialUpdateRule,
  seasonProgressLabel,
  seasonUpdateRule,
  seriesCompletionMarker,
} from "../src/series.js";

const SERIES_TITLE = "天灾末世，她囤满物资后所向披靡";

function season(seriesId, title, firstVisibleTime) {
  return {
    seriesId,
    title,
    firstVisibleTime,
    addedAt: "2026-11-01T16:23:51.156Z",
    status: "completed",
  };
}

test("a full episode count does not mark an updating season as completed", () => {
  const updatingSeason = {
    status: "updating",
    rightText: "全55集",
    episodeCount: 55,
    highWaterEpisodeCount: 55,
  };

  assert.equal(isSeasonCompleted(updatingSeason), false);
  assert.equal(seasonProgressLabel(updatingSeason), "更新至 55 集");
  assert.equal(seasonUpdateRule(updatingSeason), "");
});

test("an explicit unfinished label never marks a season as completed", () => {
  const unfinishedSeason = {
    status: "updating",
    rightText: "未完结 · 更新至55集",
    episodeCount: 55,
    highWaterEpisodeCount: 55,
  };

  assert.equal(isSeasonCompleted(unfinishedSeason), false);
  assert.equal(seasonProgressLabel(unfinishedSeason), "更新至 55 集");
});

test("an updating season reports its highest observed episode count", () => {
  const updatingSeason = {
    status: "updating",
    rightText: "更新至42集",
    episodeCount: 42,
    highWaterEpisodeCount: 43,
    updateRule: "每周二00:10更新10集",
  };

  assert.equal(isSeasonCompleted(updatingSeason), false);
  assert.equal(seasonProgressLabel(updatingSeason), "更新至 43 集");
  assert.equal(seasonUpdateRule(updatingSeason), "每周二00:10更新10集");
});

test("only an explicit official completion marker completes a season", () => {
  const completedSeason = {
    status: "completed",
    rightText: "已完结 · 全124集",
    episodeCount: 124,
    highWaterEpisodeCount: 124,
    updateRule: "每周二更新10集",
  };

  assert.equal(isSeasonCompleted(completedSeason), true);
  assert.equal(seasonProgressLabel(completedSeason), "已完结");
  assert.equal(seasonUpdateRule(completedSeason), "");
});

test("a season with an unknown official status keeps that caveat visible", () => {
  const unknownSeason = {
    status: "unknown",
    rightText: "",
    episodeCount: 12,
    highWaterEpisodeCount: 12,
  };

  assert.equal(
    seasonProgressLabel(unknownSeason),
    "更新至 12 集 · 状态未知",
  );
  assert.equal(seasonUpdateRule(unknownSeason), "");
});

test("update rules only accept a concise official schedule", () => {
  assert.equal(
    normalizeOfficialUpdateRule("每周二00:10更新10集"),
    "每周二00:10更新10集",
  );
  assert.equal(
    normalizeOfficialUpdateRule("陈长生横渡天渊，每周都会遇到新的敌人。"),
    "",
  );
  assert.equal(
    normalizeOfficialUpdateRule(
      "更新规则：红果当前标注“全55集”；本季已明确完结，系统每天至少复核一次。",
    ),
    "",
  );
});

test("an unnumbered later finale is the highest season", () => {
  const seasons = [
    season(
      "7682325650463542334",
      `${SERIES_TITLE}！`,
      "2026-09-08T06:58:01.000Z",
    ),
    season(
      "7686351913100512281",
      `${SERIES_TITLE}第二季`,
      "2026-09-18T05:18:01.000Z",
    ),
    season(
      "7688007882683452441",
      `${SERIES_TITLE}第三季`,
      "2026-09-22T02:58:05.000Z",
    ),
    season(
      "7688278467405696025",
      `${SERIES_TITLE}大结局`,
      "2026-09-25T02:18:01.000Z",
    ),
  ];

  const highest = highestSeason(seasons);
  assert.equal(highest.seriesId, "7688278467405696025");
  assert.equal(
    deriveSeriesStatus(seasons, {
      confirmedSeriesIds: seasons.map((item) => item.seriesId),
    }).status,
    "completed",
  );
  assert.match(
    deriveSeriesStatus(seasons, {
      confirmedSeriesIds: seasons.map((item) => item.seriesId),
    }).reason,
    /大结局/,
  );
});

test("an older unnumbered finale does not outrank a later numbered season", () => {
  const seasons = [
    season(
      "7682325650463542334",
      `${SERIES_TITLE}大结局`,
      "2026-09-08T06:58:01.000Z",
    ),
    season(
      "7688007882683452441",
      `${SERIES_TITLE}第二季`,
      "2026-09-22T02:58:05.000Z",
    ),
  ];

  assert.equal(highestSeason(seasons).seriesId, "7688007882683452441");
});

test("recognizes only explicit series completion markers", () => {
  for (const marker of [
    "完结篇",
    "大结局",
    "全剧终",
    "最终季",
    "收官季",
    "收官篇",
  ]) {
    assert.equal(seriesCompletionMarker(`${SERIES_TITLE}${marker}`), marker);
  }
  assert.equal(seriesCompletionMarker(`${SERIES_TITLE}大 结 局`), "大结局");
  assert.equal(seriesCompletionMarker(`${SERIES_TITLE}结局改写`), null);
});

test("a generic ending word does not complete a fully ended season list", () => {
  const seriesId = "7688007882683452441";
  const seasons = [
    season(seriesId, `${SERIES_TITLE}结局改写`, "2026-09-22T02:58:05.000Z"),
  ];
  const result = deriveSeriesStatus(seasons, {
    confirmedSeriesIds: [seriesId],
  });

  assert.equal(result.status, "unknown");
  assert.match(result.reason, /系列完结标识/);
});

test("album metadata preserves official placeholder seasons", () => {
  const shellId = "7706751373240437784";
  const album = normalizeAlbumMetadata({
    publishedSeriesIds: ["7688007882683452441"],
    unpublishedSeasonCount: 1,
    unpublishedSeasons: [
      {
        seriesId: shellId,
        seasonIndex: 8,
        coverUrl: "https://example.com/cover.jpg",
      },
    ],
  });

  assert.deepEqual(album.unpublishedSeriesIds, [shellId]);
  assert.deepEqual(album.unpublishedSeasons, [
    {
      seriesId: shellId,
      seasonIndex: 8,
      coverUrl: "https://example.com/cover.jpg",
    },
  ]);
});
