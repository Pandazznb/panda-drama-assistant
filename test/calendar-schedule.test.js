import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSeasonUpdateSchedule,
  parseUpdateRule,
} from "../public/calendar-schedule.js";

test("calendar update rules parse weekly schedules and episode batches", () => {
  assert.deepEqual(parseUpdateRule("每周六00:06更新40集"), {
    ruleText: "每周六00:06更新40集",
    frequency: "weekly",
    weekdays: [6],
    hour: 0,
    minute: 6,
    timeKnown: true,
    episodeBatch: 40,
  });
});

test("calendar update rules parse daily schedules and weekday ranges", () => {
  const daily = parseUpdateRule("每天上午10点更新2集");
  assert.equal(daily.frequency, "daily");
  assert.equal(daily.hour, 10);
  assert.equal(daily.minute, 0);
  assert.equal(daily.episodeBatch, 2);

  const weekdayRange = parseUpdateRule("每周一至周五00:10更新2集");
  assert.deepEqual(weekdayRange.weekdays, [1, 2, 3, 4, 5]);
});

test("calendar update rules reject vague text without a recurrence", () => {
  assert.equal(parseUpdateRule("热播短剧持续更新"), null);
  assert.equal(parseUpdateRule("红果当前标注更新至55集"), null);
});

test("unknown total episode count uses a bounded weekly forecast", () => {
  const entries = buildSeasonUpdateSchedule({
    season: {
      title: "我，万古第一第四季",
      status: "updating",
      episodeCount: 55,
      totalEpisodeCount: 55,
      highWaterEpisodeCount: 55,
      updateRule: "每周二00:10更新10集",
    },
    todayDateKey: "2026-11-25",
    now: new Date("2026-11-25T08:00:00+08:00"),
    forecastDays: 14,
  });

  assert.deepEqual(
    entries.map((entry) => entry.dateKey),
    ["2026-12-01", "2026-12-08"],
  );
  assert.deepEqual(
    entries.map((entry) => entry.projectedEpisodeCount),
    [65, 75],
  );
  assert.ok(
    entries.every(
      (entry) => entry.confirmedTotalEpisodeCount === null,
    ),
  );
});

test("confirmed remaining episodes cap the forecast at the known total", () => {
  const entries = buildSeasonUpdateSchedule({
    season: {
      title: "已确认总集数",
      status: "updating",
      episodeCount: 95,
      totalEpisodeCount: 100,
      highWaterEpisodeCount: 95,
      updateRule: "每周二00:10更新10集",
    },
    todayDateKey: "2026-11-25",
    now: new Date("2026-11-25T08:00:00+08:00"),
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].dateKey, "2026-12-01");
  assert.equal(entries[0].plannedEpisodes, 5);
  assert.equal(entries[0].projectedEpisodeCount, 100);
  assert.equal(entries[0].confirmedTotalEpisodeCount, 100);
});

test("completed seasons immediately discard later estimated updates", () => {
  const entries = buildSeasonUpdateSchedule({
    season: {
      title: "已完结",
      status: "completed",
      episodeCount: 100,
      totalEpisodeCount: 100,
      highWaterEpisodeCount: 100,
      updateRule: "每周二00:10更新10集",
    },
    todayDateKey: "2026-11-25",
    now: new Date("2026-11-25T08:00:00+08:00"),
  });

  assert.deepEqual(entries, []);
});

test("a passed time on today's rule starts with the next occurrence", () => {
  const entries = buildSeasonUpdateSchedule({
    season: {
      title: "今天已经更新",
      status: "updating",
      episodeCount: 10,
      totalEpisodeCount: 10,
      highWaterEpisodeCount: 10,
      updateRule: "每周三00:10更新2集",
    },
    todayDateKey: "2026-11-25",
    now: new Date("2026-11-25T08:00:00+08:00"),
    forecastDays: 8,
  });

  assert.equal(entries[0].dateKey, "2026-12-02");
});

test("rules without an explicit time still use the current day", () => {
  const entries = buildSeasonUpdateSchedule({
    season: {
      title: "更新时间未知",
      status: "updating",
      episodeCount: 10,
      totalEpisodeCount: 10,
      highWaterEpisodeCount: 10,
      updateRule: "每周三更新2集",
    },
    todayDateKey: "2026-11-25",
    now: new Date("2026-11-25T08:00:00+08:00"),
    forecastDays: 1,
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0].dateKey, "2026-11-25");
  assert.equal(entries[0].timeKnown, false);
});
