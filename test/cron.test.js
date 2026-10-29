import assert from "node:assert/strict";
import test from "node:test";
import {
  CRON_TIME_ZONE,
  isValidCronExpression,
  legacyIntervalMinutesToCron,
  nextCronOccurrence,
  normalizeCronExpression,
} from "../src/cron.js";

test("Cron expressions use five fields and Asia/Shanghai time", () => {
  assert.equal(CRON_TIME_ZONE, "Asia/Shanghai");
  assert.equal(
    nextCronOccurrence(
      "0 8 * * *",
      new Date("2026-10-26T23:59:00.000Z"),
    ).toISOString(),
    "2026-10-27T00:00:00.000Z",
  );
  assert.equal(
    nextCronOccurrence(
      "0 9 * * *",
      new Date("2026-10-27T08:00:00.000Z"),
    ).toISOString(),
    "2026-10-28T01:00:00.000Z",
  );
});

test("Cron validation normalizes whitespace and rejects unsupported syntax", () => {
  assert.equal(
    normalizeCronExpression("  0   */6  * * * "),
    "0 */6 * * *",
  );
  assert.equal(isValidCronExpression("0 */6 * * *"), true);
  for (const expression of [
    "",
    "0 0 * *",
    "0 0 0 * * *",
    "60 * * * *",
    "*/0 * * * *",
    "@daily",
  ]) {
    assert.equal(isValidCronExpression(expression), false);
  }
});

test("legacy minute intervals migrate only when Cron can express them exactly", () => {
  assert.equal(legacyIntervalMinutesToCron(5), "*/5 * * * *");
  assert.equal(legacyIntervalMinutesToCron(30), "*/30 * * * *");
  assert.equal(legacyIntervalMinutesToCron(60), "0 * * * *");
  assert.equal(legacyIntervalMinutesToCron(120), "0 */2 * * *");
  assert.equal(legacyIntervalMinutesToCron(1_440), "0 0 * * *");
  assert.equal(legacyIntervalMinutesToCron(10_080), "0 0 * * 0");
  for (const intervalMinutes of [4, 45, 90, 10_081, 12.5, "bad"]) {
    assert.equal(legacyIntervalMinutesToCron(intervalMinutes), null);
  }
});
