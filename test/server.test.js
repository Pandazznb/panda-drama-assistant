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

function sessionCookie(response) {
  const cookie = response.headers.get("set-cookie") || "";
  return cookie.split(";")[0];
}

async function waitForBatchCheckJob(harness) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const response = await fetch(
      `${harness.origin}/api/check/status`,
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    if (payload.job && payload.job.status !== "running") {
      return payload.job;
    }
  }
  assert.fail("批量检查任务未在预期时间内结束。");
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
  const styles = await stylesResponse.text();
  assert.match(
    styles,
    /\.settings-tabs\s*\{[^}]*scrollbar-width:\s*none;[^}]*\}/s,
  );
  assert.match(
    styles,
    /\.settings-tabs::-webkit-scrollbar\s*\{[^}]*display:\s*none;[^}]*\}/s,
  );
  assert.match(
    styles,
    /\.settings-tabs\s*\{[^}]*border:\s*0;[^}]*\}/s,
  );
  assert.match(
    styles,
    /\.settings-tabs\s*\{[^}]*background:\s*transparent;[^}]*border-radius:\s*0;[^}]*\}/s,
  );
  assert.match(
    styles,
    /\.settings-tab\[aria-selected="true"\]\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*inset 0 -2px 0 var\(--color-accent\);[^}]*\}/s,
  );
  assert.match(
    styles,
    /\.dialog--settings \.dialog__header\s*\{[^}]*border-bottom:\s*0;[^}]*\}/s,
  );
  assert.match(
    styles,
    /\.dialog--settings \.dialog__header \.icon-button\s*\{[^}]*border-radius:\s*50%;[^}]*\}/s,
  );
  const page = await pageResponse.text();
  assert.match(page, /短剧助手/);
  assert.match(page, /id="settings-notification-items"/);
  assert.match(page, /id="settings-notification-empty"/);
  assert.match(page, /id="settings-add-notification"/);
  assert.match(
    page,
    /<div\s+class="notification-item-list"\s+id="settings-notification-items"\s*><\/div>/,
  );
  const notificationEmptyStart = page.indexOf(
    'id="settings-notification-empty"',
  );
  const notificationEmptyTagStart = page.lastIndexOf(
    "<div",
    notificationEmptyStart,
  );
  const notificationEmptyTagEnd = page.indexOf(">", notificationEmptyStart);
  assert.doesNotMatch(
    page.slice(notificationEmptyTagStart, notificationEmptyTagEnd),
    /\bhidden\b/,
  );
  assert.equal((page.match(/data-theme-toggle/g) || []).length, 1);
  assert.doesNotMatch(page, /data-theme-choice=/);
  assert.match(
    page,
    /class="log-link-button"\s+href="\/logs#events"\s+aria-label="打开系统日志"/,
  );
  const eventLogLink = page.slice(
    page.indexOf('class="log-link-button"'),
    page.indexOf("</a>", page.indexOf('class="log-link-button"')),
  );
  assert.match(eventLogLink, /href="#icon-history"/);
  assert.doesNotMatch(page, /aria-label="在新标签页打开全部日志文件"/);
  assert.doesNotMatch(page, /显示全部/);
  assert.match(page, /id="watchlist-search-input"/);
  assert.match(page, /aria-label="正在追更的短剧搜索结果"/);
  assert.match(page, /搜索剧名、全拼或首字母/);
  assert.match(page, /id="open-add-dialog"/);
  assert.match(page, /id="access-current-account-name"/);
  assert.match(page, /id="access-current-account-meta"/);
  assert.match(page, /<label for="access-account">登录账号<\/label>/);
  assert.match(page, /<label for="access-username">名称<\/label>/);
  assert.ok(
    page.indexOf('id="access-username"') < page.indexOf('id="access-account"'),
  );
  const settingsDialogStart = page.indexOf('id="settings-dialog"');
  const settingsDialog = page.slice(
    settingsDialogStart,
    page.indexOf("</dialog>", settingsDialogStart),
  );
  assert.match(settingsDialog, /class="settings-action-bar"/);
  assert.match(
    settingsDialog,
    /<\/div>\s*<\/section>\s*<div class="settings-action-bar">/,
  );
  assert.doesNotMatch(
    settingsDialog,
    /class="dialog__actions dialog__actions--split"/,
  );
  assert.equal((page.match(/data-settings-tab=/g) || []).length, 5);
  assert.match(
    settingsDialog,
    /class="dialog__title-group"[\s\S]*?class="dialog__title-icon"[\s\S]*?#icon-settings[\s\S]*?<h2 id="settings-title">设置<\/h2>/,
  );
  assert.match(page, /data-settings-tab="account"/);
  assert.match(page, /data-settings-tab="security"/);
  assert.match(page, /data-settings-tab="system"/);
  assert.match(page, /data-settings-panel="security"/);
  assert.match(page, /data-settings-panel="system"/);
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
  const notificationPanelStart = page.indexOf(
    'data-settings-panel="notification"',
  );
  const notificationPanel = page.slice(
    notificationPanelStart,
    page.indexOf(
      'data-settings-panel="account"',
      notificationPanelStart,
    ),
  );
  assert.match(
    notificationPanel,
    /id="settings-notification-overview"/,
  );
  assert.match(
    notificationPanel,
    /id="settings-notification-items"/,
  );
  assert.match(
    notificationPanel,
    /id="settings-notification-editor"/,
  );
  assert.match(
    notificationPanel,
    /id="settings-notification-template-cards"/,
  );
  assert.match(
    notificationPanel,
    /id="settings-notification-template-editors"/,
  );
  assert.match(
    notificationPanel,
    /id="settings-notification-template-forms"/,
  );
  assert.ok(
    notificationPanel.indexOf("通知渠道") <
      notificationPanel.indexOf("通知模板"),
  );
  assert.ok(
    notificationPanel.indexOf("通知模板") <
      notificationPanel.indexOf("发送代理"),
  );
  const templateSectionStart = page.indexOf(
    'id="settings-notification-template-source"',
  );
  const templateSection = page.slice(
    templateSectionStart,
    page.indexOf('id="settings-panel-security"', templateSectionStart),
  );
  for (const type of ["detailed", "batch", "reminder"]) {
    for (const field of [
      "title",
      "body",
      "seasonLine",
      "episodeLine",
      "completedLine",
    ]) {
      assert.match(
        templateSection,
        new RegExp(
          `id="template-${type}-${field
            .replaceAll(/([A-Z])/g, "-$1")
            .toLowerCase()}"`,
        ),
      );
    }
  }
  assert.equal(
    (templateSection.match(/data-template-field="/g) || []).length,
    15,
  );
  assert.equal(
    (
      templateSection.match(
        /data-template-variable-list="shell"/g,
      ) || []
    ).length,
    3,
  );
  assert.equal(
    (
      templateSection.match(
        /data-template-variable-list="line"/g,
      ) || []
    ).length,
    3,
  );
  assert.equal(
    (templateSection.match(/data-template-field-error/g) || []).length,
    15,
  );
  assert.match(templateSection, /aria-describedby="[^"]*template-/);
  assert.doesNotMatch(templateSection, /maxlength=/);
  assert.doesNotMatch(templateSection, /data-restore-template(?:\s|>)/);
  assert.doesNotMatch(page, /data-template-variable="appName"/);
  assert.match(page, /data-notification-channel="wecomApp"/);
  assert.match(page, /id="wecom-app-corp-id"/);
  assert.match(page, /id="wecom-app-to-user"/);
  assert.match(page, /最多\s+100 个/);
  assert.match(
    page,
    /placeholder="50 23 \* \* \*"[\s\S]*?默认每天 23:50/,
  );
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
  assert.match(page, /name="theme-color" content="#f3f5f7"/);
  assert.match(
    page,
    /name="theme-color"\s+media="\(prefers-color-scheme: dark\)"\s+content="#0f1216"/,
  );
  assert.match(
    page,
    /name="viewport"\s+content="width=device-width, initial-scale=1, viewport-fit=cover"/,
  );
  assert.match(
    page,
    /name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
  );
  assert.match(page, /src="\/pwa\.js" defer/);
  assert.match(page, /data-pwa-install/);
  assert.doesNotMatch(page, /class="app-status-surface"/);
  assert.doesNotMatch(page, /class="app-status-bar"/);

  const standaloneStylesResponse = await fetch(
    `${harness.origin}/styles.css`,
  );
  assert.equal(standaloneStylesResponse.status, 200);
  const standaloneStyles = await standaloneStylesResponse.text();
  assert.match(
    standaloneStyles,
    /\.app-header\s*\{[\s\S]*?padding-top: var\(--safe-area-inset-top\);[\s\S]*?\}\s*\.app-header::before\s*\{[\s\S]*?background-color: var\(--color-header-bg\);[\s\S]*?background-image: var\(--header-background-image\);[\s\S]*?-webkit-backdrop-filter: blur\(28px\) saturate\(1\.55\);[\s\S]*?backdrop-filter: blur\(28px\) saturate\(1\.55\);/,
  );
  assert.match(
    standaloneStyles,
    /\.app-header__inner\s*\{[\s\S]*?position: relative;[\s\S]*?z-index: 1;/,
  );
  assert.doesNotMatch(standaloneStyles, /\.app-status-bar\s*\{/);
  assert.doesNotMatch(standaloneStyles, /--color-standalone-header-bg/);
  assert.doesNotMatch(
    standaloneStyles,
    /@media \(display-mode: standalone\)[\s\S]*?\.app-header/,
  );

  for (const pathname of ["/calendar", "/rankings", "/filters", "/logs"]) {
    const response = await fetch(`${harness.origin}${pathname}`);
    assert.equal(response.status, 200);
    const childPage = await response.text();
    assert.match(
      childPage,
      /name="viewport"\s+content="width=device-width, initial-scale=1, viewport-fit=cover"/,
    );
    assert.match(
      childPage,
      /name="apple-mobile-web-app-status-bar-style"\s+content="black-translucent"/,
    );
    assert.doesNotMatch(childPage, /class="app-status-surface"/);
    assert.doesNotMatch(childPage, /class="app-status-bar"/);
  }

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

  const scrollControlsResponse = await fetch(
    `${harness.origin}/scroll-controls.js`,
  );
  assert.equal(scrollControlsResponse.status, 200);
  assert.match(
    scrollControlsResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const scrollControlsScript = await scrollControlsResponse.text();
  assert.match(scrollControlsScript, /\(min-width: 901px\)/);
  assert.match(scrollControlsScript, /scroll-controls:update/);
  assert.match(scrollControlsScript, /<path d="m6 9 6 6 6-6"><\/path>/);
  assert.doesNotMatch(scrollControlsScript, /<use href="#icon-/);

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
  assert.match(themeScript, /light: "#f3f5f7"/);
  assert.match(themeScript, /dark: "#0f1216"/);

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
  assert.equal(state.settings.accountSyncCron, "50 23 * * *");
  assert.equal(state.settings.pendingDiscoveryReminderCount, 0);
  assert.equal(state.settings.notifications.enabledCount, 0);
  assert.deepEqual(state.settings.notificationTemplates, {
    detailed: {
      title: "",
      body: "",
      seasonLine: "",
      episodeLine: "",
      completedLine: "",
    },
    batch: {
      title: "",
      body: "",
      seasonLine: "",
      episodeLine: "",
      completedLine: "",
    },
    reminder: {
      title: "",
      body: "",
      seasonLine: "",
      episodeLine: "",
      completedLine: "",
    },
  });
});

test("cover cache endpoint serves immutable images and retries without caching errors", async (t) => {
  const calls = [];
  const imageCache = {
    async get(query) {
      calls.push(query);
      if (!query.url && !query.seriesId) {
        const error = new Error("缺少封面地址或剧集 ID。");
        error.statusCode = 400;
        error.code = "COVER_SOURCE_REQUIRED";
        throw error;
      }
      return {
        image: Buffer.from([137, 80, 78, 71]),
        contentType: "image/png",
        etag: "cover-etag",
      };
    },
  };
  const harness = await startHarness(t, { imageCache });
  const params = new URLSearchParams({
    url: "https://p3-novel.byteimg.com/novel-pic/test.image",
    seriesId: "7694653385668037657",
  });

  const response = await fetch(
    `${harness.origin}/api/covers?${params.toString()}`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(response.headers.get("etag"), '"cover-etag"');
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from([137, 80, 78, 71]),
  );
  assert.deepEqual(calls[0], {
    url: params.get("url"),
    seriesId: params.get("seriesId"),
    refresh: false,
  });

  const cachedResponse = await fetch(
    `${harness.origin}/api/covers?${params.toString()}`,
    { headers: { "if-none-match": '"cover-etag"' } },
  );
  assert.equal(cachedResponse.status, 304);
  assert.equal((await cachedResponse.arrayBuffer()).byteLength, 0);

  const errorResponse = await fetch(`${harness.origin}/api/covers`);
  assert.equal(errorResponse.status, 400);
  assert.equal(errorResponse.headers.get("cache-control"), "no-store");
  assert.equal(
    (await errorResponse.json()).error.code,
    "COVER_SOURCE_REQUIRED",
  );

  const helperResponse = await fetch(
    `${harness.origin}/cover-image.js`,
  );
  assert.equal(helperResponse.status, 200);
  const helper = await helperResponse.text();
  assert.match(helper, /refresh: true/);
  assert.match(helper, /coverRetried/);

  for (const pathname of ["/", "/calendar", "/rankings", "/filters"]) {
    const pageResponse = await fetch(`${harness.origin}${pathname}`);
    const page = await pageResponse.text();
    assert.match(page, /<script src="\/cover-image\.js" defer><\/script>/);
  }

  const workerResponse = await fetch(`${harness.origin}/sw.js`);
  const worker = await workerResponse.text();
  assert.match(worker, /shell-v73/);
  assert.match(worker, /"\/cover-image\.js"/);
});

test("home title follows the authenticated access username", async () => {
  const appScript = await fs.readFile(
    path.join(ROOT_DIR, "public", "app.js"),
    "utf8",
  );
  const titleSource = appScript.match(
    /(function accessHomeTitle\(username\) \{[\s\S]*?\n\})/,
  )?.[1];
  assert.ok(titleSource);
  const accessHomeTitle = new Function(
    `${titleSource}\nreturn accessHomeTitle;`,
  )();

  assert.equal(accessHomeTitle(""), "我的追更");
  assert.equal(accessHomeTitle("   "), "我的追更");
  assert.equal(accessHomeTitle("小满"), "小满的追更");
  assert.match(
    appScript,
    /void loadAccessSecurityStatus\(\);\s*void loadDashboard\(\)\.then/,
  );
});

test("notification settings reuse channel markup when the tab is reopened", async () => {
  const [appScript, styles] = await Promise.all([
    fs.readFile(path.join(ROOT_DIR, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT_DIR, "public", "styles.css"), "utf8"),
  ]);
  const renderSource = appScript.match(
    /(function renderNotificationItems\(items\) \{[\s\S]*?\n\})/,
  )?.[1];
  const setTabSource = appScript.match(
    /(function setSettingsTab\([\s\S]*?\n\})/,
  )?.[1];
  const tabListenerSource = appScript.match(
    /(elements\.settingsTabs\.forEach\([\s\S]*?\n\}\);)/,
  )?.[1];

  assert.ok(renderSource);
  assert.ok(setTabSource);
  assert.ok(tabListenerSource);
  assert.match(
    renderSource,
    /if \(markup !== appState\.notificationItemsMarkup\) \{/,
  );
  assert.doesNotMatch(tabListenerSource, /showNotificationOverview\(\)/);
  assert.match(
    setTabSource,
    /if \(nextTab === "notification" && previousTab !== "notification"\) \{\s*showNotificationOverview\(\);/,
  );
  assert.doesNotMatch(setTabSource, /scrollIntoView\(/);
  assert.doesNotMatch(
    styles,
    /\.notification-settings-view:not\(\[hidden\]\)[\s\S]{0,80}animation:/,
  );
});

test("season cards use the shared completion label and only show real update rules", async () => {
  const appScript = await fs.readFile(
    path.join(ROOT_DIR, "public", "app.js"),
    "utf8",
  );
  assert.match(
    appScript,
    /function seasonProgressLabel\(season\)[\s\S]*?const progressLabel =\s*episodeCount > 0 \? `更新至 \$\{episodeCount\} 集` : "集数未知";/,
  );
  assert.match(
    appScript,
    /subscription-row__episode-count">\$\{escapeHtml\(\s*seasonProgressLabel\(latestSeason\),\s*\)\}/,
  );
  assert.match(
    appScript,
    /season-item__progress">\$\{escapeHtml\(\s*seasonProgressLabel\(season\),\s*\)\}/,
  );
  assert.match(
    appScript,
    /season-item__meta">\s*\$\{escapeHtml\(seasonSourceMeta\(season\)\)\}/,
  );
  assert.match(
    appScript,
    /function seasonUpdateRuleMarkup\(season\)[\s\S]*?const updateRule = seasonUpdateRule\(season\);[\s\S]*?if \(!updateRule\)[\s\S]*?return "";/,
  );
  assert.match(
    appScript,
    /<span class="season-update-rule__label">更新规则<\/span>/,
  );
  assert.match(
    appScript,
    /\$\{seasonUpdateRuleMarkup\(season\)\}[\s\S]*?season-item__error/,
  );
  assert.match(
    appScript,
    /<div class="latest-season">[\s\S]*?<\/div>\s*\$\{seasonUpdateRuleMarkup\(latestSeason\)\}/,
  );
});

test("watchlist shows the latest unpublished season schedule", async () => {
  const [appScript, styles] = await Promise.all([
    fs.readFile(path.join(ROOT_DIR, "public", "app.js"), "utf8"),
    fs.readFile(path.join(ROOT_DIR, "public", "styles.css"), "utf8"),
  ]);
  const helperSource = appScript.match(
    /(function upcomingSeasonInfo\(subscription\) \{[\s\S]*?\n\})\n\nfunction renderSubscription/,
  )?.[1];
  assert.ok(helperSource);
  const upcomingSeasonInfo = new Function(
    "APP_TIME_ZONE",
    `${helperSource}\nreturn upcomingSeasonInfo;`,
  )("Asia/Shanghai");

  assert.equal(upcomingSeasonInfo({}), null);
  assert.deepEqual(
    upcomingSeasonInfo({
      discovery: {
        unpublishedSeasonCount: 1,
        unpublishedSeasons: [
          {
            seasonIndex: 8,
            schedulePublishAt: "2026-11-27T16:00:00.000Z",
            scheduleText: "预计11月28日上线",
          },
        ],
      },
    }),
    {
      seasonLabel: "第8季",
      scheduleLabel: "预计11月28日上线",
    },
  );
  assert.deepEqual(
    upcomingSeasonInfo({
      discovery: {
        unpublishedSeasonCount: 1,
        unpublishedSeasons: [{ seasonIndex: 6 }],
      },
    }),
    {
      seasonLabel: "第6季",
      scheduleLabel: "已确认，等待上线日期",
    },
  );
  assert.deepEqual(
    upcomingSeasonInfo({
      discovery: {
        unpublishedSeasonCount: 2,
        unpublishedSeasons: [
          {
            seasonIndex: 4,
            scheduleText: "预计11月28日上线",
          },
          {
            seasonIndex: 5,
            schedulePublishAt: "2026-12-30T16:00:00.000Z",
          },
        ],
      },
    }),
    {
      seasonLabel: "第5季",
      scheduleLabel: "预计12月31日上线",
    },
  );
  assert.deepEqual(
    upcomingSeasonInfo({
      discovery: {
        unpublishedSeasonCount: 1,
        unpublishedSeriesIds: ["7709434632843824152"],
      },
    }),
    {
      seasonLabel: "最新季",
      scheduleLabel: "已确认，等待上线日期",
    },
  );
  assert.match(
    appScript,
    /function subscriptionSeasonContext\(subscription, latestSeason\)[\s\S]*?const upcomingSeason = upcomingSeasonInfo\(subscription\);[\s\S]*?const updateRule = seasonUpdateRule\(latestSeason\);[\s\S]*?text: `更新规则 · \$\{updateRule\}`/,
  );
  assert.match(
    appScript,
    /class="subscription-row__context subscription-row__context--\$\{escapeHtml\(\s*seasonContext\.kind,\s*\)\}"/,
  );
  assert.match(
    styles,
    /\.subscription-row__context--rule \.icon\s*\{[\s\S]*?color: var\(--color-muted\);/,
  );
});

test("watchlist season context falls back to the latest update rule", async () => {
  const appScript = await fs.readFile(
    path.join(ROOT_DIR, "public", "app.js"),
    "utf8",
  );
  const updateRuleSource = appScript.match(
    /(function seasonUpdateRule\(season\) \{[\s\S]*?\n\})/,
  )?.[1];
  const contextSource = appScript.match(
    /(function subscriptionSeasonContext\(subscription, latestSeason\) \{[\s\S]*?\n\})/,
  )?.[1];
  assert.ok(updateRuleSource);
  assert.ok(contextSource);

  const seasonUpdateRule = new Function(
    `${updateRuleSource}\nreturn seasonUpdateRule;`,
  )();
  const createContext = (upcomingSeasonInfo) =>
    new Function(
      "upcomingSeasonInfo",
      "seasonUpdateRule",
      `${contextSource}\nreturn subscriptionSeasonContext;`,
    )(upcomingSeasonInfo, seasonUpdateRule);

  const noUpcomingSeason = createContext(() => null);
  assert.deepEqual(
    noUpcomingSeason(
      {},
      { status: "updating", updateRule: " 每日10:00更新15集 " },
    ),
    {
      kind: "rule",
      iconName: "update-list",
      text: "更新规则 · 每日10:00更新15集",
    },
  );
  assert.equal(
    noUpcomingSeason({}, { status: "completed", updateRule: "每日更新" }),
    null,
  );
  assert.equal(
    noUpcomingSeason({}, { status: "updating", updateRule: " " }),
    null,
  );

  const withUpcomingSeason = createContext(() => ({
    seasonLabel: "第8季",
    scheduleLabel: "预计12月1日上线",
  }));
  assert.deepEqual(
    withUpcomingSeason({}, { status: "updating", updateRule: "每周更新" }),
    {
      kind: "upcoming",
      iconName: "calendar-clock",
      text: "第8季 · 预计12月1日上线",
    },
  );
});

test("account QR polling continues after switching to SMS while loading profile", async () => {
  const appScript = await fs.readFile(
    path.join(ROOT_DIR, "public", "app.js"),
    "utf8",
  );
  assert.match(
    appScript,
    /const DEFAULT_ACCOUNT_SYNC_CRON = "50 23 \* \* \*";/,
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

test("HTTP app serves the recent log page and paginated event log API", async (t) => {
  const harness = await startHarness(t);

  const pageResponse = await fetch(`${harness.origin}/logs`);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /运行记录/);
  assert.match(page, /系统操作/);
  assert.match(page, /data-log-view="system"/);
  assert.doesNotMatch(page, /id="logs-load-more"/);
  assert.match(page, /超过 30 天的文件自动删除/);
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
    retentionDays: 30,
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
    retentionDays: 30,
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
        wecomApp: {
          enabled: true,
          corpId: "wwSERVER1234567890",
          secret: "wecom-app_SERVER-secret-123",
          agentId: "1000002",
          toUser: "UserID1|UserID2",
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
  assert.equal(payload.settings.notifications.enabledCount, 6);
  assert.deepEqual(payload.settings.notifications.proxy, {
    enabled: true,
    configured: true,
    urlHint: "http://***@127.0.0.1:7890",
    channels: {
      bark: true,
      ntfy: false,
      telegram: true,
      wecom: false,
      wecomApp: false,
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
  assert.equal(serialized.includes("wwSERVER1234567890"), false);
  assert.equal(serialized.includes("wecom-app_SERVER-secret-123"), false);
  assert.equal(serialized.includes("1000002"), false);
  assert.equal(serialized.includes("UserID1"), false);
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
  assert.equal(state.settings.notifications.configuredCount, 6);
  assert.equal(state.settings.notifications.proxy.enabled, true);
  assert.equal(state.settings.notifications.proxy.configured, true);
  assert.equal(
    state.settings.notifications.proxy.urlHint,
    "http://***@127.0.0.1:7890",
  );
  assert.equal(JSON.stringify(state).includes("abc_DEF-123"), false);
  assert.equal(JSON.stringify(state).includes("proxy-pass"), false);

  const onDisk = await harness.store.read();
  assert.equal(onDisk.version, 15);
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
      wecomApp: false,
      dingtalk: false,
    },
  });
  assert.deepEqual(onDisk.settings.notifications.wecomApp, {
    enabled: true,
    corpId: "wwSERVER1234567890",
    secret: "wecom-app_SERVER-secret-123",
    agentId: "1000002",
    toUser: "UserID1|UserID2",
  });
});

test("settings API saves and returns custom notification templates", async (t) => {
  const harness = await startHarness(t);
  const notificationTemplates = {
    detailed: {
      title: "{appName}｜{seriesTitle}",
      body: "检查于 {checkTime}\n{updates}\n共 {seasonCount} 季",
      seasonLine:
        "{seriesTitle}｜{seasonTitle}｜{episodeCount}集｜{updatedAt}",
      episodeLine:
        "{seriesTitle}｜{seasonTitle}｜+{addedEpisodeCount}集｜{updatedAt}",
      completedLine:
        "{seriesTitle}｜全系列完结｜{seasonCount}季/{episodeCount}集",
    },
    batch: {
      title: "{appName}汇总 {updateCount} 个系列",
      body: "{checkTime}\n{updates}",
      seasonLine: "{seriesTitle}｜新季｜{episodeCount}集｜{updatedTime}",
      episodeLine:
        "{seriesTitle}｜+{addedEpisodeCount}集｜{updatedTime}",
      completedLine: "{seriesTitle}｜全系列完结",
    },
    reminder: {
      title: "{appName}持续提醒",
      body: "提醒于 {reminderTime}\n{updates}",
      seasonLine: "{seriesTitle}｜新季｜{episodeCount}集｜{updatedTime}",
      episodeLine:
        "{seriesTitle}｜+{addedEpisodeCount}集｜{updatedTime}",
      completedLine: "{seriesTitle}｜全系列完结",
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
      ...notificationTemplates.batch,
      title: "自定义汇总",
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
      { detailed: { seasonLine: "{checkTime}" } },
      "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
    ],
    [
      { reminder: { title: "剧".repeat(81) } },
      "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
    ],
    [
      { batch: { completedLine: "剧".repeat(301) } },
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
    detailed: {
      title: "",
      body: "",
      seasonLine: "",
      episodeLine: "",
      completedLine: "",
    },
    batch: {
      title: "",
      body: "",
      seasonLine: "",
      episodeLine: "",
      completedLine: "",
    },
    reminder: {
      title: "",
      body: "",
      seasonLine: "",
      episodeLine: "",
      completedLine: "",
    },
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
  let finishCheck;
  const pendingCheck = new Promise((resolve) => {
    finishCheck = resolve;
  });
  let calls = 0;
  harness.service.checkAll = async (options) => {
    calls += 1;
    assert.deepEqual(options, {
      notify: true,
      discover: true,
      forceDiscovery: true,
    });
    return pendingCheck;
  };

  const response = await fetch(`${harness.origin}/api/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.accepted, true);
  assert.equal(payload.job.status, "running");

  const duplicateResponse = await fetch(
    `${harness.origin}/api/check`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(duplicateResponse.status, 202);
  assert.equal((await duplicateResponse.json()).accepted, false);
  assert.equal(calls, 1);

  finishCheck({
    subscriptions: 2,
    checkedSubscriptions: 0,
    skippedCompleted: 2,
    seasonsChecked: 0,
    updatedSeasons: 0,
    discoveredSeasons: 0,
    errors: 0,
  });
  const job = await waitForBatchCheckJob(harness);
  assert.equal(job.status, "success");
  assert.equal(job.result.skippedCompleted, 2);
  assert.match(job.message, /2 个已完结已跳过/);
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
  assert.equal(response.status, 202);
  const job = await waitForBatchCheckJob(harness);
  assert.equal(job.status, "success");
  assert.equal(job.result.skippedPaused, 1);
  assert.match(job.message, /1 个已完结、1 个已暂停/);
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

test("rankings API marks series already present in any tracked season", async (t) => {
  const rankingCalls = [];
  const rankingService = {
    async getRankings(options) {
      rankingCalls.push(options);
      return {
        ok: true,
        fetchedAt: "2026-11-15T08:00:00.000Z",
        cached: false,
        stale: false,
        warning: "",
        category: "human",
        type: "hot",
        updatedText: "11月15日已更新·按热度排序",
        items: [
          {
            seriesId: "7694653385668037657",
            title: "已追更短剧",
          },
          {
            seriesId: "7694653385668037658",
            title: "可加入短剧",
          },
        ],
      };
    },
  };
  const harness = await startHarness(t, { rankingService });
  harness.service.getDashboard = async () => ({
    subscriptions: [
      {
        id: "sub_ranking",
        seasons: [
          { seriesId: "7694653385668037999" },
          { seriesId: "7694653385668037657" },
        ],
      },
    ],
  });

  const response = await fetch(
    `${harness.origin}/api/rankings?category=human&type=hot&refresh=1`,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(rankingCalls, [
    { category: "human", type: "hot", force: true },
  ]);
  assert.equal(payload.ok, true);
  assert.equal(payload.items[0].tracked, true);
  assert.equal(payload.items[0].subscriptionId, "sub_ranking");
  assert.equal(payload.items[1].tracked, false);
  assert.equal(payload.items[1].subscriptionId, null);
});

test("rankings pages are served from the application shell", async (t) => {
  const harness = await startHarness(t);

  for (const pathname of ["/rankings", "/rankings.html"]) {
    const response = await fetch(`${harness.origin}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(await response.text(), /红果榜单/);
  }

  const scriptResponse = await fetch(`${harness.origin}/rankings.js`);
  assert.equal(scriptResponse.status, 200);
  assert.match(
    scriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const script = await scriptResponse.text();
  assert.match(script, /data-action="toggle"/);
  assert.match(script, /正在追更/);
  assert.match(script, /取消中…/);
  assert.match(script, /markTracked\(seriesId, error\.subscriptionId\)/);
});

test("calendar page is served and linked from every primary page", async (t) => {
  const harness = await startHarness(t);

  for (const pathname of ["/calendar", "/calendar.html"]) {
    const response = await fetch(`${harness.origin}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    const page = await response.text();
    assert.match(page, /更新日历/);
    assert.match(page, /aria-current="page"/);
    assert.match(page, /href="\/calendar\.css"/);
    assert.match(page, /type="module" src="\/calendar\.js"/);
    assert.match(page, /data-calendar-type="season"/);
    assert.match(page, /data-calendar-type="episode"/);
    assert.doesNotMatch(page, /data-calendar-type="reservation"/);
    assert.doesNotMatch(page, /data-calendar-type="pending"/);
    assert.doesNotMatch(page, /calendar-legend__item--season/);
    assert.doesNotMatch(page, /calendar-legend__item--episode/);
    assert.doesNotMatch(page, /calendar-legend__item--today/);
    assert.match(page, /id="calendar-week-timeline"/);
    assert.doesNotMatch(page, /calendar-week-timeline__header/);
    assert.doesNotMatch(page, /id="calendar-week-view-title"/);
    assert.doesNotMatch(page, /id="calendar-week-previous"/);
    assert.doesNotMatch(page, /id="calendar-week-next"/);
  }

  const scriptResponse = await fetch(`${harness.origin}/calendar.js`);
  assert.equal(scriptResponse.status, 200);
  assert.match(
    scriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const script = await scriptResponse.text();
  assert.match(script, /APP_TIME_ZONE = "Asia\/Shanghai"/);
  assert.match(script, /new Set\(\["season", "episode"\]\)/);
  assert.match(script, /\/api\/logs\?offset=\$\{offset\}/);
  assert.match(script, /reservationsUpcoming/);
  assert.match(script, /parseReservationExpectedDate/);
  assert.match(script, /latestEpisodeEventIdBySeason/);
  assert.match(script, /resolveUpdateEventOccurredAt/);
  assert.match(script, /\/api\/account\/refresh/);
  assert.match(script, /unpublishedSeasonCount/);
  assert.match(script, /unpublishedSeasons/);
  assert.match(script, /subscriptionPlaceholderSeasons/);
  assert.match(script, /reservationPlaceholderId/);
  assert.match(script, /buildSeasonUpdateSchedule/);
  assert.match(script, /filterCalendarEntries/);
  assert.match(script, /estimatedUpdateEntries/);
  assert.match(script, /bucket\.estimatedUpdates/);
  assert.match(script, /calendar-date-dot--estimated/);
  assert.match(script, /calendar-entry--estimated/);
  assert.match(script, /官方更新规则/);
  assert.match(script, /fetching/);
  assert.match(script, /calendar-week-timeline__group/);
  assert.match(script, /renderWeekTimeline/);
  assert.match(script, /syncWeekTimelineSelection/);
  assert.match(script, /function updateWeekView/);
  assert.match(
    script,
    /function updateWeekView[\s\S]*?renderWeekStrip[\s\S]*?syncWeekTimelineSelection/,
  );
  assert.match(
    script,
    /function movePeriod[\s\S]*?state\.view === "week"[\s\S]*?updateWeekView\(\)/,
  );
  assert.match(script, /timelineDateKeys/);
  assert.match(
    script,
    /function timelineDateKeys\(entryIndex, today, selectedDate\)/,
  );
  assert.match(script, /const selectedWeekStart = startOfWeek\(selectedDate\)/);
  assert.match(script, /const currentWeekStart = startOfWeek\(today\)/);
  assert.match(script, /selectedWeekStart < currentWeekStart/);
  assert.match(
    script,
    /return datedKeys\.filter\(\(dateKey\) => dateKey >= currentWeekStart\)/,
  );
  assert.doesNotMatch(
    script,
    /return datedKeys\.filter\(\(dateKey\) => dateKey >= today\)/,
  );
  assert.match(
    script,
    /function updateWeekView[\s\S]*?renderWeekTimeline\(entryIndex, visibleTimelineDates\)/,
  );
  assert.match(script, /data-timeline-date/);
  assert.match(script, /scrollIntoView/);
  assert.match(script, /所选一周暂时没有短剧更新排期或预约档期/);
  assert.match(script, /本周及未来日期暂时都没有短剧更新排期或预约档期/);
  assert.doesNotMatch(script, /WEEK_SECTION_OFFSETS/);
  assert.doesNotMatch(script, /data-week-offset/);

  const styleResponse = await fetch(`${harness.origin}/calendar.css`);
  assert.equal(styleResponse.status, 200);
  assert.match(styleResponse.headers.get("content-type"), /^text\/css/);
  const style = await styleResponse.text();
  assert.match(style, /\.calendar-week-strip/);
  assert.match(style, /\.calendar-week-timeline__group/);
  assert.match(style, /\.calendar-week-timeline__empty/);
  assert.match(
    style,
    /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(style, /\.calendar-month-day/);
  assert.match(style, /\.calendar-date-dot--estimated/);
  assert.match(style, /aspect-ratio:\s*3\s*\/\s*4/);

  const reservationScriptResponse = await fetch(
    `${harness.origin}/calendar-reservations.js`,
  );
  assert.equal(reservationScriptResponse.status, 200);
  assert.match(
    reservationScriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  assert.match(
    await reservationScriptResponse.text(),
    /parseReservationExpectedDate/,
  );

  const eventScriptResponse = await fetch(
    `${harness.origin}/calendar-events.js`,
  );
  assert.equal(eventScriptResponse.status, 200);
  assert.match(
    eventScriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const eventScript = await eventScriptResponse.text();
  assert.match(eventScript, /latestEpisodeEventIdBySeason/);
  assert.match(eventScript, /resolveUpdateEventOccurredAt/);

  const scheduleScriptResponse = await fetch(
    `${harness.origin}/calendar-schedule.js`,
  );
  assert.equal(scheduleScriptResponse.status, 200);
  assert.match(
    scheduleScriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const scheduleScript = await scheduleScriptResponse.text();
  assert.match(scheduleScript, /buildSeasonUpdateSchedule/);
  assert.match(scheduleScript, /confirmedTotalEpisodeCount/);
  assert.match(scheduleScript, /seasonIsCompleted/);

  const filterScriptResponse = await fetch(
    `${harness.origin}/calendar-filters.js`,
  );
  assert.equal(filterScriptResponse.status, 200);
  assert.match(
    filterScriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const filterScript = await filterScriptResponse.text();
  assert.match(filterScript, /placeholder-schedule/);
  assert.match(filterScript, /isEpisodeCalendarEntry/);

  for (const pathname of ["/", "/rankings", "/filters", "/logs"]) {
    const response = await fetch(`${harness.origin}${pathname}`);
    assert.equal(response.status, 200);
    const page = await response.text();
    assert.match(page, /href="\/calendar"/);
    assert.match(page, /更新日历/);
  }

  const serviceWorkerResponse = await fetch(`${harness.origin}/sw.js`);
  assert.equal(serviceWorkerResponse.status, 200);
  const serviceWorker = await serviceWorkerResponse.text();
  assert.match(serviceWorker, /shell-v\d+/);
  assert.match(serviceWorker, /"\/calendar"/);
  assert.match(serviceWorker, /"\/calendar\.js"/);
  assert.match(serviceWorker, /"\/calendar-events\.js"/);
  assert.match(serviceWorker, /"\/calendar-filters\.js"/);
  assert.match(serviceWorker, /"\/calendar-reservations\.js"/);
  assert.match(serviceWorker, /"\/calendar-schedule\.js"/);
  assert.match(serviceWorker, /"\/calendar\.css"/);
});

test("catalog API passes detailed filters and tracked series IDs", async (t) => {
  const catalogCalls = [];
  const catalogService = {
    async getCatalog(options) {
      catalogCalls.push(options);
      return {
        ok: true,
        cached: false,
        items: [],
        topics: [],
        availableTags: [],
        scannedCount: 0,
        matchedCount: 0,
        total: 0,
        totalPages: 0,
        scannedPages: [],
        nextOfficialPage: null,
        hasMore: false,
      };
    },
  };
  const harness = await startHarness(t, { catalogService });
  harness.service.getDashboard = async () => ({
    subscriptions: [
      {
        id: "sub_discovery",
        seasons: [
          { seriesId: "7694653385668037301" },
          { seriesId: "7694653385668037302" },
        ],
      },
      {
        seasons: [{ seriesId: "7694653385668037303" }],
      },
    ],
  });

  const response = await fetch(
    `${harness.origin}/api/catalog?contentType=comic&cursor=3&scanPages=2&q=${encodeURIComponent("重生")}&topic=creative&status=completed&tracked=untracked&episodes=31-60&tags=${encodeURIComponent("复仇,逆袭")}&sort=episodes-desc&refresh=1`,
  );

  assert.equal(response.status, 200);
  assert.equal(catalogCalls.length, 1);
  const options = catalogCalls[0];
  assert.equal(options.contentType, "comic");
  assert.equal(options.cursor, "3");
  assert.equal(options.scanPages, "2");
  assert.equal(options.query, "重生");
  assert.equal(options.topic, "creative");
  assert.equal(options.status, "completed");
  assert.equal(options.tracked, "untracked");
  assert.equal(options.episodes, "31-60");
  assert.equal(options.tags, "复仇,逆袭");
  assert.equal(options.sort, "episodes-desc");
  assert.equal(options.force, true);
  assert.deepEqual(
    [...options.trackedSeriesIds].sort(),
    [
      "7694653385668037301",
      "7694653385668037302",
      "7694653385668037303",
    ],
  );
});

test("discovery API passes official filters and marks any tracked season", async (t) => {
  const discoveryCalls = [];
  const appDiscoveryService = {
    async getDiscovery(options) {
      discoveryCalls.push(options);
      return {
        ok: true,
        fetchedAt: "2026-11-15T08:00:00.000Z",
        items: [
          {
            seriesId: "7694653385668037302",
            title: "已追更短剧",
          },
          {
            seriesId: "7694653385668037304",
            title: "未追更短剧",
          },
        ],
        groups: [
          {
            type: "genre",
            label: "类型",
            options: [{ id: "comic_series", label: "漫剧" }],
          },
        ],
        nextCursor: "next-page",
        hasMore: true,
      };
    },
  };
  const harness = await startHarness(t, { appDiscoveryService });
  harness.service.getDashboard = async () => ({
    subscriptions: [
      {
        id: "sub_discovery",
        seasons: [
          { seriesId: "7694653385668037301" },
          { seriesId: "7694653385668037302" },
        ],
      },
    ],
  });

  const response = await fetch(
    `${harness.origin}/api/catalog/discovery`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        selection: {
          genre: "comic_series",
          category_dim_role: "cate_36",
        },
        cursor: "cursor-test",
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(discoveryCalls, [
    {
      selection: {
        genre: "comic_series",
        category_dim_role: "cate_36",
      },
      cursor: "cursor-test",
    },
  ]);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.items[0].tracked, true);
  assert.equal(payload.items[0].subscriptionId, "sub_discovery");
  assert.equal(payload.items[1].tracked, false);
  assert.equal(payload.items[1].subscriptionId, null);
  assert.equal(payload.nextCursor, "next-page");
});

test("discovery API rejects malformed JSON and forwards validated service errors", async (t) => {
  const appDiscoveryService = {
    async getDiscovery() {
      const error = new Error("筛选条件包含未知分组。");
      error.code = "INVALID_DISCOVERY_SELECTION";
      error.statusCode = 400;
      throw error;
    },
  };
  const harness = await startHarness(t, { appDiscoveryService });

  const malformed = await fetch(
    `${harness.origin}/api/catalog/discovery`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );
  assert.equal(malformed.status, 400);
  assert.equal(
    (await malformed.json()).error.code,
    "INVALID_JSON",
  );

  const invalidSelection = await fetch(
    `${harness.origin}/api/catalog/discovery`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selection: { unknown: "value" } }),
    },
  );
  assert.equal(invalidSelection.status, 400);
  assert.equal(
    (await invalidSelection.json()).error.code,
    "INVALID_DISCOVERY_SELECTION",
  );
});

test("filters pages and script are served from the application shell", async (t) => {
  const harness = await startHarness(t);

  for (const pathname of ["/filters", "/filters.html"]) {
    const response = await fetch(`${harness.origin}${pathname}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(await response.text(), /找剧/);
  }

  const scriptResponse = await fetch(`${harness.origin}/filters.js`);
  assert.equal(scriptResponse.status, 200);
  assert.match(
    scriptResponse.headers.get("content-type"),
    /^text\/javascript/,
  );
  const script = await scriptResponse.text();
  assert.match(script, /data-action="toggle"/);
  assert.match(script, /正在追更/);
  assert.match(script, /取消中…/);
  assert.match(script, /markTracked\(seriesId, error\.subscriptionId\)/);
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

test("duplicate subscription errors expose the existing tracking record", async (t) => {
  const harness = await startHarness(t);
  harness.service.addSubscription = async () => {
    const error = new Error("这部剧已经在我的追更中。");
    error.code = "SUBSCRIPTION_EXISTS";
    error.statusCode = 409;
    error.subscriptionId = "sub_existing";
    error.seriesTitle = "测试短剧";
    throw error;
  };

  const response = await fetch(`${harness.origin}/api/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "7694653385668037657" }),
  });
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error.code, "SUBSCRIPTION_EXISTS");
  assert.equal(payload.error.subscriptionId, "sub_existing");
  assert.equal(payload.error.seriesTitle, "测试短剧");
});

test("adding a subscription returns before background season discovery finishes", async (t) => {
  const harness = await startHarness(t);
  const calls = [];
  let releaseDiscovery;
  let markDiscoveryStarted;
  const discoveryGate = new Promise((resolve) => {
    releaseDiscovery = resolve;
  });
  const discoveryStarted = new Promise((resolve) => {
    markDiscoveryStarted = resolve;
  });
  harness.service.addSubscription = async (input, options) => {
    calls.push({ type: "add", input, options });
    return {
      action: "created",
      subscriptionId: "sub_created",
      seasonId: "7694653385668037657",
      title: "测试短剧",
      seasonTitle: "测试短剧第一季",
      episodeCount: 12,
    };
  };
  harness.service.checkSubscription = async (subscriptionId, options) => {
    calls.push({ type: "check", subscriptionId, options });
    markDiscoveryStarted();
    await discoveryGate;
    return {
      seasonsChecked: 1,
      discoveredSeasons: 13,
      errors: 0,
      discoveryError: null,
    };
  };

  const response = await fetch(`${harness.origin}/api/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "first-series" }),
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.result.discoveryPending, true);
  assert.equal(payload.result.discoveryCompleted, false);
  assert.equal(payload.result.discoveryError, null);
  assert.match(payload.message, /正在后台补全同系列季列表/);

  await discoveryStarted;
  releaseDiscovery();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [
    {
      type: "add",
      input: "first-series",
      options: {
        deferFirstSeasonResolution: true,
        requestPriority: 1,
      },
    },
    {
      type: "check",
      subscriptionId: "sub_created",
      options: {
        notify: false,
        discover: true,
        forceDiscovery: true,
        markUnread: false,
        trigger: "add",
      },
    },
  ]);
});

test("background season discovery failure does not fail subscription creation", async (t) => {
  const harness = await startHarness(t);
  let releaseDiscovery;
  let markDiscoveryStarted;
  const discoveryGate = new Promise((resolve) => {
    releaseDiscovery = resolve;
  });
  const discoveryStarted = new Promise((resolve) => {
    markDiscoveryStarted = resolve;
  });
  harness.service.addSubscription = async () => ({
    action: "created",
    subscriptionId: "sub_created",
    seasonId: "7694653385668037657",
    title: "测试短剧",
    seasonTitle: "测试短剧",
    episodeCount: 12,
  });
  harness.service.checkSubscription = async () => {
    markDiscoveryStarted();
    await discoveryGate;
    throw new Error("官方多季接口暂时不可用");
  };

  const response = await fetch(`${harness.origin}/api/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: "test-series" }),
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.result.subscriptionId, "sub_created");
  assert.equal(payload.result.discoveryPending, true);
  assert.equal(payload.result.discoveryCompleted, false);
  assert.equal(payload.result.discoveryError, null);
  assert.match(payload.message, /正在后台补全同系列季列表/);

  await discoveryStarted;
  releaseDiscovery();
  let failureEntry = null;
  for (let attempt = 0; attempt < 50 && !failureEntry; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    const page = await harness.systemLog.readPage({ limit: 20 });
    failureEntry = page.entries.find(
      (entry) => entry.action === "subscription.discovery.failed",
    );
  }
  assert.ok(failureEntry);
  assert.match(failureEntry.message, /官方多季接口暂时不可用/);
  assert.match(failureEntry.message, /稍后自动检查会继续重试/);
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

test("access credentials keep login account, display username, and password independent", async (t) => {
  const harness = await startHarness(t);
  const loginPage = await fetch(`${harness.origin}/login`);
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.headers.get("content-type"), /^text\/html/);
  assert.match(await loginPage.text(), /id="login-form"/);

  const loginScript = await fetch(`${harness.origin}/login.js`);
  assert.equal(loginScript.status, 200);
  assert.match(
    loginScript.headers.get("content-type"),
    /^text\/javascript/,
  );

  const initialPassword = "correct-horse";
  const initialAccount = "owner-login";
  const initialUsername = "owner-display";
  const setupResponse = await fetch(
    `${harness.origin}/api/access/credentials`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: initialAccount,
        username: initialUsername,
        currentPassword: "",
        newPassword: initialPassword,
      }),
    },
  );
  assert.equal(setupResponse.status, 200);
  const setupPayload = await setupResponse.json();
  assert.equal(setupPayload.credentials.account, initialAccount);
  assert.equal(setupPayload.credentials.username, initialUsername);
  assert.equal(setupPayload.credentials.configured, true);
  assert.match(setupResponse.headers.get("set-cookie"), /HttpOnly/);

  const protectedPage = await fetch(`${harness.origin}/`, {
    redirect: "manual",
  });
  assert.equal(protectedPage.status, 302);
  assert.equal(protectedPage.headers.get("location"), "/login?next=%2F");

  const protectedState = await fetch(`${harness.origin}/api/state`);
  assert.equal(protectedState.status, 401);
  assert.equal(
    (await protectedState.json()).error.code,
    "ACCESS_AUTH_REQUIRED",
  );

  const invalidLogin = await fetch(`${harness.origin}/api/access/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: initialUsername,
      password: initialPassword,
    }),
  });
  assert.equal(invalidLogin.status, 401);
  assert.equal(
    (await invalidLogin.json()).error.code,
    "ACCESS_LOGIN_INVALID",
  );

  const invalidPassword = await fetch(`${harness.origin}/api/access/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: initialAccount,
      password: "wrong-password",
    }),
  });
  assert.equal(invalidPassword.status, 401);
  assert.equal(
    (await invalidPassword.json()).error.code,
    "ACCESS_LOGIN_INVALID",
  );

  const loginResponse = await fetch(`${harness.origin}/api/access/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: initialAccount,
      password: initialPassword,
    }),
  });
  assert.equal(loginResponse.status, 200);
  const loginPayload = await loginResponse.json();
  assert.equal(loginPayload.account, initialAccount);
  assert.equal(loginPayload.username, initialUsername);
  const oldCookie = sessionCookie(loginResponse);
  assert.ok(oldCookie);

  const authenticatedPage = await fetch(`${harness.origin}/`, {
    headers: { cookie: oldCookie },
  });
  assert.equal(authenticatedPage.status, 200);
  const authenticatedState = await fetch(`${harness.origin}/api/state`, {
    headers: { cookie: oldCookie },
  });
  assert.equal(authenticatedState.status, 200);
  const statusResponse = await fetch(
    `${harness.origin}/api/access/status`,
  );
  const unauthStatus = await statusResponse.json();
  assert.equal(unauthStatus.authenticated, false);
  assert.equal(unauthStatus.account, "");
  assert.equal(unauthStatus.username, "");
  const authenticatedStatus = await fetch(
    `${harness.origin}/api/access/status`,
    {
      headers: { cookie: oldCookie },
    },
  );
  const statusPayload = await authenticatedStatus.json();
  assert.equal(statusPayload.account, initialAccount);
  assert.equal(statusPayload.username, initialUsername);

  const nextUsername = "next-display";
  const usernameResponse = await fetch(
    `${harness.origin}/api/access/credentials`,
    {
      method: "PATCH",
      headers: {
        cookie: oldCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account: initialAccount,
        username: nextUsername,
        currentPassword: initialPassword,
        newPassword: "",
      }),
    },
  );
  assert.equal(usernameResponse.status, 200);
  assert.equal(usernameResponse.headers.get("set-cookie"), null);
  const usernamePayload = await usernameResponse.json();
  assert.equal(usernamePayload.accountChanged, false);
  assert.equal(usernamePayload.usernameChanged, true);
  assert.equal(usernamePayload.passwordChanged, false);
  assert.equal(usernamePayload.credentials.account, initialAccount);
  assert.equal(usernamePayload.credentials.username, nextUsername);

  const sessionAfterUsernameChange = await fetch(
    `${harness.origin}/api/state`,
    {
      headers: { cookie: oldCookie },
    },
  );
  assert.equal(sessionAfterUsernameChange.status, 200);
  const usernameStatusResponse = await fetch(
    `${harness.origin}/api/access/status`,
    {
      headers: { cookie: oldCookie },
    },
  );
  const usernameStatus = await usernameStatusResponse.json();
  assert.equal(usernameStatus.account, initialAccount);
  assert.equal(usernameStatus.username, nextUsername);

  const nextAccount = "next-login";
  const accountResponse = await fetch(
    `${harness.origin}/api/access/credentials`,
    {
      method: "PATCH",
      headers: {
        cookie: oldCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account: nextAccount,
        username: nextUsername,
        currentPassword: initialPassword,
        newPassword: "",
      }),
    },
  );
  assert.equal(accountResponse.status, 200);
  const accountPayload = await accountResponse.json();
  assert.equal(accountPayload.accountChanged, true);
  assert.equal(accountPayload.usernameChanged, false);
  assert.equal(accountPayload.passwordChanged, false);
  const accountCookie = sessionCookie(accountResponse);
  assert.ok(accountCookie);

  const oldSessionState = await fetch(`${harness.origin}/api/state`, {
    headers: { cookie: oldCookie },
  });
  assert.equal(oldSessionState.status, 401);
  const accountSessionState = await fetch(`${harness.origin}/api/state`, {
    headers: { cookie: accountCookie },
  });
  assert.equal(accountSessionState.status, 200);

  const oldAccountLogin = await fetch(`${harness.origin}/api/access/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: initialAccount,
      password: initialPassword,
    }),
  });
  assert.equal(oldAccountLogin.status, 401);

  const nextAccountLogin = await fetch(
    `${harness.origin}/api/access/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: nextAccount,
        password: initialPassword,
      }),
    },
  );
  assert.equal(nextAccountLogin.status, 200);
  assert.equal((await nextAccountLogin.json()).username, nextUsername);

  const nextPassword = "next-correct-horse";
  const passwordResponse = await fetch(
    `${harness.origin}/api/access/credentials`,
    {
      method: "PATCH",
      headers: {
        cookie: accountCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        account: nextAccount,
        username: nextUsername,
        currentPassword: initialPassword,
        newPassword: nextPassword,
      }),
    },
  );
  assert.equal(passwordResponse.status, 200);
  const passwordPayload = await passwordResponse.json();
  assert.equal(passwordPayload.accountChanged, false);
  assert.equal(passwordPayload.usernameChanged, false);
  assert.equal(passwordPayload.passwordChanged, true);
  const passwordCookie = sessionCookie(passwordResponse);
  assert.ok(passwordCookie);

  const accountSessionAfterPassword = await fetch(
    `${harness.origin}/api/state`,
    {
      headers: { cookie: accountCookie },
    },
  );
  assert.equal(accountSessionAfterPassword.status, 401);
  const passwordSessionState = await fetch(`${harness.origin}/api/state`, {
    headers: { cookie: passwordCookie },
  });
  assert.equal(passwordSessionState.status, 200);

  const logoutResponse = await fetch(`${harness.origin}/api/access/logout`, {
    method: "POST",
    headers: {
      cookie: passwordCookie,
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);
  const loggedOutState = await fetch(`${harness.origin}/api/state`, {
    headers: { cookie: passwordCookie },
  });
  assert.equal(loggedOutState.status, 401);

  const nextLogin = await fetch(`${harness.origin}/api/access/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      account: nextAccount,
      password: nextPassword,
    }),
  });
  assert.equal(nextLogin.status, 200);
  const nextLoginPayload = await nextLogin.json();
  assert.equal(nextLoginPayload.account, nextAccount);
  assert.equal(nextLoginPayload.username, nextUsername);
  assert.ok(sessionCookie(nextLogin));
});

test("repeated HTTP access login failures return retry information", async (t) => {
  const harness = await startHarness(t);
  const setupResponse = await fetch(
    `${harness.origin}/api/access/credentials`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: "owner",
        username: "owner",
        currentPassword: "",
        newPassword: "correct-horse",
      }),
    },
  );
  assert.equal(setupResponse.status, 200);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${harness.origin}/api/access/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: "owner",
        password: "wrong-password",
      }),
    });
    assert.equal(response.status, 401);
  }

  const limitedResponse = await fetch(
    `${harness.origin}/api/access/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: "owner",
        password: "correct-horse",
      }),
    },
  );
  assert.equal(limitedResponse.status, 429);
  assert.ok(Number(limitedResponse.headers.get("retry-after")) > 0);
  const limitedPayload = await limitedResponse.json();
  assert.equal(
    limitedPayload.error.code,
    "ACCESS_LOGIN_RATE_LIMITED",
  );
  assert.ok(limitedPayload.error.retryAfterSeconds > 0);
});

test("system update endpoints expose version info and run a check", async (t) => {
  const calls = [];
  const updateChecker = {
    info() {
      return {
        version: "1.14.0",
        repositoryUrl:
          "https://github.com/Pandazznb/panda-drama-assistant",
        releasesUrl:
          "https://github.com/Pandazznb/panda-drama-assistant/releases",
      };
    },
    async check() {
      calls.push("check");
      return {
        ok: true,
        available: true,
        currentVersion: "1.14.0",
        latestVersion: "1.15.0",
        releaseUrl:
          "https://github.com/Pandazznb/panda-drama-assistant/releases/tag/v1.15.0",
        publishedAt: "2026-11-27T12:00:00.000Z",
        checkedAt: "2026-11-28T00:00:00.000Z",
        message: "发现新版本 1.15.0。",
      };
    },
  };
  const harness = await startHarness(t, { updateChecker });

  const infoResponse = await fetch(
    `${harness.origin}/api/system/update`,
  );
  assert.equal(infoResponse.status, 200);
  assert.deepEqual(await infoResponse.json(), {
    ok: true,
    ...updateChecker.info(),
  });

  const checkResponse = await fetch(
    `${harness.origin}/api/system/update`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(checkResponse.status, 200);
  const checkPayload = await checkResponse.json();
  assert.equal(checkPayload.available, true);
  assert.equal(checkPayload.latestVersion, "1.15.0");
  assert.deepEqual(calls, ["check"]);
});
