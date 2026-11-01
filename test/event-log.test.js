import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EVENT_LOG_MAX_FILE_BYTES,
  EVENT_LOG_RETENTION_DAYS,
  EventLogStore,
} from "../src/event-log.js";

async function temporaryLogDirectory(t) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-event-log-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("event logs split by Shanghai day, paginate, and deduplicate on reload", async (t) => {
  const directory = await temporaryLogDirectory(t);
  const store = new EventLogStore(directory);
  await store.appendEvents([
    {
      id: "event-1",
      type: "baseline",
      message: "第一天的记录",
      createdAt: "2026-10-29T15:59:59.000Z",
    },
    {
      id: "event-2",
      type: "episode",
      message: "跨日后的记录",
      createdAt: "2026-10-29T16:00:00.000Z",
    },
    {
      id: "event-3",
      type: "season",
      message: "最新记录",
      createdAt: "2026-10-29T16:01:00.000Z",
    },
    {
      id: "event-1",
      type: "baseline",
      message: "重复记录",
      createdAt: "2026-10-29T15:59:59.000Z",
    },
  ]);

  const files = (await fs.readdir(directory)).sort();
  assert.deepEqual(files, [
    "events-2026-10-29-0001.jsonl",
    "events-2026-10-30-0001.jsonl",
  ]);

  const firstPage = await store.readPage({ offset: 0, limit: 2 });
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.fileCount, 2);
  assert.equal(firstPage.maxFileBytes, EVENT_LOG_MAX_FILE_BYTES);
  assert.equal(firstPage.retentionDays, EVENT_LOG_RETENTION_DAYS);
  assert.equal(firstPage.timeZone, "Asia/Shanghai");
  assert.deepEqual(
    firstPage.events.map((event) => event.id),
    ["event-3", "event-2"],
  );

  const secondPage = await store.readPage({ offset: 2, limit: 2 });
  assert.deepEqual(
    secondPage.events.map((event) => event.id),
    ["event-1"],
  );

  const exported = await store.readAllFiles();
  assert.equal(exported.fileName, "hongguo-events-all.jsonl");
  assert.equal(exported.fileCount, 2);
  assert.deepEqual(
    exported.content
      .toString("utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).id),
    ["event-1", "event-2", "event-3"],
  );

  const reopened = new EventLogStore(directory);
  const reloaded = await reopened.readPage({ offset: 0, limit: 10 });
  assert.equal(reloaded.total, 3);
  assert.deepEqual(
    reloaded.events.map((event) => event.id),
    ["event-3", "event-2", "event-1"],
  );
});

test("event logs rotate to a new part when one MiB-equivalent limit is reached", async (t) => {
  const directory = await temporaryLogDirectory(t);
  const store = new EventLogStore(directory, { maxFileBytes: 300 });
  const message = "x".repeat(100);
  await store.appendEvents([
    {
      id: "rotated-1",
      type: "episode",
      message,
      createdAt: "2026-10-30T01:00:00.000Z",
    },
    {
      id: "rotated-2",
      type: "episode",
      message,
      createdAt: "2026-10-30T01:01:00.000Z",
    },
  ]);

  const files = (await fs.readdir(directory)).sort();
  assert.deepEqual(files, [
    "events-2026-10-30-0001.jsonl",
    "events-2026-10-30-0002.jsonl",
  ]);
  const sizes = await Promise.all(
    files.map(async (file) => (await fs.stat(path.join(directory, file))).size),
  );
  assert.ok(sizes.every((size) => size <= 300));
});

test("event logs remove files older than 30 days in Shanghai", async (t) => {
  const directory = await temporaryLogDirectory(t);
  const events = [
    {
      fileName: "events-2026-09-30-0001.jsonl",
      event: {
        id: "event-expired-september",
        type: "episode",
        message: "超过保留期",
        createdAt: "2026-09-30T01:00:00.000Z",
      },
    },
    {
      fileName: "events-2026-10-02-0001.jsonl",
      event: {
        id: "event-expired-october",
        type: "episode",
        message: "超过保留期",
        createdAt: "2026-10-02T01:00:00.000Z",
      },
    },
    {
      fileName: "events-2026-10-03-0001.jsonl",
      event: {
        id: "event-boundary",
        type: "baseline",
        message: "保留期边界",
        createdAt: "2026-10-03T01:00:00.000Z",
      },
    },
    {
      fileName: "events-2026-11-02-0001.jsonl",
      event: {
        id: "event-current",
        type: "episode",
        message: "当前记录",
        createdAt: "2026-11-02T01:00:00.000Z",
      },
    },
  ];
  await Promise.all(
    events.map(({ fileName, event }) =>
      fs.writeFile(
        path.join(directory, fileName),
        `${JSON.stringify(event)}\n`,
        "utf8",
      ),
    ),
  );

  const store = new EventLogStore(directory, {
    now: () => new Date("2026-11-02T06:00:00.000Z"),
  });
  const page = await store.readPage({ offset: 0, limit: 100 });

  assert.equal(page.retentionDays, 30);
  assert.equal(page.total, 2);
  assert.deepEqual(
    page.events.map((event) => event.id),
    ["event-current", "event-boundary"],
  );
  assert.deepEqual(
    (await fs.readdir(directory)).sort(),
    [
      "events-2026-10-03-0001.jsonl",
      "events-2026-11-02-0001.jsonl",
    ],
  );
});
