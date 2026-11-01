import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  SystemLogStore,
  sanitizeSystemLogText,
} from "../src/system-log.js";

async function createStore(t, options = {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-system-log-"),
  );
  const store = new SystemLogStore(directory, options);
  await store.init();
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, store };
}

test("system logs are returned newest first with stable pagination", async (t) => {
  const { store } = await createStore(t);
  await store.append([
    {
      id: "system-log-old",
      category: "system",
      action: "system.test.old",
      message: "较早操作",
      createdAt: "2026-11-02T01:00:00.000Z",
    },
    {
      id: "system-log-new",
      category: "account",
      action: "account.test.new",
      level: "success",
      message: "最新操作",
      createdAt: "2026-11-02T03:00:00.000Z",
    },
    {
      id: "system-log-middle",
      category: "settings",
      action: "settings.test.middle",
      message: "中间操作",
      createdAt: "2026-11-02T02:00:00.000Z",
    },
  ]);

  const firstPage = await store.readPage({ offset: 0, limit: 2 });
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.fileCount, 1);
  assert.deepEqual(
    firstPage.entries.map((entry) => entry.id),
    ["system-log-new", "system-log-middle"],
  );

  const secondPage = await store.readPage({ offset: 2, limit: 2 });
  assert.deepEqual(
    secondPage.entries.map((entry) => entry.id),
    ["system-log-old"],
  );
  assert.equal(secondPage.newestAt, "2026-11-02T03:00:00.000Z");
  assert.equal(secondPage.oldestAt, "2026-11-02T01:00:00.000Z");
});

test("system logs split into a new file after reaching the size limit", async (t) => {
  const { directory, store } = await createStore(t, {
    maxFileBytes: 320,
  });
  await store.append([
    {
      id: "system-log-split-1",
      category: "system",
      action: "system.split.first",
      message: `第一条记录 ${"甲".repeat(90)}`,
      createdAt: "2026-11-02T04:00:00.000Z",
    },
    {
      id: "system-log-split-2",
      category: "system",
      action: "system.split.second",
      message: `第二条记录 ${"乙".repeat(90)}`,
      createdAt: "2026-11-02T04:01:00.000Z",
    },
  ]);

  const file = await store.readAllFiles();
  assert.equal(file.fileCount, 2);
  assert.equal(file.fileName, "hongguo-system-actions-all.jsonl");
  assert.match(file.content.toString("utf8"), /system-log-split-1/);
  assert.match(file.content.toString("utf8"), /system-log-split-2/);
  const fileNames = (await fs.readdir(directory)).sort();
  assert.deepEqual(fileNames, [
    "system-2026-11-02-0001.jsonl",
    "system-2026-11-02-0002.jsonl",
  ]);
});

test("system logs hide phone numbers, cookies, tokens and proxy credentials", async (t) => {
  const { store } = await createStore(t);
  await store.append({
    id: "system-log-sensitive",
    category: "account",
    action: "account.test.sensitive",
    message:
      "手机号 13812345678；Cookie: session-secret；Authorization: Bearer token-secret；代理 http://proxy-user:proxy-pass@127.0.0.1:7890",
    metadata: {
      token: "metadata-token-secret",
      mobile: "13912345678",
      proxyUrl: "http://metadata-user:metadata-pass@127.0.0.1:7890",
      detail:
        "验证码：654321；token=query-secret；手机号 13712345678",
    },
    createdAt: "2026-11-02T05:00:00.000Z",
  });

  const page = await store.readPage();
  const serialized = JSON.stringify(page.entries);
  for (const secret of [
    "13812345678",
    "13912345678",
    "13712345678",
    "session-secret",
    "token-secret",
    "metadata-token-secret",
    "proxy-user",
    "proxy-pass",
    "metadata-user",
    "metadata-pass",
    "654321",
    "query-secret",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.match(page.entries[0].message, /手机号已隐藏/);
  assert.match(page.entries[0].message, /已隐藏凭据/);
});

test("system log text sanitizer preserves readable non-sensitive content", () => {
  assert.equal(
    sanitizeSystemLogText("账号同步完成：导入 2 部短剧。"),
    "账号同步完成：导入 2 部短剧。",
  );
});
