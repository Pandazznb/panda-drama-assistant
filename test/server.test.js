import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createApplication } from "../server.js";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

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

function createAccountServiceMock(overrides = {}) {
  const calls = {
    cancelLogin: [],
    cancelSmsLogin: [],
    createLogin: 0,
    createSmsLogin: [],
    getLoginQr: [],
    logout: 0,
    pollLogin: [],
    pollSmsLogin: [],
    refresh: 0,
    requireCredentials: 0,
    sendSmsCode: [],
    setFavorite: [],
    setReservation: [],
    status: 0,
    verifySmsCode: [],
  };
  const account = {
    authenticated: true,
    profile: {
      id: "1234567890123456789",
      name: "测试用户",
    },
    savedAt: "2026-10-31T08:00:00.000Z",
    snapshot: {
      profile: {
        id: "1234567890123456789",
        name: "测试用户",
      },
      fetchedAt: "2026-10-31T08:01:00.000Z",
      categories: {
        favorites: {
          key: "favorites",
          status: "ok",
          items: [],
          count: 0,
          fetchedAt: "2026-10-31T08:01:00.000Z",
        },
      },
    },
    refreshing: false,
    issue: "",
    message: "",
  };
  return {
    calls,
    async start() {
      return account;
    },
    async stop() {},
    status() {
      calls.status += 1;
      return account;
    },
    async createLogin() {
      calls.createLogin += 1;
      return {
        loginId: "login-test",
        status: "pending",
        expiresAt: "2026-10-31T08:05:00.000Z",
      };
    },
    getLoginQr(loginId) {
      calls.getLoginQr.push(loginId);
      return Buffer.from("fake-png");
    },
    async pollLogin(loginId) {
      calls.pollLogin.push(loginId);
      return {
        loginId,
        status: "confirmed",
        expiresAt: "2026-10-31T08:05:00.000Z",
        profile: account.profile,
        error: "",
      };
    },
    async cancelLogin(loginId) {
      calls.cancelLogin.push(loginId);
      return { canceled: true };
    },
    async createSmsLogin({ countryCode, mobile }) {
      calls.createSmsLogin.push({ countryCode, mobile });
      return {
        loginId: "sms-login-test",
        status: "pending_code",
        maskedMobile: "+86 *******8000",
        expiresAt: "2026-10-31T08:05:00.000Z",
        retryAfterSeconds: 0,
        profile: null,
        error: "",
      };
    },
    async sendSmsCode(loginId) {
      calls.sendSmsCode.push(loginId);
      return {
        loginId,
        status: "pending_verify",
        maskedMobile: "+86 *******8000",
        expiresAt: "2026-10-31T08:05:00.000Z",
        retryAfterSeconds: 60,
        profile: null,
        error: "",
        message: "验证码已发送，请查看手机短信。",
      };
    },
    async verifySmsCode(loginId, code) {
      calls.verifySmsCode.push({ loginId, code });
      return {
        loginId,
        status: "profile_loading",
        maskedMobile: "+86 *******8000",
        expiresAt: "2026-10-31T08:05:00.000Z",
        retryAfterSeconds: 0,
        profile: null,
        error: "",
      };
    },
    pollSmsLogin(loginId) {
      calls.pollSmsLogin.push(loginId);
      return {
        loginId,
        status: "succeeded",
        maskedMobile: "+86 *******8000",
        expiresAt: "2026-10-31T08:05:00.000Z",
        retryAfterSeconds: 0,
        profile: account.profile,
        error: "",
      };
    },
    async cancelSmsLogin(loginId) {
      calls.cancelSmsLogin.push(loginId);
      return { canceled: true };
    },
    async logout() {
      calls.logout += 1;
      return { ...account, authenticated: false, profile: null, snapshot: null };
    },
    async refresh() {
      calls.refresh += 1;
      return account;
    },
    requireCredentials() {
      calls.requireCredentials += 1;
      return {
        userId: account.profile.id,
        cookie: "test-cookie",
      };
    },
    async setFavorite(credentials, seriesId, add) {
      calls.setFavorite.push({ credentials, seriesId, add });
      return { ok: true };
    },
    async setReservation(credentials, seriesId, add) {
      calls.setReservation.push({ credentials, seriesId, add });
      return { ok: true };
    },
    ...overrides,
  };
}

async function startHarness(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hongguo-server-"));
  const stateFile = path.join(directory, "state.json");
  const screenshotImport =
    options.screenshotImport || createScreenshotImportMock();
  const accountService =
    options.accountService || createAccountServiceMock();
  const app = await createApplication({
    stateFile,
    screenshotImport,
    accountService,
    ...options,
  });
  await new Promise((resolve) => {
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const address = app.server.address();
  t.after(async () => {
    app.service.stop();
    app.accountSyncService.stop();
    await app.screenshotImport.stop();
    await app.accountService.stop();
    await new Promise((resolve) => app.server.close(resolve));
    await app.store.close();
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
  assert.match(
    pageResponse.headers.get("content-security-policy"),
    /manifest-src 'self'/,
  );
  assert.match(
    pageResponse.headers.get("content-security-policy"),
    /worker-src 'self'/,
  );
  assert.match(
    pageResponse.headers.get("content-security-policy"),
    /style-src 'self' 'unsafe-inline'/,
  );
  const stylesResponse = await fetch(`${harness.origin}/styles.css`);
  assert.match(
    stylesResponse.headers.get("content-security-policy"),
    /style-src 'self'(?:;|$)/,
  );
  assert.doesNotMatch(
    stylesResponse.headers.get("content-security-policy"),
    /unsafe-inline/,
  );
  const page = await pageResponse.text();
  assert.match(page, /短剧助手/);
  assert.equal((page.match(/data-theme-toggle/g) || []).length, 1);
  assert.doesNotMatch(page, /data-theme-choice=/);
  assert.match(page, /href="\/api\/logs\/file"/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /aria-label="在新标签页打开全部日志文件"/);
  assert.match(page, /显示全部/);
  assert.match(page, /id="watchlist-search-input"/);
  assert.match(page, /aria-label="正在追更的短剧搜索结果"/);
  assert.match(page, /搜索剧名、全拼或首字母/);
  assert.match(page, /id="open-add-dialog"/);
  assert.match(page, /id="add-dialog"/);
  assert.match(page, /id="share-input-clear"/);
  assert.match(page, /id="watchlist-search-clear"/);
  assert.match(page, /symbol id="icon-bell-minus"/);
  assert.match(page, /symbol id="icon-bell-off"/);
  assert.match(page, /symbol id="icon-minus"/);
  assert.match(page, /id="account-sync-details"/);
  assert.match(page, /id="settings-account-summary"/);
  assert.match(page, /id="settings-account-sync-details-panel"/);
  assert.match(page, /id="settings-account-sync-details"/);
  assert.doesNotMatch(page, /id="settings-account-details"/);
  assert.match(page, /同步明细/);
  assert.match(page, /href="\/logs#system"/);
  assert.match(
    page,
    /href="\/assets\/panda-drama-assistant-icon\.svg"/,
  );
  assert.match(page, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(
    page,
    /rel="apple-touch-icon" href="\/assets\/apple-touch-icon\.png"/,
  );
  assert.match(page, /name="application-name" content="短剧助手"/);
  assert.match(page, /name="mobile-web-app-capable" content="yes"/);
  assert.match(page, /src="\/pwa\.js" defer/);
  assert.match(page, /data-pwa-install/);

  const iconResponse = await fetch(
    `${harness.origin}/assets/panda-drama-assistant-icon.svg`,
  );
  assert.equal(iconResponse.status, 200);
  assert.match(iconResponse.headers.get("content-type"), /^image\/svg\+xml/);
  assert.match(await iconResponse.text(), /短剧助手图标/);

  const appIconResponse = await fetch(
    `${harness.origin}/assets/panda-drama-assistant-icon.png`,
  );
  assert.equal(appIconResponse.status, 200);
  assert.equal(appIconResponse.headers.get("content-type"), "image/png");
  assert.equal(
    Buffer.from(await appIconResponse.arrayBuffer()).subarray(1, 4).toString(),
    "PNG",
  );

  const manifestResponse = await fetch(
    `${harness.origin}/manifest.webmanifest`,
  );
  assert.equal(manifestResponse.status, 200);
  assert.match(
    manifestResponse.headers.get("content-type"),
    /^application\/manifest\+json/,
  );
  assert.equal(manifestResponse.headers.get("cache-control"), "no-cache");
  const manifest = await manifestResponse.json();
  assert.equal(manifest.name, "熊猫 · 短剧助手");
  assert.equal(manifest.short_name, "短剧助手");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map((icon) => [icon.sizes, icon.purpose]),
    [
      ["192x192", "any"],
      ["512x512", "any"],
      ["512x512", "maskable"],
    ],
  );

  const serviceWorkerResponse = await fetch(`${harness.origin}/sw.js`);
  assert.equal(serviceWorkerResponse.status, 200);
  assert.match(
    serviceWorkerResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  assert.equal(serviceWorkerResponse.headers.get("cache-control"), "no-cache");
  assert.equal(
    serviceWorkerResponse.headers.get("service-worker-allowed"),
    "/",
  );
  const serviceWorker = await serviceWorkerResponse.text();
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /self\.skipWaiting\(\)/);
  assert.match(serviceWorker, /self\.clients\.claim\(\)/);

  const pwaScriptResponse = await fetch(`${harness.origin}/pwa.js`);
  assert.equal(pwaScriptResponse.status, 200);
  assert.match(
    pwaScriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const pwaScript = await pwaScriptResponse.text();
  assert.match(pwaScript, /navigator\.serviceWorker/);
  assert.match(pwaScript, /beforeinstallprompt/);

  for (const [iconPath, expectedSize] of [
    ["/assets/pwa-icon-192.png", "192"],
    ["/assets/pwa-icon-512.png", "512"],
    ["/assets/pwa-icon-maskable-512.png", "512"],
    ["/assets/apple-touch-icon.png", "180"],
  ]) {
    const response = await fetch(`${harness.origin}${iconPath}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    const content = Buffer.from(await response.arrayBuffer());
    assert.equal(content.subarray(1, 4).toString(), "PNG");
    assert.equal(content.readUInt32BE(16), Number(expectedSize));
    assert.equal(content.readUInt32BE(20), Number(expectedSize));
  }

  const themeResponse = await fetch(`${harness.origin}/theme.js`);
  assert.equal(themeResponse.status, 200);
  assert.match(
    themeResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const themeScript = await themeResponse.text();
  assert.match(themeScript, /prefers-color-scheme: dark/);
  assert.match(themeScript, /\["auto", "light", "dark"\]/);

  const stateResponse = await fetch(`${harness.origin}/api/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.deepEqual(state.subscriptions, []);
  assert.equal(
    state.settings.checkCron,
    "11 0,6,10,12,18 * * *",
  );
  assert.equal(state.settings.staleCompletionDays, 90);
  assert.equal(state.settings.episodeNotificationWindowMinutes, 0);
  assert.equal(
    state.settings.discoveryReminderDurationMinutes,
    2 * 24 * 60,
  );
  assert.equal(state.settings.discoveryReminderCron, "0 */4 * * *");
  assert.equal(state.settings.accountSyncCron, "0 3 * * *");
  assert.equal(state.settings.pendingDiscoveryReminderCount, 0);
  assert.equal(state.settings.notifications.enabledCount, 0);
  assert.deepEqual(state.settings.notificationTemplates, {
    detailed: { title: "", body: "" },
    batch: { title: "", body: "" },
    reminder: { title: "", body: "" },
  });
});

test("account QR polling continues after switching to SMS while loading profile", async () => {
  const appScript = await fs.readFile(
    path.join(ROOT_DIR, "public", "app.js"),
    "utf8",
  );
  assert.match(
    appScript,
    /function accountQrPollIsCurrent\(generation, loginId\) \{\s*return \(\s*accountRunIsCurrent\(generation\) &&\s*\(appState\.account\.loginId === loginId \|\|\s*appState\.account\.loginStatus === "profile_loading"\)\s*\);/,
  );
  assert.match(
    appScript,
    /function scheduleAccountLoginPoll\([\s\S]*?!accountRunIsCurrent\(generation\) \|\|\s*!appState\.account\.loginId/,
  );
  assert.match(
    appScript,
    /if \(appState\.account\.loginMethod === "sms"\) \{\s*elements\.accountSmsLoginStatus\.textContent =\s*"登录已确认，正在读取账号资料…";/,
  );
});

test("QR login failures recover in place and report scan confirmation", async () => {
  const [page, appScript] = await Promise.all([
    fs.readFile(path.join(ROOT_DIR, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT_DIR, "public", "app.js"), "utf8"),
  ]);
  const placeholderIndex = page.indexOf('id="account-qr-placeholder"');
  const retryIndex = page.indexOf('id="account-login-retry"');
  const copyIndex = page.indexOf('class="account-login__copy"');
  assert.ok(placeholderIndex >= 0);
  assert.ok(retryIndex > placeholderIndex);
  assert.ok(copyIndex > retryIndex);
  assert.match(page, />重新生成<\/span>/);
  assert.match(
    appScript,
    /function restartAccountQrLogin\(\) \{\s*const run = newAccountRun\(\);\s*void beginAccountLogin\(run\);/,
  );
  assert.match(
    appScript,
    /nextMethod === "qr" &&\s*\["failed", "expired"\]\.includes\(appState\.account\.loginStatus\)/,
  );
  assert.match(
    appScript,
    /function scheduleAccountLoginCreationRetry\(generation, controller\)/,
  );
  assert.match(
    appScript,
    /if \(qrImageAttempt <= 1\) \{[\s\S]*?ACCOUNT_QR_IMAGE_RETRY_DELAY_MS/,
  );
  assert.match(
    appScript,
    /elements\.accountQrPlaceholderText\.textContent = title;[\s\S]*?setAccountLoginRetryLabel\(retryLabel\);[\s\S]*?title: initializationFailed \? "账号初始化失败" : "登录确认失败",\s*retryLabel: "重新登录"/,
  );
  assert.match(
    appScript,
    /if \(loginStatus === "2" \|\| loginStatus === "scanned"\) \{\s*elements\.accountLoginStatus\.textContent =\s*"已扫码，请在红果短剧 App 中确认登录。"/,
  );
});

test("SMS security verification offers a direct QR login fallback", async () => {
  const [page, appScript] = await Promise.all([
    fs.readFile(path.join(ROOT_DIR, "public", "index.html"), "utf8"),
    fs.readFile(path.join(ROOT_DIR, "public", "app.js"), "utf8"),
  ]);
  assert.match(
    page,
    /id="account-sms-use-qr"[\s\S]*?改用扫码登录/,
  );
  assert.match(
    appScript,
    /accountSmsUseQr: document\.querySelector\("#account-sms-use-qr"\)/,
  );
  assert.match(
    appScript,
    /showSmsLoginFailure\(error\.message, \{ offerQr: true \}\)/,
  );
  assert.match(
    appScript,
    /accountSmsUseQr\.addEventListener\("click", \(\) => \{\s*switchAccountLoginMethod\("qr", \{ focus: true \}\);/,
  );
  assert.match(
    appScript,
    /accountSmsUseQr\.scrollIntoView\(\{\s*block: "nearest",[\s\S]*?accountSmsUseQr\.focus\(\{ preventScroll: true \}\);/,
  );
  assert.match(
    appScript,
    /appState\.account\.smsQrFallbackRequired = offerQr;/,
  );
  assert.match(
    appScript,
    /appState\.account\.smsRetryAfterSeconds > 0 \|\|\s*appState\.account\.smsQrFallbackRequired/,
  );
});

test("HTTP app serves the full log page and paginated event log API", async (t) => {
  const harness = await startHarness(t);

  const pageResponse = await fetch(`${harness.origin}/logs`);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /运行记录/);
  assert.match(page, /系统操作/);
  assert.match(page, /data-log-view="system"/);
  assert.match(page, /id="logs-load-more"/);
  assert.match(page, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(
    page,
    /rel="apple-touch-icon" href="\/assets\/apple-touch-icon\.png"/,
  );
  assert.match(page, /src="\/pwa\.js" defer/);
  assert.match(page, /data-pwa-install/);
  assert.equal((page.match(/data-theme-toggle/g) || []).length, 1);
  assert.doesNotMatch(page, /data-theme-choice=/);

  const scriptResponse = await fetch(`${harness.origin}/logs.js`);
  assert.equal(scriptResponse.status, 200);
  assert.match(
    scriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );

  const emptyResponse = await fetch(`${harness.origin}/api/logs`);
  const emptyPage = await emptyResponse.json();
  assert.equal(emptyPage.total, 0);
  assert.deepEqual(emptyPage.events, []);
  assert.equal(emptyPage.hasMore, false);

  await harness.eventLog.appendEvents([
    {
      id: "server-event-1",
      type: "episode",
      message: "较早记录",
      createdAt: "2026-10-30T01:00:00.000Z",
    },
    {
      id: "server-event-2",
      type: "season",
      message: "中间记录",
      createdAt: "2026-10-30T02:00:00.000Z",
    },
    {
      id: "server-event-3",
      type: "completed",
      message: "最新记录",
      createdAt: "2026-10-30T03:00:00.000Z",
    },
  ]);

  const firstResponse = await fetch(
    `${harness.origin}/api/logs?offset=0&limit=2`,
  );
  assert.equal(firstResponse.status, 200);
  const firstPage = await firstResponse.json();
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.hasMore, true);
  assert.equal(firstPage.nextOffset, 2);
  assert.equal(firstPage.limit, 2);
  assert.deepEqual(
    firstPage.events.map((event) => event.id),
    ["server-event-3", "server-event-2"],
  );
  assert.deepEqual(firstPage.storage, {
    policy: "daily-size",
    maxFileBytes: 1024 * 1024,
    timeZone: "Asia/Shanghai",
  });

  const secondResponse = await fetch(
    `${harness.origin}/api/logs?offset=2&limit=2`,
  );
  const secondPage = await secondResponse.json();
  assert.equal(secondPage.hasMore, false);
  assert.equal(secondPage.nextOffset, null);
  assert.deepEqual(
    secondPage.events.map((event) => event.id),
    ["server-event-1"],
  );

  const cappedResponse = await fetch(
    `${harness.origin}/api/logs?offset=0&limit=1000`,
  );
  const cappedPage = await cappedResponse.json();
  assert.equal(cappedPage.limit, 500);

  const fileResponse = await fetch(
    `${harness.origin}/api/logs/file`,
  );
  assert.equal(fileResponse.status, 200);
  assert.match(
    fileResponse.headers.get("content-type"),
    /^text\/plain/,
  );
  assert.equal(
    fileResponse.headers.get("content-disposition"),
    'inline; filename="hongguo-events-all.jsonl"',
  );
  assert.equal(fileResponse.headers.get("cache-control"), "no-store");
  const fileContent = await fileResponse.text();
  assert.match(fileContent, /server-event-1/);
  assert.match(fileContent, /server-event-2/);
  assert.match(fileContent, /server-event-3/);
  assert.doesNotMatch(fileContent, /hongguo-server-/);
});

test("system log API exposes paginated readable actions and the complete file", async (t) => {
  const harness = await startHarness(t);
  await harness.systemLog.append([
    {
      id: "system-route-old",
      category: "subscription",
      action: "subscription.created",
      message: "已开始追更《较早短剧》。",
      createdAt: "2026-11-02T01:00:00.000Z",
    },
    {
      id: "system-route-new",
      category: "account",
      action: "account.sync.completed",
      level: "success",
      message: "登录全量同步完成：导入 1 部短剧。",
      createdAt: "2026-11-02T02:00:00.000Z",
    },
  ]);

  const response = await fetch(
    `${harness.origin}/api/system-logs?offset=0&limit=1`,
  );
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.equal(page.total, 2);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, 1);
  assert.deepEqual(
    page.entries.map((entry) => entry.id),
    ["system-route-new"],
  );
  assert.deepEqual(page.storage, {
    policy: "daily-size",
    maxFileBytes: 1024 * 1024,
    timeZone: "Asia/Shanghai",
  });

  const fileResponse = await fetch(
    `${harness.origin}/api/system-logs/file`,
  );
  assert.equal(fileResponse.status, 200);
  assert.equal(
    fileResponse.headers.get("content-disposition"),
    'inline; filename="hongguo-system-actions-all.jsonl"',
  );
  assert.equal(fileResponse.headers.get("cache-control"), "no-store");
  const fileContent = await fileResponse.text();
  assert.match(fileContent, /system-route-old/);
  assert.match(fileContent, /system-route-new/);
});

test("account sync API distinguishes login and manual sync triggers", async (t) => {
  const harness = await startHarness(t);

  let response = await fetch(`${harness.origin}/api/account/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trigger: "login" }),
  });
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.result.trigger, "login");
  assert.equal(payload.sync.latest.trigger, "login");

  response = await fetch(`${harness.origin}/api/account/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trigger: "manual" }),
  });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.result.trigger, "manual");
  assert.equal(payload.sync.latest.trigger, "manual");

  response = await fetch(`${harness.origin}/api/account/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ trigger: "unexpected" }),
  });
  assert.equal(response.status, 400);
  payload = await response.json();
  assert.equal(payload.error.code, "INVALID_ACCOUNT_SYNC_TRIGGER");
});

test("settings API saves a custom Cron schedule and all notification channels without leaking secrets", async (t) => {
  const harness = await startHarness(t);
  const response = await fetch(`${harness.origin}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      checkCron: "0 0 * * 0",
      staleCompletionDays: 120,
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
  assert.equal(payload.settings.checkCron, "0 0 * * 0");
  assert.equal(payload.settings.staleCompletionDays, 120);
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
  assert.equal(state.settings.checkCron, "0 0 * * 0");
  assert.equal(state.settings.staleCompletionDays, 120);
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

  const onDisk = await harness.store.read();
  assert.equal(onDisk.version, 14);
  assert.equal(onDisk.settings.checkCron, "0 0 * * 0");
  assert.equal(onDisk.settings.staleCompletionDays, 120);
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

test("settings API saves and returns custom notification templates", async (t) => {
  const harness = await startHarness(t);
  const notificationTemplates = {
    detailed: {
      title: "{appName}｜{seriesTitle}",
      body: "检查于 {checkTime}\n{updates}\n共 {seasonCount} 季",
    },
    batch: {
      title: "{appName}汇总 {updateCount} 个系列",
      body: "{checkTime}\n{updates}",
    },
    reminder: {
      title: "{appName}持续提醒",
      body: "提醒于 {reminderTime}\n{updates}",
    },
  };

  const response = await fetch(`${harness.origin}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notificationTemplates }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(
    payload.settings.notificationTemplates,
    notificationTemplates,
  );

  const stateResponse = await fetch(`${harness.origin}/api/state`);
  const state = await stateResponse.json();
  assert.deepEqual(
    state.settings.notificationTemplates,
    notificationTemplates,
  );

  const onDisk = await harness.store.read();
  assert.deepEqual(
    onDisk.settings.notificationTemplates,
    notificationTemplates,
  );

  const partialResponse = await fetch(`${harness.origin}/api/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      notificationTemplates: {
        batch: { title: "自定义汇总" },
      },
    }),
  });
  assert.equal(partialResponse.status, 200);
  const partialPayload = await partialResponse.json();
  assert.deepEqual(partialPayload.settings.notificationTemplates, {
    ...notificationTemplates,
    batch: {
      title: "自定义汇总",
      body: notificationTemplates.batch.body,
    },
  });
});

test("settings API validates notification template structure, variables and length", async (t) => {
  const harness = await startHarness(t);
  for (const [notificationTemplates, code] of [
    [
      { detailed: "不是对象" },
      "INVALID_NOTIFICATION_TEMPLATE",
    ],
    [
      { batch: { body: "{seriesTitle}" } },
      "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
    ],
    [
      { reminder: { title: "剧".repeat(81) } },
      "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
    ],
  ]) {
    const response = await fetch(`${harness.origin}/api/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationTemplates }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error.code, code);
  }

  const stateResponse = await fetch(`${harness.origin}/api/state`);
  const state = await stateResponse.json();
  assert.deepEqual(state.settings.notificationTemplates, {
    detailed: { title: "", body: "" },
    batch: { title: "", body: "" },
    reminder: { title: "", body: "" },
  });
});

test("settings API rejects invalid discovery reminder values", async (t) => {
  const harness = await startHarness(t);
  for (const [body, code] of [
    [
      { staleCompletionDays: 0 },
      "INVALID_STALE_COMPLETION_DAYS",
    ],
    [
      { staleCompletionDays: 3651 },
      "INVALID_STALE_COMPLETION_DAYS",
    ],
    [
      { discoveryReminderDurationMinutes: 43_201 },
      "INVALID_DISCOVERY_REMINDER_DURATION",
    ],
    [
      { discoveryReminderCron: "60 * * * *" },
      "INVALID_DISCOVERY_REMINDER_CRON",
    ],
    [
      { checkCron: "60 * * * *" },
      "INVALID_CHECK_CRON",
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

test("status API switches and restores manual series status", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.updateSubscriptionStatus = async (subscriptionId, status) => {
    calls.push({ subscriptionId, status });
    return {
      id: subscriptionId,
      title: "测试短剧",
      seriesStatusOverride: status === "auto" ? null : status,
    };
  };

  let response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/status`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    },
  );
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.result.seriesStatusOverride, "completed");
  assert.match(payload.message, /已停止检查/);

  response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/status`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "auto" }),
    },
  );
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.result.seriesStatusOverride, null);
  assert.match(payload.message, /恢复为自动判断/);
  assert.deepEqual(calls, [
    { subscriptionId: "sub_test", status: "completed" },
    { subscriptionId: "sub_test", status: "auto" },
  ]);
});

test("status API rejects an invalid status before updating the service", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.updateSubscriptionStatus = async (subscriptionId, status) => {
    calls.push({ subscriptionId, status });
    throw new Error("should not be called");
  };

  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/status`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    },
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "INVALID_SERIES_STATUS");
  assert.deepEqual(calls, []);
});

test("status API returns 404 for an unknown subscription", async (t) => {
  const harness = await startHarness(t);
  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_missing/status`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "updating" }),
    },
  );
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, "SUBSCRIPTION_NOT_FOUND");
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

test("single-series check API forces completed-series verification", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.checkSubscription = async (subscriptionId, options) => {
    calls.push({ subscriptionId, options });
    return {
      subscriptionId,
      seasonsChecked: 1,
      updatedSeasons: 1,
      discoveredSeasons: 0,
      errors: 0,
      completionRechecked: true,
      reactivatedFromCompleted: true,
    };
  };

  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/check`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.match(payload.message, /强制检查完成/);
  assert.match(payload.message, /恢复为未完结/);
  assert.deepEqual(calls, [
    {
      subscriptionId: "sub_test",
      options: {
        notify: true,
        discover: true,
        forceDiscovery: true,
        forceCompletedCheck: true,
      },
    },
  ]);
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
  assert.match(payload.message, /2 个已完结已跳过/);
});

test("tracking API stops and restores automatic checks", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.setSubscriptionTrackingState = async (
    subscriptionId,
    paused,
  ) => {
    calls.push({ subscriptionId, paused });
    return {
      id: subscriptionId,
      title: "测试短剧第一季",
      trackingPaused: paused,
    };
  };

  const stopResponse = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/tracking`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: true }),
    },
  );
  assert.equal(stopResponse.status, 200);
  assert.equal(
    (await stopResponse.json()).result.trackingPaused,
    true,
  );

  const restoreResponse = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/tracking`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trackingPaused: false }),
    },
  );
  assert.equal(restoreResponse.status, 200);
  assert.equal(
    (await restoreResponse.json()).result.trackingPaused,
    false,
  );
  assert.deepEqual(calls, [
    { subscriptionId: "sub_test", paused: true },
    { subscriptionId: "sub_test", paused: false },
  ]);
});

test("tracking API rejects a non-boolean state", async (t) => {
  const harness = await startHarness(t);
  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/tracking`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: "true" }),
    },
  );
  assert.equal(response.status, 400);
  assert.equal(
    (await response.json()).error.code,
    "INVALID_TRACKING_STATE",
  );
});

test("batch check API reports paused series as skipped", async (t) => {
  const harness = await startHarness(t);
  harness.service.checkAll = async () => ({
    subscriptions: 2,
    checkedSubscriptions: 0,
    skippedCompleted: 1,
    skippedPaused: 1,
    seasonsChecked: 0,
    updatedSeasons: 0,
    discoveredSeasons: 0,
    errors: 0,
  });

  const response = await fetch(`${harness.origin}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.skippedPaused, 1);
  assert.match(payload.message, /1 个已完结、1 个已暂停/);
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

test("watched API can restore a subscription to unread", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.markSubscriptionUnwatched = async (subscriptionId) => {
    calls.push(subscriptionId);
    return {
      id: subscriptionId,
      title: "测试短剧",
      hasUnreadUpdate: true,
      lastWatchedAt: "2026-10-27T08:00:00.000Z",
    };
  };

  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/watched`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ watched: false }),
    },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.hasUnreadUpdate, true);
  assert.equal(payload.message, "已将《测试短剧》恢复为有更新。");
  assert.deepEqual(calls, ["sub_test"]);
});

test("reminder API switches between all three notification states", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.setSubscriptionReminderState = async (
    subscriptionId,
    mode,
  ) => {
    calls.push({ subscriptionId, mode });
    return {
      id: subscriptionId,
      title: "测试短剧",
      reminderEnabled: mode !== "disabled",
      reminderMutedForCurrentUpdate: mode === "muted",
      reminderMode: mode,
      hasUnreadUpdate: true,
    };
  };

  const enabledResponse = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/reminder`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "enabled" }),
    },
  );
  assert.equal(enabledResponse.status, 200);
  const enabledPayload = await enabledResponse.json();
  assert.equal(enabledPayload.result.reminderMode, "enabled");
  assert.match(enabledPayload.message, /已开启/);

  const mutedResponse = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/reminder`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "muted" }),
    },
  );
  assert.equal(mutedResponse.status, 200);
  const mutedPayload = await mutedResponse.json();
  assert.equal(mutedPayload.result.reminderMode, "muted");
  assert.equal(mutedPayload.result.reminderEnabled, true);
  assert.equal(
    mutedPayload.result.reminderMutedForCurrentUpdate,
    true,
  );
  assert.equal(mutedPayload.result.hasUnreadUpdate, true);
  assert.match(mutedPayload.message, /下次更新会自动恢复/);

  const disabledResponse = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/reminder`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "disabled" }),
    },
  );
  assert.equal(disabledResponse.status, 200);
  const disabledPayload = await disabledResponse.json();
  assert.equal(disabledPayload.result.reminderMode, "disabled");
  assert.equal(disabledPayload.result.reminderEnabled, false);
  assert.equal(disabledPayload.result.hasUnreadUpdate, true);
  assert.match(disabledPayload.message, /有更新状态会保留/);
  assert.deepEqual(calls, [
    { subscriptionId: "sub_test", mode: "enabled" },
    { subscriptionId: "sub_test", mode: "muted" },
    { subscriptionId: "sub_test", mode: "disabled" },
  ]);
});

test("reminder API keeps the legacy enabled boolean contract", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  harness.service.setSubscriptionReminderState = async (
    subscriptionId,
    mode,
  ) => {
    calls.push({ subscriptionId, mode });
    return {
      id: subscriptionId,
      title: "测试短剧",
      reminderMode: mode,
      reminderEnabled: mode !== "disabled",
      reminderMutedForCurrentUpdate: false,
      hasUnreadUpdate: true,
    };
  };

  for (const enabled of [false, true]) {
    const response = await fetch(
      `${harness.origin}/api/subscriptions/sub_test/reminder`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
    );
    assert.equal(response.status, 200);
  }

  assert.deepEqual(calls, [
    { subscriptionId: "sub_test", mode: "disabled" },
    { subscriptionId: "sub_test", mode: "enabled" },
  ]);
});

test("reminder API rejects an invalid reminder mode", async (t) => {
  const harness = await startHarness(t);
  let called = false;
  harness.service.setSubscriptionReminderState = async () => {
    called = true;
  };

  const response = await fetch(
    `${harness.origin}/api/subscriptions/sub_test/reminder`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "silent" }),
    },
  );
  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, "INVALID_REMINDER_STATE");
  assert.equal(called, false);
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

test("account routes expose only public status and QR images", async (t) => {
  const accountService = createAccountServiceMock();
  const harness = await startHarness(t, { accountService });

  const statusResponse = await fetch(
    `${harness.origin}/api/account/status`,
  );
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.headers.get("cache-control"), "no-store");
  const statusPayload = await statusResponse.json();
  assert.equal(statusPayload.account.profile.name, "测试用户");
  assert.doesNotMatch(
    JSON.stringify(statusPayload),
    /cookie|deviceId|installId|signature/i,
  );

  const createResponse = await fetch(
    `${harness.origin}/api/account/login`,
    { method: "POST" },
  );
  assert.equal(createResponse.status, 201);
  assert.equal((await createResponse.json()).login.loginId, "login-test");

  const qrResponse = await fetch(
    `${harness.origin}/api/account/login/login-test/qrcode`,
  );
  assert.equal(qrResponse.status, 200);
  assert.equal(qrResponse.headers.get("content-type"), "image/png");
  assert.equal(qrResponse.headers.get("cache-control"), "no-store");
  assert.equal(await qrResponse.text(), "fake-png");

  const pollResponse = await fetch(
    `${harness.origin}/api/account/login/login-test`,
  );
  assert.equal(pollResponse.status, 200);
  assert.equal((await pollResponse.json()).login.status, "confirmed");

  const cancelResponse = await fetch(
    `${harness.origin}/api/account/login/login-test`,
    { method: "DELETE" },
  );
  assert.equal(cancelResponse.status, 200);
  assert.deepEqual(
    await cancelResponse.json(),
    { ok: true, result: { canceled: true } },
  );
  assert.deepEqual(accountService.calls.pollLogin, ["login-test"]);
  assert.deepEqual(accountService.calls.getLoginQr, ["login-test"]);
  assert.deepEqual(accountService.calls.cancelLogin, ["login-test"]);
});

test("SMS login routes validate input and expose only public session data", async (t) => {
  const accountService = createAccountServiceMock();
  const harness = await startHarness(t, { accountService });

  const createResponse = await fetch(
    `${harness.origin}/api/account/sms-login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        countryCode: "+86",
        mobile: "138 0013 8000",
      }),
    },
  );
  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  assert.equal(createPayload.login.loginId, "sms-login-test");
  assert.doesNotMatch(
    JSON.stringify(createPayload),
    /13800138000|passport_csrf|sessionid|cookie/i,
  );
  assert.deepEqual(accountService.calls.createSmsLogin, [
    { countryCode: "86", mobile: "138 0013 8000" },
  ]);

  const sendResponse = await fetch(
    `${harness.origin}/api/account/sms-login/sms-login-test/send-code`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(sendResponse.status, 200);
  assert.equal(
    (await sendResponse.json()).login.status,
    "pending_verify",
  );

  const verifyResponse = await fetch(
    `${harness.origin}/api/account/sms-login/sms-login-test/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    },
  );
  assert.equal(verifyResponse.status, 200);
  assert.equal(
    (await verifyResponse.json()).login.status,
    "profile_loading",
  );

  const pollResponse = await fetch(
    `${harness.origin}/api/account/sms-login/sms-login-test`,
  );
  assert.equal(pollResponse.status, 200);
  assert.equal((await pollResponse.json()).login.status, "succeeded");

  const cancelResponse = await fetch(
    `${harness.origin}/api/account/sms-login/sms-login-test`,
    { method: "DELETE" },
  );
  assert.equal(cancelResponse.status, 200);
  assert.deepEqual(await cancelResponse.json(), {
    ok: true,
    result: { canceled: true },
  });
  assert.deepEqual(accountService.calls.sendSmsCode, ["sms-login-test"]);
  assert.deepEqual(accountService.calls.verifySmsCode, [
    { loginId: "sms-login-test", code: "123456" },
  ]);
  assert.deepEqual(accountService.calls.pollSmsLogin, [
    "sms-login-test",
  ]);
  assert.deepEqual(accountService.calls.cancelSmsLogin, [
    "sms-login-test",
  ]);
});

test("SMS login routes reject missing mobile and verification code", async (t) => {
  const harness = await startHarness(t);

  const missingMobile = await fetch(
    `${harness.origin}/api/account/sms-login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ countryCode: "86", mobile: "" }),
    },
  );
  assert.equal(missingMobile.status, 400);
  assert.equal(
    (await missingMobile.json()).error.code,
    "ACCOUNT_SMS_MOBILE_REQUIRED",
  );

  const missingCode = await fetch(
    `${harness.origin}/api/account/sms-login/sms-login-test/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(missingCode.status, 400);
  assert.equal(
    (await missingCode.json()).error.code,
    "ACCOUNT_SMS_CODE_REQUIRED",
  );
});

test("account refresh, logout and import delegate through existing services", async (t) => {
  const screenshotImport = createScreenshotImportMock();
  const accountService = createAccountServiceMock();
  const harness = await startHarness(t, {
    screenshotImport,
    accountService,
  });

  const refreshResponse = await fetch(
    `${harness.origin}/api/account/refresh`,
    { method: "POST" },
  );
  assert.equal(refreshResponse.status, 200);
  assert.equal(accountService.calls.refresh, 1);

  const seriesIds = [
    "7694653385668037657",
    "7694653385668037657",
    "7694653385668037658",
  ];
  const importResponse = await fetch(
    `${harness.origin}/api/account/import`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesIds }),
    },
  );
  assert.equal(importResponse.status, 200);
  const importPayload = await importResponse.json();
  assert.equal(importPayload.message, "已导入 2 部。");
  assert.deepEqual(
    screenshotImport.calls.importSeriesIds[0].seriesIds,
    [seriesIds[0], seriesIds[2]],
  );
  assert.equal(
    screenshotImport.calls.importSeriesIds[0].service,
    harness.service,
  );

  const logoutResponse = await fetch(
    `${harness.origin}/api/account/logout`,
    { method: "POST" },
  );
  assert.equal(logoutResponse.status, 200);
  assert.equal((await logoutResponse.json()).account.authenticated, false);
  assert.equal(accountService.calls.logout, 1);
});

test("account import validates selection count and series IDs", async (t) => {
  const harness = await startHarness(t);
  const tooMany = Array.from(
    { length: 21 },
    (_, index) => String(7694653385668037600n + BigInt(index)),
  );

  const limitResponse = await fetch(
    `${harness.origin}/api/account/import`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesIds: tooMany }),
    },
  );
  assert.equal(limitResponse.status, 400);
  assert.equal(
    (await limitResponse.json()).error.code,
    "ACCOUNT_IMPORT_LIMIT",
  );

  const invalidResponse = await fetch(
    `${harness.origin}/api/account/import`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seriesIds: ["not-a-series"] }),
    },
  );
  assert.equal(invalidResponse.status, 400);
  assert.equal(
    (await invalidResponse.json()).error.code,
    "ACCOUNT_IMPORT_INVALID_ID",
  );
});
