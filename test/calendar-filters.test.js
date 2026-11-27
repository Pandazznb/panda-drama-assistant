import assert from "node:assert/strict";
import test from "node:test";
import { filterCalendarEntries } from "../public/calendar-filters.js";

const entries = [
  { id: "season", type: "update", kind: "season" },
  { id: "episode", type: "update", kind: "episode" },
  {
    id: "estimated-episode",
    type: "update",
    kind: "episode",
    estimated: true,
  },
  { id: "reservation", type: "reservation", kind: "reservation" },
  {
    id: "placeholder-schedule",
    type: "placeholder-schedule",
    kind: "placeholder",
  },
  { id: "pending", type: "placeholder", kind: "placeholder" },
];

test("calendar season filter includes confirmed and scheduled season entries", () => {
  assert.deepEqual(
    filterCalendarEntries(entries, "season").map((entry) => entry.id),
    ["season", "reservation", "placeholder-schedule"],
  );
});

test("calendar episode filter includes actual and estimated episode entries", () => {
  assert.deepEqual(
    filterCalendarEntries(entries, "episode").map((entry) => entry.id),
    ["episode", "estimated-episode"],
  );
});

test("calendar all filter keeps every dated entry and unknown filters are empty", () => {
  assert.deepEqual(filterCalendarEntries(entries, "all"), entries);
  assert.deepEqual(filterCalendarEntries(entries, "unknown"), []);
  assert.deepEqual(filterCalendarEntries(null, "all"), []);
});
