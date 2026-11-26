import assert from "node:assert/strict";
import test from "node:test";
import {
  latestEpisodeEventIdBySeason,
  resolveUpdateEventOccurredAt,
} from "../public/calendar-events.js";

const subscriptionId = "sub_calendar";
const seasonId = "season_calendar";
const season = {
  episodeCount: 455,
  highWaterEpisodeCount: 455,
  firstVisibleTime: "2026-11-07T16:28:00.000Z",
  lastEpisodeChangedAt: "2026-11-26T02:11:00.411Z",
};

test("historical episode events keep their own log time", () => {
  const olderEvent = {
    id: "evt_440",
    type: "episode",
    subscriptionId,
    seasonId,
    episodeCount: 440,
    previousEpisodeCount: 425,
    createdAt: "2026-11-25T02:11:00.424Z",
  };
  const latestEvent = {
    id: "evt_455",
    type: "episode",
    subscriptionId,
    seasonId,
    episodeCount: 455,
    previousEpisodeCount: 440,
    createdAt: "2026-11-26T02:11:00.411Z",
  };
  const latestIds = latestEpisodeEventIdBySeason([
    latestEvent,
    olderEvent,
  ]);

  assert.equal(latestIds.get(`${subscriptionId}:${seasonId}`), "evt_455");
  assert.equal(
    resolveUpdateEventOccurredAt(
      olderEvent,
      season,
      latestIds.get(`${subscriptionId}:${seasonId}`),
    ),
    "2026-11-25T02:11:00.424Z",
  );
  assert.equal(
    resolveUpdateEventOccurredAt(
      latestEvent,
      season,
      latestIds.get(`${subscriptionId}:${seasonId}`),
    ),
    "2026-11-26T02:11:00.411Z",
  );
});

test("latest episode uses the official update time when detection is delayed", () => {
  const latestEvent = {
    id: "evt_delayed",
    type: "episode",
    subscriptionId,
    seasonId,
    episodeCount: 455,
    previousEpisodeCount: 440,
    createdAt: "2026-11-26T03:30:00.000Z",
  };
  const latestIds = latestEpisodeEventIdBySeason([latestEvent]);

  assert.equal(
    resolveUpdateEventOccurredAt(
      latestEvent,
      season,
      latestIds.get(`${subscriptionId}:${seasonId}`),
    ),
    "2026-11-26T02:11:00.411Z",
  );
});

test("stale latest logs do not inherit the current season update time", () => {
  const staleEvent = {
    id: "evt_stale",
    type: "episode",
    subscriptionId,
    seasonId,
    episodeCount: 440,
    previousEpisodeCount: 425,
    createdAt: "2026-11-25T02:11:00.424Z",
  };

  assert.equal(
    resolveUpdateEventOccurredAt(staleEvent, season, staleEvent.id),
    "2026-11-25T02:11:00.424Z",
  );
});
