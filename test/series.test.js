import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSeriesStatus,
  highestSeason,
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
      `${SERIES_TITLE}完结篇`,
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
});

test("an older unnumbered finale does not outrank a later numbered season", () => {
  const seasons = [
    season(
      "7682325650463542334",
      `${SERIES_TITLE}完结篇`,
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
