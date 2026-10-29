import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApplication } from "../server.js";

function createScreenshotImportMock(overrides = {}) {
  const calls = {
    analyze: [],
    importSeriesIds: [],
    search: [],
    warmup: 0,
  };
  return {
    calls,
    async analyze(image, declaredType) {
      calls.analyze.push({ image, declaredType });
      return {
        image: {
          mimeType: "image/png",
          bytes: image.length,
          width: 589,
          height: 1280,
        },
        items: [
          {
            rawTitle: "测试短剧",
            title: "测试短剧",
            candidates: [],
            suggestedSeriesId: null,
          },
        ],
        text: "测试短剧 1集/10集",
      };
    },
    async importSeriesIds(seriesIds, service) {
      calls.importSeriesIds.push({ seriesIds, service });
      return {
        outcomes: seriesIds.map((seriesId) => ({
          seriesId,
          status: "imported",
          subscriptionId: `sub_${seriesId}`,
          title: "测试短剧",
          message: "已开始追更。",
        })),
        importedCount: seriesIds.length,
        skippedCount: 0,
        failedCount: 0,
        subscriptionCount: seriesIds.length,
        checkedCount: seriesIds.length,
        checkErrors: 0,
      };
    },
    async search(query) {
      calls.search.push(query);
      return [
        {
          seriesId: "7694653385668037657",
          title: "测试短剧",
          episodeCount: 12,
          status: "completed",
          coverUrl: "",
        },
      ];
    },
    async warmup() {
      calls.warmup += 1;
      return { ready: true };
    },
    async stop() {},
    ...overrides,
  };
}

async function startHarness(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hongguo-server-"));
  const stateFile = path.join(directory, "state.json");
  const screenshotImport =
    options.screenshotImport || createScreenshotImportMock();
  const app = await createApplication({
    stateFile,
    screenshotImport,
    ...options,
  });
  await new Promise((resolve) => {
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const address = app.server.address();
  t.after(async () => {
    app.service.stop();
    await app.screenshotImport.stop();
    await new Promise((resolve) => app.server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    ...app,
    origin: `http://127.0.0.1:${address.port}`,
    stateFile,
  };
}

test("HTTP app serves the dashboard and starts with an empty state", async (t) => {
  const harness = await startHarness(t);

  const pageResponse = await fetch(`${harness.origin}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(pageResponse.headers.get("content-type"), /^text\/html/);
  assert.match(
    pageResponse.headers.get("content-security-policy"),
    /img-src[^;]*blob:/,
  );
  const page = await pageResponse.text();
  assert.match(page, /红果追更/);
  assert.match(page, /data-theme-choice="auto"/);
  assert.match(page, /data-theme-choice="light"/);
  assert.match(page, /data-theme-choice="dark"/);

  const themeResponse = await fetch(`${harness.origin}/theme.js`);
  assert.equal(themeResponse.status, 200);
  assert.match(
    themeResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  assert.match(await themeResponse.text(), /prefers-color-scheme: dark/);

  const stateResponse = await fetch(`${harness.origin}/api/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.deepEqual(state.subscriptions, []);
  assert.equal(state.settings.intervalMinutes, 30);
  assert.equal(state.settings.episodeNotificationWindowMinutes, 0);
  assert.equal(state.settings.discoveryReminderDurationMinutes, 0);
  assert.equal(state.settings.discoveryReminderCron, "0 */6 * * *");
  assert.equal(state.settings.pendingDiscoveryReminderCount, 0);
  assert.equal(state.settings.notifications.enabledCount, 0);
});

test("settings API saves custom intervals and all notification channels without leaking secrets", async (t) => {
  const harness = await startHarness(t);
  const response = await fetch(`${harness.origin}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intervalMinutes: 10080,
      episodeNotificationWindowMinutes: 60,
      discoveryReminderDurationMinutes: 1440,
      discoveryReminderCron: "0 */8 * * *",
      notifications: {
        proxy: {
          enabled: true,
          url: "http://proxy-user:proxy-pass@127.0.0.1:7890",
          channels: {
            bark: true,
            telegram: true,
          },
        },
        bark: { enabled: true, key: "abc_DEF-123" },
        ntfy: {
          enabled: true,
          topic: "hongguo-private-topic",
          token: "tk_abcdefghijklmnopqrstuvwxyz",
        },
        telegram: {
          enabled: true,
          botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
          chatId: "123456789",
        },
        wecom: {
          enabled: true,
          key: "wecom_SERVER-key-123",
        },
        dingtalk: {
          enabled: true,
          accessToken: "ding_SERVER-token-123",
          secret: "SEC_SERVER-secret-123",
        },
      },
    }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.settings.intervalMinutes, 10080);
  assert.equal(payload.settings.episodeNotificationWindowMinutes, 60);
  assert.equal(payload.settings.discoveryReminderDurationMinutes, 1440);
  assert.equal(payload.settings.discoveryReminderCron, "0 */8 * * *");
  assert.equal(payload.settings.notifications.enabledCount, 5);
  assert.deepEqual(payload.settings.notifications.proxy, {
    enabled: true,
    configured: true,
    urlHint: "http://***@127.0.0.1:7890",
    channels: {
      bark: true,
      ntfy: false,
      telegram: true,
      wecom: false,
      dingtalk: false,
    },
  });
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("abc_DEF-123"), false);
  assert.equal(serialized.includes("hongguo-private-topic"), false);
  assert.equal(
    serialized.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"),
    false,
  );
  assert.equal(serialized.includes("wecom_SERVER-key-123"), false);
  assert.equal(serialized.includes("ding_SERVER-token-123"), false);
  assert.equal(serialized.includes("SEC_SERVER-secret-123"), false);
  assert.equal(serialized.includes("proxy-user"), false);
  assert.equal(serialized.includes("proxy-pass"), false);

  const stateResponse = await fetch(`${harness.origin}/api/state`);
  const state = await stateResponse.json();
  assert.equal(state.settings.intervalMinutes, 10080);
  assert.equal(state.settings.episodeNotificationWindowMinutes, 60);
  assert.equal(state.settings.discoveryReminderDurationMinutes, 1440);
  assert.equal(state.settings.discoveryReminderCron, "0 */8 * * *");
  assert.equal(state.settings.notifications.configuredCount, 5);
  assert.equal(state.settings.notifications.proxy.enabled, true);
  assert.equal(state.settings.notifications.proxy.configured, true);
  assert.equal(
    state.settings.notifications.proxy.urlHint,
    "http://***@127.0.0.1:7890",
  );
  assert.equal(JSON.stringify(state).includes("abc_DEF-123"), false);
  assert.equal(JSON.stringify(state).includes("proxy-pass"), false);

  const onDisk = JSON.parse(await fs.readFile(harness.stateFile, "utf8"));
  assert.equal(onDisk.version, 7);
  assert.equal(onDisk.settings.discoveryReminderDurationMinutes, 1440);
  assert.equal(onDisk.settings.discoveryReminderCron, "0 */8 * * *");
  assert.deepEqual(onDisk.settings.notifications.proxy, {
    enabled: true,
    url: "http://proxy-user:proxy-pass@127.0.0.1:7890/",
    channels: {
      bark: true,
      ntfy: false,
      telegram: true,
      wecom: false,
      dingtalk: false,
    },
  });
});

test("settings API rejects invalid discovery reminder values", async (t) => {
  const harness = await startHarness(t);
  for (const [body, code] of [
    [
      { discoveryReminderDurationMinutes: 43_201 },
      "INVALID_DISCOVERY_REMINDER_DURATION",
    ],
    [
      { discoveryReminderCron: "60 * * * *" },
      "INVALID_DISCOVERY_REMINDER_CRON",
    ],
  ]) {
    const response = await fetch(`${harness.origin}/api/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, code);
  }
});

test("notification test API explains when no channel is enabled", async (t) => {
  const harness = await startHarness(t);
  const response = await fetch(
    `${harness.origin}/api/notifications/test`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "NO_NOTIFICATION_CHANNEL");
  assert.match(payload.error.message, /还没有启用/);
});

test("batch check API reports completed series as skipped", async (t) => {
  const harness = await startHarness(t);
  harness.service.checkAll = async (options) => {
    assert.deepEqual(options, {
      notify: true,
      discover: true,
      forceDiscovery: true,
    });
    return {
      subscriptions: 2,
      checkedSubscriptions: 0,
      skippedCompleted: 2,
      seasonsChecked: 0,
      updatedSeasons: 0,
      discoveredSeasons: 0,
      errors: 0,
    };
  };

  const response = await fetch(`${harness.origin}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.skippedCompleted, 2);
  assert.match(payload.message, /2 个已完结系列已跳过/);
});

test("watched API marks a subscription as viewed", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.markSubscriptionWatched = async (subscriptionId) => {
    calls.push(subscriptionId);
    return {
      id: subscriptionId,
      title: "测试短剧",
      lastWatchedAt: "2026-10-27T08:00:00.000Z",
    };
  };

  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/watched`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.id, "sub_test");
  assert.equal(payload.message, "已将《测试短剧》标记为已观看。");
  assert.deepEqual(calls, ["sub_test"]);
});

test("watched API returns 404 for an unknown subscription", async (t) => {
  const harness = await startHarness(t);
  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_missing/watched`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, "SUBSCRIPTION_NOT_FOUND");
});

test("HTTP API rejects disallowed share hosts before upstream access", async (t) => {
  const harness = await startHarness(t);

  const response = await fetch(`${harness.origin}/api/subscriptions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      input: "https://example.com/detail?series_id=7694653385668037657",
    }),
  });
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "HOST_NOT_ALLOWED");
});

test("adding a subscription immediately discovers the official season list", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  const results = [
    {
      action: "created",
      subscriptionId: "sub_created",
      title: "测试短剧",
      seasonTitle: "测试短剧第一季",
      episodeCount: 12,
    },
    {
      action: "season_added",
      subscriptionId: "sub_existing",
      title: "测试短剧",
      seasonTitle: "测试短剧第二季",
      episodeCount: 20,
    },
  ];
  harness.service.addSubscription = async (input) => {
    calls.push({ type: "add", input });
    return results.shift();
  };
  harness.service.checkSubscription = async (subscriptionId, options) => {
    calls.push({ type: "check", subscriptionId, options });
    return {
      seasonsChecked: 1,
      discoveredSeasons: 13,
      errors: 0,
      discoveryError: null,
    };
  };

  for (const input of ["first-series", "second-season"]) {
    const response = await fetch(`${harness.origin}/api/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.result.discoveryCompleted, true);
    assert.equal(payload.result.discoveryError, null);
  }

  assert.deepEqual(calls, [
    { type: "add", input: "first-series" },
    {
      type: "check",
      subscriptionId: "sub_created",
      options: {
        notify: false,
        discover: true,
        forceDiscovery: true,
        markUnread: false,
      },
    },
    { type: "add", input: "second-season" },
    {
      type: "check",
      subscriptionId: "sub_existing",
      options: {
        notify: false,
        discover: true,
        forceDiscovery: true,
        markUnread: false,
      },
    },
  ]);
});

test("subscription creation succeeds when immediate season discovery fails", async (t) => {
  const harness = await startHarness(t);
  harness.service.addSubscription = async () => ({
    action: "created",
    subscriptionId: "sub_created",
    title: "测试短剧",
    seasonTitle: "测试短剧",
    episodeCount: 12,
  });
  harness.service.checkSubscription = async () => {
    throw new Error("官方多季接口暂时不可用");
  };

  const response = await fetch(`${harness.origin}/api/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "test-series" }),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.subscriptionId, "sub_created");
  assert.equal(payload.result.discoveryCompleted, false);
  assert.equal(payload.result.discoveryError, "官方多季接口暂时不可用");
  assert.match(payload.message, /稍后会自动重试/);
});

test("HTTP API requires JSON for mutation requests", async (t) => {
  const harness = await startHarness(t);

  const response = await fetch(`${harness.origin}/api/subscriptions`, {
    method: "POST",
    headers: {
      "content-type": "text/plain",
    },
    body: "7694653385668037657",
  });
  assert.equal(response.status, 415);
  const payload = await response.json();
  assert.equal(payload.error.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("series search API uses the local OCR service", async (t) => {
  const screenshotImport = createScreenshotImportMock();
  const harness = await startHarness(t, { screenshotImport });

  const response = await fetch(
    `${harness.origin}/api/series/search?query=${encodeURIComponent("测试短剧")}`,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.results[0].seriesId, "7694653385668037657");
  assert.deepEqual(screenshotImport.calls.search, ["测试短剧"]);
});

test("screenshot analysis accepts raw image bytes and rejects oversized bodies", async (t) => {
  const screenshotImport = createScreenshotImportMock();
  const harness = await startHarness(t, { screenshotImport });
  const image = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  const response = await fetch(
    `${harness.origin}/api/screenshot-import/analyze`,
    {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: image,
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items[0].title, "测试短剧");
  assert.equal(screenshotImport.calls.analyze.length, 1);
  assert.equal(screenshotImport.calls.analyze[0].declaredType, "image/png");
  assert.deepEqual(screenshotImport.calls.analyze[0].image, image);

  const oversized = await fetch(
    `${harness.origin}/api/screenshot-import/analyze`,
    {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: Buffer.alloc(8 * 1024 * 1024 + 1),
    },
  );
  assert.equal(oversized.status, 413);
  const oversizedPayload = await oversized.json();
  assert.equal(oversizedPayload.error.code, "IMAGE_TOO_LARGE");
  assert.equal(screenshotImport.calls.analyze.length, 1);
});

test("screenshot OCR warmup initializes the recognition service", async (t) => {
  const screenshotImport = createScreenshotImportMock();
  const harness = await startHarness(t, { screenshotImport });

  const response = await fetch(
    `${harness.origin}/api/screenshot-import/warmup`,
    { method: "POST" },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.result, { ready: true });
  assert.equal(screenshotImport.calls.warmup, 1);
});

test("screenshot import delegates selected IDs and reports the outcome", async (t) => {
  const screenshotImport = createScreenshotImportMock();
  const harness = await startHarness(t, { screenshotImport });
  const seriesIds = [
    "7694653385668037657",
    "7694653385668037658",
  ];

  const response = await fetch(
    `${harness.origin}/api/screenshot-import/import`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesIds }),
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.importedCount, 2);
  assert.equal(payload.message, "已导入 2 部。");
  assert.deepEqual(
    screenshotImport.calls.importSeriesIds[0].seriesIds,
    seriesIds,
  );
  assert.equal(
    screenshotImport.calls.importSeriesIds[0].service,
    harness.service,
  );
});

test("account login routes have been removed", async (t) => {
  const harness = await startHarness(t);

  const response = await fetch(
    `${harness.origin}/api/account/login-sessions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, "NOT_FOUND");
});
