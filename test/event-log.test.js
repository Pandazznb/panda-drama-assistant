import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EVENT_LOG_MAX_FILE_BYTES,
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
