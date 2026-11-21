import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSeriesStatus,
  highestSeason,
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
