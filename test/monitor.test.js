import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ReminderService } from "../src/monitor.js";
import { JsonStateStore } from "../src/store.js";

const ROOT_ID = "7694653385668037657";
const NEXT_ID = "7694653385668037658";
const OTHER_ID = "7694653385668037659";
const SHELL_ID = "7694653385668037660";
const GROUP_A = "7698938199183215640";
const GROUP_B = "7698938199183215641";

function detail({
  seriesId = ROOT_ID,
  title = "测试短剧",
  groupId = GROUP_A,
  episodeCount = 12,
  status = "updating",
  firstVisibleTime = "2026-10-16T16:04:00.000Z",
} = {}) {
  return {
    seriesId,
    seriesGroupId: groupId,
    title,
    coverUrl: "https://example.com/cover.jpg",
    intro: "测试简介",
    tags: ["喜剧"],
    episodeCount,
    totalEpisodeCount: episodeCount,
    accessibleEpisodeCount: episodeCount,
    status,
    rightText: "",
    firstVisibleTime,
    detailUrl: `https://hongguoduanju.com/detail?series_id=${seriesId}`,
  };
}

async function createHarness({
  rootDetail = detail(),
  nextDetail = null,
  albumSeriesIds = [],
  recommendFromRoot = Boolean(nextDetail),
  rootRecommendations = [],
  fetchAlbumSeries = null,
  sendNotifications = null,
  now = () => new Date("2026-10-27T08:00:00.000Z"),
  discoveryIntervalMs = 60_000,
  candidateRecheckMs = 60_000,
  timers = null,
} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hongguo-monitor-"));
  const statePath = path.join(directory, "state.json");
  const store = new JsonStateStore(statePath);
  await store.init();
  const details = new Map([[ROOT_ID, rootDetail]]);
  if (nextDetail) {
    details.set(nextDetail.seriesId, nextDetail);
  }
  const notifications = [];
  const albumCalls = [];
  const fetchDetail = async (seriesId) => {
    const found = details.get(seriesId);
    if (!found) {
      throw new Error(`unexpected series ${seriesId}`);
    }
    const recommendations =
      seriesId === ROOT_ID ? [...rootRecommendations] : [];
    if (
      seriesId === ROOT_ID &&
      nextDetail &&
      recommendFromRoot &&
      !recommendations.some(
        (recommendation) => recommendation.seriesId === nextDetail.seriesId,
      )
    ) {
      recommendations.push({
        seriesId: nextDetail.seriesId,
        title: nextDetail.title,
        coverUrl: nextDetail.coverUrl,
        episodeCount: nextDetail.episodeCount,
      });
    }
    return {
      detail: found,
      recommendations,
    };
  };
  const loadAlbumSeries =
    fetchAlbumSeries ||
    (async (seriesId) => {
      albumCalls.push(seriesId);
      return albumSeriesIds;
    });
  const notificationSender =
    sendNotifications ||
    (async (settings, message) => {
      notifications.push({ settings, message });
      return {
        ok: true,
        total: 1,
        delivered: 1,
        failed: 0,
        results: [
          {
            channel: "bark",
            label: "Bark",
            ok: true,
            error: null,
          },
        ],
      };
    });
  const service = new ReminderService({
    store,
    fetchDetail,
    fetchAlbumSeries: loadAlbumSeries,
    resolveShared: async (input) => ({
      seriesId: String(input),
      sharedUrl: "",
    }),
    sendNotifications: notificationSender,
    now,
    discoveryIntervalMs,
    candidateRecheckMs,
    ...(timers ? { timers } : {}),
  });
  return {
    store,
    statePath,
    service,
    details,
    notifications,
    notificationSender,
    albumCalls,
    albumSeriesIds,
  };
}

async function addAndEnableBark(harness) {
  await harness.service.addSubscription(ROOT_ID);
  await harness.store.mutate((state) => {
    state.settings.notifications.bark = {
      enabled: true,
      key: "abc_DEF-123",
    };
  });
}

test("first subscription creates a baseline and never notifies immediately", async () => {
  const harness = await createHarness();
  const result = await harness.service.addSubscription(ROOT_ID);
  assert.equal(result.action, "created");
  const state = await harness.store.read();
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0].seasons[0].highWaterEpisodeCount, 12);
  assert.equal(state.subscriptions[0].hasUnreadUpdate, false);
  assert.equal(state.subscriptions[0].reminderEnabled, true);
  assert.equal(state.subscriptions[0].lastWatchedAt, null);
  assert.equal(state.events[0].type, "baseline");
  assert.equal(harness.notifications.length, 0);
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].hasUnreadUpdate, false);
  assert.equal(dashboard.subscriptions[0].reminderEnabled, true);
  assert.equal(dashboard.subscriptions[0].reminderMode, "enabled");
  assert.equal(
    dashboard.subscriptions[0].reminderMutedForCurrentUpdate,
    false,
  );
  assert.equal(dashboard.subscriptions[0].reminderActive, false);
  assert.equal(dashboard.subscriptions[0].reminderExpiresAt, null);
  assert.equal(dashboard.subscriptions[0].lastWatchedAt, null);
  assert.equal(dashboard.subscriptions[0].searchText, "测试短剧");
  assert.equal(dashboard.subscriptions[0].searchPinyin, "ceshiduanju");
  assert.equal(dashboard.subscriptions[0].searchInitials, "csdj");
});

test("dashboard exposes up to 100 recent events", async () => {
  const harness = await createHarness();
  await harness.store.mutate((state) => {
    state.events = Array.from({ length: 100 }, (_, index) => ({
      id: `dashboard-event-${index}`,
      type: "baseline",
      message: `动态 ${index}`,
      createdAt: new Date(
        Date.parse("2026-10-30T08:00:00.000Z") - index * 1000,
      ).toISOString(),
    }));
  });

  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.events.length, 100);
  assert.equal(dashboard.events[0].id, "dashboard-event-0");
  assert.equal(dashboard.events[99].id, "dashboard-event-99");
});

test("duplicate subscriptions expose the existing subscription id", async () => {
  const harness = await createHarness();
  const first = await harness.service.addSubscription(ROOT_ID);

  await assert.rejects(
    harness.service.addSubscription(ROOT_ID),
    (error) =>
      error.code === "SUBSCRIPTION_EXISTS" &&
      error.subscriptionId === first.subscriptionId &&
      error.seriesTitle === "测试短剧",
  );
});

test("settings accept a custom Cron schedule and multiple notification channels", async () => {
  const harness = await createHarness();
  const settings = await harness.service.updateSettings({
    checkCron: "0  0 * * 0",
    notifications: {
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
        key: "wecom_MONITOR-key-123",
      },
      wecomApp: {
        enabled: true,
        corpId: "wwMONITOR1234567890",
        secret: "wecom-app_MONITOR-secret-123",
        agentId: "1000002",
        toUser: "UserID1|UserID2",
      },
      dingtalk: {
        enabled: true,
        accessToken: "ding_MONITOR-token-123",
        secret: "SEC_MONITOR-secret-123",
      },
    },
  });

  assert.equal(settings.checkCron, "0 0 * * 0");
  assert.equal(settings.notifications.enabledCount, 6);
  assert.equal(settings.notifications.configuredCount, 6);

  const state = await harness.store.read();
  assert.equal(state.settings.checkCron, "0 0 * * 0");
  assert.equal(state.settings.notifications.bark.key, "abc_DEF-123");
  assert.equal(
    state.settings.notifications.ntfy.token,
    "tk_abcdefghijklmnopqrstuvwxyz",
  );
  assert.equal(
    state.settings.notifications.dingtalk.secret,
    "SEC_MONITOR-secret-123",
  );
  assert.deepEqual(state.settings.notifications.wecomApp, {
    enabled: true,
    corpId: "wwMONITOR1234567890",
    secret: "wecom-app_MONITOR-secret-123",
    agentId: "1000002",
    toUser: "UserID1|UserID2",
  });

  const dashboard = await harness.service.getDashboard();
  const publicSettings = JSON.stringify(dashboard.settings);
  assert.equal(publicSettings.includes("abc_DEF-123"), false);
  assert.equal(publicSettings.includes("hongguo-private-topic"), false);
  assert.equal(
    publicSettings.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"),
    false,
  );
  assert.equal(publicSettings.includes("wecom_MONITOR-key-123"), false);
  assert.equal(publicSettings.includes("wwMONITOR1234567890"), false);
  assert.equal(publicSettings.includes("wecom-app_MONITOR-secret-123"), false);
  assert.equal(publicSettings.includes("1000002"), false);
  assert.equal(publicSettings.includes("UserID1"), false);
  assert.equal(publicSettings.includes("ding_MONITOR-token-123"), false);
  assert.equal(publicSettings.includes("SEC_MONITOR-secret-123"), false);
});

test("custom Cron rejects invalid five-field expressions", async () => {
  const harness = await createHarness();
  for (const checkCron of [
    "",
    "0 0 * *",
    "60 * * * *",
    "*/0 * * * *",
    "@every 30m",
  ]) {
    await assert.rejects(
      harness.service.updateSettings({ checkCron }),
      (error) =>
        error.code === "INVALID_CHECK_CRON" && error.statusCode === 400,
    );
  }
});

test("legacy interval input is accepted only when it maps exactly to Cron", async () => {
  const harness = await createHarness();
  const converted = await harness.service.updateSettings({
    intervalMinutes: 60,
  });
  assert.equal(converted.checkCron, "0 * * * *");

  for (const intervalMinutes of [4, 45, 10_081, 12.5]) {
    await assert.rejects(
      harness.service.updateSettings({ intervalMinutes }),
      (error) =>
        error.code === "INVALID_CHECK_CRON" && error.statusCode === 400,
    );
  }
});

test("stale completion defaults to 90 days and accepts both boundaries", async () => {
  const harness = await createHarness();
  let dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.settings.staleCompletionDays, 90);

  const minimum = await harness.service.updateSettings({
    staleCompletionDays: 1,
  });
  assert.equal(minimum.staleCompletionDays, 1);

  const maximum = await harness.service.updateSettings({
    staleCompletionDays: 3650,
  });
  assert.equal(maximum.staleCompletionDays, 3650);
  assert.equal(
    (await harness.store.read()).settings.staleCompletionDays,
    3650,
  );

  dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.settings.staleCompletionDays, 3650);

  for (const staleCompletionDays of [0, 3651, 1.5, "invalid"]) {
    await assert.rejects(
      harness.service.updateSettings({ staleCompletionDays }),
      (error) =>
        error.code === "INVALID_STALE_COMPLETION_DAYS" &&
        error.statusCode === 400,
    );
  }
});

test("persisted scheduling survives restart without shifting the next check", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.service.checkSubscriptions([subscriptionId], {
    notify: false,
    discover: false,
  });

  let state = await harness.store.read();
  assert.equal(state.settings.lastCheckAt, "2026-10-27T08:00:00.000Z");
  assert.equal(state.settings.nextCheckAt, "2026-10-27T10:11:00.000Z");

  now = new Date("2026-10-27T08:10:00.000Z");
  const restartedStore = new JsonStateStore(harness.statePath);
  await restartedStore.init();
  const scheduled = [];
  const restartedService = new ReminderService({
    store: restartedStore,
    now: () => now,
    timers: {
      setTimeout(callback, delay) {
        const timer = {
          callback,
          delay,
          unref() {
            return this;
          },
        };
        scheduled.push(timer);
        return timer;
      },
      clearTimeout() {},
    },
  });

  await restartedService.start();
  assert.equal(restartedService.nextCheckAt, "2026-10-27T10:11:00.000Z");
  assert.equal(scheduled[0].delay, 121 * 60_000);
  restartedService.stop();
});

test("saving a new check Cron reschedules in Asia/Shanghai time", async () => {
  const now = new Date("2026-10-27T08:00:00.000Z");
  const scheduled = [];
  const timers = {
    setTimeout(callback, delay) {
      const timer = {
        callback,
        delay,
        cleared: false,
        unref() {
          return this;
        },
      };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
  };
  const harness = await createHarness({ now: () => now, timers });

  await harness.service.start();
  assert.equal(scheduled[0].delay, 131 * 60_000);
  await harness.service.updateSettings({ checkCron: "0 9 * * *" });

  const state = await harness.store.read();
  assert.equal(state.settings.checkCron, "0 9 * * *");
  assert.equal(
    state.settings.nextCheckAt,
    "2026-10-28T01:00:00.000Z",
  );
  assert.equal(scheduled[0].cleared, true);
  assert.equal(scheduled[1].delay, 17 * 60 * 60_000);
  assert.equal(
    harness.service.nextCheckAt,
    "2026-10-28T01:00:00.000Z",
  );
  harness.service.stop();
});

test("settings save does not wait for notification delivery", async () => {
  const now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({
    now: () => now,
    timers: {
      setTimeout(callback, delay) {
        return {
          callback,
          delay,
          unref() {
            return this;
          },
        };
      },
      clearTimeout() {},
    },
  });
  await harness.service.start();

  let releaseNotification;
  let markNotificationStarted;
  const notificationBlocked = new Promise((resolve) => {
    releaseNotification = resolve;
  });
  const notificationStarted = new Promise((resolve) => {
    markNotificationStarted = resolve;
  });
  harness.service.flushDiscoveryReminders = async () => {
    markNotificationStarted();
    await notificationBlocked;
    return { sent: 1, pending: 0 };
  };
  harness.service.flushDueNotifications = async () => ({
    sent: 0,
    pending: 0,
  });

  const startedAt = Date.now();
  await harness.service.updateSettings({
    checkCron: "0 9 * * *",
  });
  assert.ok(Date.now() - startedAt < 500);
  await notificationStarted;

  releaseNotification();
  await new Promise((resolve) => setImmediate(resolve));
  harness.service.stop();
});

test("manual checks do not shift the durable automatic schedule", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await harness.service.checkSubscriptions([subscriptionId], {
    notify: false,
    discover: false,
  });
  assert.equal(
    (await harness.store.read()).settings.nextCheckAt,
    "2026-10-27T10:11:00.000Z",
  );

  now = new Date("2026-10-27T08:10:00.000Z");
  await harness.service.checkSubscription(subscriptionId, {
    notify: false,
    discover: false,
  });

  assert.equal(
    (await harness.store.read()).settings.nextCheckAt,
    "2026-10-27T10:11:00.000Z",
  );
});

test("overdue checks run after restart and keep their absolute cadence", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({
    now: () => now,
    discoveryIntervalMs: 24 * 60 * 60_000,
  });
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.service.checkSubscriptions([subscriptionId], {
    notify: false,
    discover: false,
  });

  now = new Date("2026-10-27T10:20:00.000Z");
  const restartedStore = new JsonStateStore(harness.statePath);
  await restartedStore.init();
  const scheduled = [];
  const restartedService = new ReminderService({
    store: restartedStore,
    fetchDetail: harness.service.fetchDetail,
    fetchAlbumSeries: harness.service.fetchAlbumSeries,
    resolveShared: async () => ({ seriesId: ROOT_ID, sharedUrl: "" }),
    sendNotifications: harness.service.sendNotifications,
    now: () => now,
    discoveryIntervalMs: 24 * 60 * 60_000,
    timers: {
      setTimeout(callback, delay) {
        const timer = {
          callback,
          delay,
          unref() {
            return this;
          },
        };
        scheduled.push(timer);
        return timer;
      },
      clearTimeout() {},
    },
  });

  await restartedService.start();
  assert.equal(scheduled[0].delay, 1_000);
  await scheduled.shift().callback();

  const state = await restartedStore.read();
  assert.equal(state.settings.lastCheckAt, "2026-10-27T10:20:00.000Z");
  assert.equal(state.settings.nextCheckAt, "2026-10-27T16:11:00.000Z");
  assert.equal(restartedService.nextCheckAt, "2026-10-27T16:11:00.000Z");
  assert.equal(scheduled[0].delay, 351 * 60_000);
  restartedService.stop();
});

test("discovery reminder settings validate duration and Cron expressions", async () => {
  const harness = await createHarness();
  const settings = await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 1440,
    discoveryReminderCron: "0  */6  * * *",
  });

  assert.equal(settings.discoveryReminderDurationMinutes, 1440);
  assert.equal(settings.discoveryReminderCron, "0 */6 * * *");
  const dashboard = await harness.service.getDashboard();
  assert.equal(
    dashboard.settings.discoveryReminderDurationMinutes,
    1440,
  );
  assert.equal(
    dashboard.settings.discoveryReminderCron,
    "0 */6 * * *",
  );

  for (const duration of [-1, 43_201, 1.5]) {
    await assert.rejects(
      harness.service.updateSettings({
        discoveryReminderDurationMinutes: duration,
      }),
      (error) =>
        error.code === "INVALID_DISCOVERY_REMINDER_DURATION" &&
        error.statusCode === 400,
    );
  }
  for (const cron of ["", "0 0 * *", "60 * * * *"]) {
    await assert.rejects(
      harness.service.updateSettings({ discoveryReminderCron: cron }),
      (error) =>
        error.code === "INVALID_DISCOVERY_REMINDER_CRON" &&
        error.statusCode === 400,
    );
  }
});

test("new episodes queue a repeat reminder without extending its window", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 1440,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 13 }));
  await harness.service.checkSubscription(subscriptionId, {
    discover: false,
    notify: false,
  });
  assert.equal(
    (await harness.store.read()).discoveryReminders.length,
    0,
  );

  harness.details.set(ROOT_ID, detail({ episodeCount: 14 }));
  await harness.service.checkSubscription(subscriptionId, {
    discover: false,
  });
  let state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(state.discoveryReminders[0].type, "episode");
  assert.equal(state.discoveryReminders[0].episodeCount, 14);
  assert.equal(state.discoveryReminders[0].previousEpisodeCount, 13);
  assert.equal(
    state.discoveryReminders[0].expiresAt,
    "2026-10-28T08:00:00.000Z",
  );
  const reminderId = state.discoveryReminders[0].id;

  now = new Date("2026-10-27T08:02:00.000Z");
  harness.details.set(ROOT_ID, detail({ episodeCount: 16 }));
  await harness.service.checkSubscription(subscriptionId, {
    discover: false,
  });
  state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(state.discoveryReminders[0].id, reminderId);
  assert.equal(state.discoveryReminders[0].episodeCount, 16);
  assert.equal(
    state.discoveryReminders[0].lastDiscoveredAt,
    "2026-10-27T08:02:00.000Z",
  );
  assert.equal(
    state.discoveryReminders[0].expiresAt,
    "2026-10-28T08:00:00.000Z",
  );
  assert.equal(harness.notifications.length, 2);
});

test("new seasons also start a continuous reminder", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
      firstVisibleTime: "2026-10-17T16:04:00.000Z",
    }),
    albumSeriesIds: [NEXT_ID],
    recommendFromRoot: false,
  });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  const reminders = (await harness.store.read()).discoveryReminders;
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].type, "season");
  assert.equal(reminders[0].seasonId, NEXT_ID);
  assert.equal(reminders[0].episodeCount, 6);
});

test("episode and new season discoveries mark the series as unread", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
      firstVisibleTime: "2026-10-17T16:04:00.000Z",
    }),
    albumSeriesIds: [NEXT_ID],
    recommendFromRoot: false,
  });
  const added = await harness.service.addSubscription(ROOT_ID);

  harness.details.set(ROOT_ID, detail({ episodeCount: 13 }));
  await harness.service.checkSubscription(added.subscriptionId, {
    discover: false,
    notify: false,
  });
  let state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);

  await harness.service.markSubscriptionWatched(added.subscriptionId);
  await harness.service.checkSubscription(added.subscriptionId, {
    discover: true,
    forceDiscovery: true,
    notify: false,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(state.subscriptions[0].seasons.length, 2);
});

test("marking watched clears queued reminders until another update arrives", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  let state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(state.pendingNotifications.length, 1);
  assert.equal(state.discoveryReminders.length, 1);
  assert.ok(
    state.events.find((event) => event.type === "episode")
      ?.notificationDueAt,
  );

  const watched = await harness.service.markSubscriptionWatched(subscriptionId);
  state = await harness.store.read();
  assert.equal(watched.lastWatchedAt, "2026-10-27T08:00:00.000Z");
  assert.equal(state.subscriptions[0].hasUnreadUpdate, false);
  assert.equal(state.subscriptions[0].reminderEnabled, true);
  assert.equal(
    state.subscriptions[0].lastWatchedAt,
    "2026-10-27T08:00:00.000Z",
  );
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(state.discoveryReminders.length, 0);
  const episodeEvent = state.events.find((event) => event.type === "episode");
  assert.equal(episodeEvent.notificationDueAt, null);
  assert.equal(episodeEvent.notificationError, null);

  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, false);
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(state.discoveryReminders.length, 0);

  harness.details.set(ROOT_ID, detail({ episodeCount: 16 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(state.subscriptions[0].reminderEnabled, true);
  assert.equal(state.pendingNotifications.length, 1);
  assert.equal(state.discoveryReminders.length, 1);
});

test("disabled reminders suppress manual and aggregated update notifications", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await harness.service.setSubscriptionReminderEnabled(
    subscriptionId,
    false,
  );
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscription(subscriptionId, {
    discover: false,
  });
  harness.details.set(ROOT_ID, detail({ episodeCount: 16 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });

  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(state.subscriptions[0].reminderEnabled, false);
  assert.equal(state.subscriptions[0].reminderMutedForCurrentUpdate, false);
  assert.equal(harness.notifications.length, 0);
});

test("muting pauses current reminders and resumes on the next episode", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  let state = await harness.store.read();
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(state.pendingNotifications.length, 1);
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(harness.notifications.length, 0);

  const muted = await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "muted",
  );
  state = await harness.store.read();
  assert.equal(muted.reminderMode, "muted");
  assert.equal(state.subscriptions[0].reminderEnabled, true);
  assert.equal(
    state.subscriptions[0].reminderMutedForCurrentUpdate,
    true,
  );
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(state.discoveryReminders.length, 1);
  let dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderMode, "muted");
  assert.equal(dashboard.subscriptions[0].reminderActive, false);

  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  state = await harness.store.read();
  assert.equal(
    state.subscriptions[0].reminderMutedForCurrentUpdate,
    true,
  );
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(harness.notifications.length, 0);

  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
  });
  harness.details.set(ROOT_ID, detail({ episodeCount: 16 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  state = await harness.store.read();
  assert.equal(
    state.subscriptions[0].reminderMutedForCurrentUpdate,
    false,
  );
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /第 16 集/);
  assert.equal(state.discoveryReminders.length, 1);
  dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderMode, "enabled");
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
});

test("restoring a reminder resumes its animation and due notifications", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "* * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "muted",
  );

  now = new Date("2026-10-27T08:05:00.000Z");
  const enabled = await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "enabled",
  );

  assert.equal(enabled.reminderMode, "enabled");
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /第 15 集/);
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
  assert.ok(dashboard.subscriptions[0].reminderExpiresAt);
});

test("enabling reminders rebuilds a queue cleared by the previous mute behavior", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "0 */4 * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "disabled",
  );
  await harness.store.mutate((state) => {
    state.pendingNotifications = [];
    state.discoveryReminders = [];
  });

  now = new Date("2026-10-27T09:00:00.000Z");
  await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "enabled",
  );

  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /第 15 集/);
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
});

test("enabling reminders does not rebuild updates outside the reminder window", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "0 */4 * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  const notificationsBeforeEnabling = harness.notifications.length;
  await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "disabled",
  );
  await harness.store.mutate((state) => {
    state.pendingNotifications = [];
    state.discoveryReminders = [];
  });

  now = new Date("2026-10-27T09:01:00.000Z");
  await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "enabled",
  );

  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 0);
  assert.equal(
    harness.notifications.length,
    notificationsBeforeEnabling,
  );
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, false);
});

test("service start rebuilds current reminders missing after an old mute", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "* * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  await harness.store.mutate((state) => {
    state.pendingNotifications = [];
    state.discoveryReminders = [];
  });

  now = new Date("2026-10-27T08:30:00.000Z");
  await harness.service.start();
  harness.service.stop();

  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(harness.notifications.length, 1);
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
});

test("a muted reminder resumes when a new season is discovered", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
      firstVisibleTime: "2026-10-17T16:04:00.000Z",
    }),
    albumSeriesIds: [NEXT_ID],
    recommendFromRoot: false,
  });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 0,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 13 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
    notify: false,
  });
  await harness.service.setSubscriptionReminderState(
    subscriptionId,
    "muted",
  );

  await harness.service.checkSubscriptions([subscriptionId], {
    discover: true,
    forceDiscovery: true,
  });
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 2);
  assert.equal(
    state.subscriptions[0].reminderMutedForCurrentUpdate,
    false,
  );
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /新季/);
});

test("enabling a paused summary sends its due notification without another update", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
    discoveryReminderDurationMinutes: 0,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.service.setSubscriptionReminderEnabled(
    subscriptionId,
    false,
  );

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  let state = await harness.store.read();
  assert.equal(state.pendingNotifications.length, 1);
  assert.equal(harness.notifications.length, 0);

  now = new Date("2026-10-27T09:00:00.000Z");
  const pausedFlush = await harness.service.flushDueNotifications();
  assert.equal(pausedFlush.sent, 0);
  assert.equal(pausedFlush.pending, 1);
  assert.equal(harness.notifications.length, 0);

  const enabled = await harness.service.setSubscriptionReminderEnabled(
    subscriptionId,
    true,
  );
  state = await harness.store.read();
  assert.equal(enabled.reminderEnabled, true);
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /第 15 集/);
});

test("paused sustained reminders resume only after reminders are enabled again", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "* * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.service.setSubscriptionReminderEnabled(
    subscriptionId,
    false,
  );

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  let state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(harness.notifications.length, 0);

  now = new Date("2026-10-27T08:01:00.000Z");
  const pausedFlush = await harness.service.flushDiscoveryReminders();
  assert.equal(pausedFlush.sent, 0);
  assert.equal(pausedFlush.pending, 0);
  assert.equal(harness.notifications.length, 0);

  const enabled = await harness.service.setSubscriptionReminderEnabled(
    subscriptionId,
    true,
  );
  state = await harness.store.read();
  assert.equal(enabled.reminderEnabled, true);
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(harness.notifications.length, 1);
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
  assert.ok(dashboard.subscriptions[0].reminderExpiresAt);
});

test("watched state can be restored to unread without losing watch history", async () => {
  const harness = await createHarness();
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  const watched = await harness.service.markSubscriptionWatched(subscriptionId);
  const unwatched =
    await harness.service.markSubscriptionUnwatched(subscriptionId);
  const state = await harness.store.read();

  assert.equal(watched.hasUnreadUpdate, false);
  assert.equal(unwatched.hasUnreadUpdate, true);
  assert.equal(state.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(
    state.subscriptions[0].lastWatchedAt,
    "2026-10-27T08:00:00.000Z",
  );
});

test("restoring unread state reactivates the sustained reminder window", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await harness.service.addSubscription(ROOT_ID);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });

  now = new Date("2026-10-27T08:05:00.000Z");
  await harness.service.markSubscriptionWatched(subscriptionId);
  now = new Date("2026-10-27T08:15:00.000Z");
  await harness.service.markSubscriptionUnwatched(subscriptionId);

  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(
    state.discoveryReminders[0].expiresAt,
    "2026-10-27T10:00:00.000Z",
  );
  assert.equal(
    state.subscriptions[0].lastWatchedAt,
    "2026-10-27T08:05:00.000Z",
  );
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
  assert.equal(
    dashboard.subscriptions[0].reminderExpiresAt,
    "2026-10-27T10:00:00.000Z",
  );
});

test("restoring unread state does not revive an expired reminder", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await harness.service.addSubscription(ROOT_ID);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });

  now = new Date("2026-10-27T08:05:00.000Z");
  await harness.service.markSubscriptionWatched(subscriptionId);
  now = new Date("2026-10-27T09:01:00.000Z");
  await harness.service.markSubscriptionUnwatched(subscriptionId);

  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 0);
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, false);
  assert.equal(dashboard.subscriptions[0].reminderExpiresAt, null);
});

test("service start repairs a missing reminder for manually restored unread state", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await harness.service.addSubscription(ROOT_ID);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  now = new Date("2026-10-27T08:05:00.000Z");
  await harness.service.markSubscriptionWatched(subscriptionId);
  await harness.store.mutate((state) => {
    state.subscriptions[0].hasUnreadUpdate = true;
    state.discoveryReminders = [];
  });

  now = new Date("2026-10-27T08:10:00.000Z");
  await harness.service.start();
  harness.service.stop();

  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 1);
  assert.equal(
    state.discoveryReminders[0].expiresAt,
    "2026-10-27T10:00:00.000Z",
  );
  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].reminderActive, true);
});

test("service start does not revive an older watched update when a newer one exists", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await harness.service.addSubscription(ROOT_ID);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 0,
    discoveryReminderDurationMinutes: 120,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  now = new Date("2026-10-27T08:05:00.000Z");
  await harness.service.markSubscriptionWatched(subscriptionId);

  now = new Date("2026-10-27T08:10:00.000Z");
  harness.details.set(ROOT_ID, detail({ episodeCount: 16 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  await harness.store.mutate((state) => {
    state.discoveryReminders = [];
  });

  now = new Date("2026-10-27T08:11:00.000Z");
  await harness.service.start();
  harness.service.stop();

  const state = await harness.store.read();
  const latestEvent = state.events.find((event) =>
    event.message.includes("第 16 集"),
  );
  assert.equal(state.discoveryReminders.length, 1);
  assert.deepEqual(state.discoveryReminders[0].eventIds, [latestEvent.id]);
  assert.equal(
    state.discoveryReminders[0].expiresAt,
    "2026-10-27T10:10:00.000Z",
  );
});

test("Cron reminders combine series and never trigger an automatic check", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const scheduled = [];
  const timers = {
    setTimeout(callback, delay) {
      const timer = {
        callback,
        delay,
        cleared: false,
        unref() {
          return this;
        },
      };
      scheduled.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
  };
  const harness = await createHarness({ now: () => now, timers });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 4,
    }),
  );
  await addAndEnableBark(harness);
  await harness.service.addSubscription(OTHER_ID);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  const state = await harness.store.read();
  const subscriptionIds = state.subscriptions.map((item) => item.id);
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 7,
    }),
  );
  await harness.service.checkSubscriptions(subscriptionIds, {
    discover: false,
  });
  assert.equal(harness.notifications.length, 1);

  await harness.service.start();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 10 * 60_000);
  const reminderTimer = scheduled.shift();
  now = new Date("2026-10-27T08:10:00.000Z");
  await reminderTimer.callback();

  assert.equal(harness.notifications.length, 2);
  const reminder = harness.notifications[1].message;
  assert.equal(reminder.title, "红果短剧新内容提醒");
  assert.match(reminder.body, /《测试短剧》 · 第 15 集（新增 3 集）/);
  assert.match(reminder.body, /《另一部短剧》 · 第 7 集（新增 3 集）/);
  assert.match(reminder.body, /提醒有效至：2026-10-27 17:00/);
  assert.equal(
    reminder.body
      .split("\n")
      .filter((line) => /^\d+\. /u.test(line)).length,
    2,
  );
  const latestState = await harness.store.read();
  assert.equal(
    latestState.settings.lastCheckAt,
    "2026-10-27T08:00:00.000Z",
  );
  assert.equal(harness.service.nextCheckAt, "2026-10-27T10:11:00.000Z");
  harness.service.stop();
});

test("continuous reminder failures retry and expire without sending again", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  let sendCount = 0;
  const sentMessages = [];
  const harness = await createHarness({
    now: () => now,
    sendNotifications: async (_settings, message) => {
      sendCount += 1;
      sentMessages.push(message);
      if (sendCount === 2) {
        throw new Error("临时网络错误。");
      }
      return {
        ok: true,
        total: 1,
        delivered: 1,
        failed: 0,
        results: [
          {
            channel: "bark",
            label: "Bark",
            ok: true,
            error: null,
          },
        ],
      };
    },
  });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );

  now = new Date("2026-10-27T08:10:00.000Z");
  assert.equal((await harness.service.flushDiscoveryReminders()).sent, 0);
  let state = await harness.store.read();
  assert.equal(
    state.discoveryReminders[0].nextReminderAt,
    "2026-10-27T08:25:00.000Z",
  );
  assert.match(state.discoveryReminders[0].lastError, /临时网络错误/);

  now = new Date("2026-10-27T08:25:00.000Z");
  assert.equal((await harness.service.flushDiscoveryReminders()).sent, 1);
  assert.equal(sentMessages.at(-1).title, "红果短剧新内容提醒");
  state = await harness.store.read();
  assert.equal(
    state.discoveryReminders[0].nextReminderAt,
    "2026-10-27T08:30:00.000Z",
  );

  now = new Date("2026-10-27T09:01:00.000Z");
  assert.equal((await harness.service.flushDiscoveryReminders()).sent, 0);
  state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 0);
  assert.equal(sendCount, 3);
});

test("continuous reminders survive a service restart", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );
  assert.equal(
    (await harness.store.read()).discoveryReminders.length,
    1,
  );

  now = new Date("2026-10-27T08:10:00.000Z");
  const restartedStore = new JsonStateStore(harness.statePath);
  await restartedStore.init();
  const restartedNotifications = [];
  const scheduled = [];
  const restartedService = new ReminderService({
    store: restartedStore,
    now: () => now,
    timers: {
      setTimeout(callback, delay) {
        const timer = {
          callback,
          delay,
          cleared: false,
          unref() {
            return this;
          },
        };
        scheduled.push(timer);
        return timer;
      },
      clearTimeout(timer) {
        timer.cleared = true;
      },
    },
    sendNotifications: async (settings, message) => {
      restartedNotifications.push({ settings, message });
      return {
        ok: true,
        total: 1,
        delivered: 1,
        failed: 0,
        results: [
          {
            channel: "bark",
            label: "Bark",
            ok: true,
            error: null,
          },
        ],
      };
    },
  });

  await restartedService.start();
  assert.equal(restartedNotifications.length, 1);
  assert.equal(
    restartedNotifications[0].message.title,
    "红果短剧新内容提醒",
  );
  const state = await restartedStore.read();
  assert.equal(
    state.discoveryReminders[0].nextReminderAt,
    "2026-10-27T08:20:00.000Z",
  );
  assert.equal(restartedService.nextCheckAt, "2026-10-27T10:11:00.000Z");
  assert.equal(scheduled[0].delay, 10 * 60_000);
  restartedService.stop();
});

test("removing a subscription clears its continuous reminders", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscription(subscriptionId, {
    discover: false,
  });
  assert.equal(
    (await harness.store.read()).discoveryReminders.length,
    1,
  );

  await harness.service.removeSubscription(subscriptionId);
  const state = await harness.store.read();
  assert.equal(state.discoveryReminders.length, 0);
  assert.equal(state.events.length, 0);
});

test("disabling continuous reminders clears the pending queue", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );
  assert.equal(
    (await harness.store.read()).discoveryReminders.length,
    1,
  );

  const settings = await harness.service.updateSettings({
    discoveryReminderDurationMinutes: 0,
  });
  assert.equal(settings.discoveryReminderDurationMinutes, 0);
  assert.equal(settings.pendingDiscoveryReminderCount, 0);
  assert.equal(
    (await harness.store.read()).discoveryReminders.length,
    0,
  );
});

test("episode growth raises an event and sends one Bark notification", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );
  assert.equal(result.updatedSeasons, 1);
  const state = await harness.store.read();
  const episodeEvent = state.events.find((event) => event.type === "episode");
  assert.equal(episodeEvent.previousEpisodeCount, 12);
  assert.equal(episodeEvent.episodeCount, 15);
  assert.equal(episodeEvent.notified, true);
  assert.equal(
    state.subscriptions[0].seasons[0].lastEpisodeChangedAt,
    "2026-10-27T08:00:00.000Z",
  );
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /第 15 集/);
  assert.match(
    harness.notifications[0].message.body,
    /季上线：2026-10-17 00:04/,
  );
  assert.match(
    harness.notifications[0].message.body,
    /检测到更新：2026-10-27 16:00/,
  );
});

test("custom templates render detailed, batch and continuous reminder messages", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    notificationTemplates: {
      detailed: {
        title: "单剧：{seriesTitle}（{seasonCount}季）",
        body: "检查：{checkTime}\n{updates}",
      },
      batch: {
        title: "汇总：{updateCount}个系列",
        body: "批次：{checkTime}\n{updates}",
      },
      reminder: {
        title: "提醒：{updateCount}个系列",
        body: "提醒：{reminderTime}\n{updates}",
      },
    },
    discoveryReminderDurationMinutes: 60,
    discoveryReminderCron: "*/10 * * * *",
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscription(subscriptionId, {
    discover: false,
  });
  assert.equal(harness.notifications.length, 1);
  assert.equal(
    harness.notifications[0].message.title,
    "单剧：测试短剧（1季）",
  );
  assert.match(
    harness.notifications[0].message.body,
    /^检查：2026-10-27 16:00\n• 集数更新：《测试短剧》更新到第 15 集，新增 3 集。/,
  );

  now = new Date("2026-10-27T08:10:00.000Z");
  assert.equal(
    (await harness.service.flushDiscoveryReminders()).sent,
    1,
  );
  assert.equal(harness.notifications.length, 2);
  assert.equal(
    harness.notifications[1].message.title,
    "提醒：1个系列",
  );
  assert.match(
    harness.notifications[1].message.body,
    /^提醒：2026-10-27 16:10\n1\. 《测试短剧》 · 第 15 集/,
  );

  now = new Date("2026-10-27T08:20:00.000Z");
  harness.details.set(ROOT_ID, detail({ episodeCount: 18 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  assert.equal(harness.notifications.length, 3);
  assert.equal(
    harness.notifications[2].message.title,
    "汇总：1个系列",
  );
  assert.match(
    harness.notifications[2].message.body,
    /^批次：2026-10-27 16:20\n1\. 《测试短剧》 · 第 18 集/,
  );
});

test("notifications keep a missing official launch time unknown", async () => {
  const harness = await createHarness({
    rootDetail: detail({ firstVisibleTime: null }),
  });
  await addAndEnableBark(harness);
  harness.details.set(
    ROOT_ID,
    detail({ episodeCount: 15, firstVisibleTime: null }),
  );

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );

  assert.match(
    harness.notifications[0].message.body,
    /季上线：时间未知/,
  );
});

test("partial notification delivery still marks the event notified", async () => {
  const harness = await createHarness({
    sendNotifications: async () => ({
      ok: false,
      total: 2,
      delivered: 1,
      failed: 1,
      results: [
        { channel: "bark", label: "Bark", ok: true, error: null },
        {
          channel: "telegram",
          label: "Telegram",
          ok: false,
          error: "网络不可用。",
        },
      ],
    }),
  });
  await addAndEnableBark(harness);
  await harness.store.mutate((state) => {
    state.settings.notifications.telegram = {
      enabled: true,
      botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
      chatId: "123456789",
    };
  });
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );
  const state = await harness.store.read();
  const episodeEvent = state.events.find((event) => event.type === "episode");
  assert.equal(episodeEvent.notified, true);
  assert.match(episodeEvent.notificationError, /Telegram：网络不可用/);
});

test("episode notification window accepts only supported values", async () => {
  const harness = await createHarness();
  const settings = await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  assert.equal(settings.episodeNotificationWindowMinutes, 60);

  for (const episodeNotificationWindowMinutes of [30, 90, 2880, 1.5]) {
    await assert.rejects(
      harness.service.updateSettings({
        episodeNotificationWindowMinutes,
      }),
      (error) =>
        error.code === "INVALID_NOTIFICATION_WINDOW" &&
        error.statusCode === 400,
    );
  }
});

test("episode growth is aggregated once per window", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  let state = await harness.store.read();
  assert.equal(state.pendingNotifications.length, 1);
  assert.equal(state.pendingNotifications[0].baselineEpisodeCount, 12);
  assert.equal(state.pendingNotifications[0].episodeCount, 15);
  assert.equal(
    state.pendingNotifications[0].dueAt,
    "2026-10-27T09:05:00.000Z",
  );
  assert.equal(harness.notifications.length, 0);

  now = new Date("2026-10-27T08:20:00.000Z");
  harness.details.set(ROOT_ID, detail({ episodeCount: 18 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  state = await harness.store.read();
  assert.equal(state.pendingNotifications.length, 1);
  assert.equal(state.pendingNotifications[0].baselineEpisodeCount, 12);
  assert.equal(state.pendingNotifications[0].episodeCount, 18);
  assert.equal(state.pendingNotifications[0].eventIds.length, 2);
  assert.equal(
    state.pendingNotifications[0].dueAt,
    "2026-10-27T09:05:00.000Z",
  );
  assert.equal(harness.notifications.length, 0);

  now = new Date("2026-10-27T09:04:00.000Z");
  await harness.service.flushDueNotifications();
  assert.equal(harness.notifications.length, 0);

  now = new Date("2026-10-27T09:05:00.000Z");
  const flushed = await harness.service.flushDueNotifications();
  assert.equal(flushed.sent, 1);
  assert.equal(flushed.pending, 0);
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message.body, /第 18 集/);
  assert.match(harness.notifications[0].message.body, /新增 6 集/);
  state = await harness.store.read();
  assert.equal(
    state.events.filter((event) => event.type === "episode").every(
      (event) => event.notified,
    ),
    true,
  );
});

test("due episode notifications combine multiple series into one message", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const harness = await createHarness({ now: () => now });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 4,
    }),
  );
  await addAndEnableBark(harness);
  await harness.service.addSubscription(OTHER_ID);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const state = await harness.store.read();
  const rootSubscriptionId = state.subscriptions.find(
    (subscription) => subscription.primarySeriesId === ROOT_ID,
  ).id;
  const otherSubscriptionId = state.subscriptions.find(
    (subscription) => subscription.primarySeriesId === OTHER_ID,
  ).id;

  now = new Date("2026-10-27T08:06:00.000Z");
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 7,
    }),
  );
  await harness.service.checkSubscriptions(
    [rootSubscriptionId, otherSubscriptionId],
    { discover: false },
  );
  assert.equal(
    (await harness.store.read()).pendingNotifications.length,
    2,
  );
  assert.equal(harness.notifications.length, 0);

  now = new Date("2026-10-27T09:06:00.000Z");
  const result = await harness.service.flushDueNotifications();
  assert.equal(result.sent, 1);
  assert.equal(result.pending, 0);
  assert.equal(harness.notifications.length, 1);
  const message = harness.notifications[0].message;
  assert.match(message.body, /最近检测：2026-10-27 16:06/);
  assert.match(message.body, /季上线：2026-10-17 00:04/);
  assert.match(message.body, /检测到更新：2026-10-27 16:06/);
  assert.match(
    message.body,
    /《测试短剧》 · 第 15 集（本时段新增 3 集）/,
  );
  assert.match(
    message.body,
    /《另一部短剧》 · 第 7 集（本时段新增 3 集）/,
  );
  assert.equal(
    message.body
      .split("\n")
      .filter((line) => /^\d+\. /u.test(line)).length,
    2,
  );
});

test("changing the aggregation window keeps the first observation as its start", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });

  now = new Date("2026-10-27T08:30:00.000Z");
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 120,
  });
  const state = await harness.store.read();
  assert.equal(
    state.pendingNotifications[0].dueAt,
    "2026-10-27T10:05:00.000Z",
  );
  assert.equal(
    state.events.find((event) => event.type === "episode")
      .notificationDueAt,
    "2026-10-27T10:05:00.000Z",
  );
});

test("notify false checks never queue an aggregated notification", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));

  await harness.service.checkSubscriptions([subscriptionId], {
    notify: false,
    discover: false,
  });
  const state = await harness.store.read();
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(
    state.events.find((event) => event.type === "episode")
      .notificationDueAt,
    null,
  );
  assert.equal(harness.notifications.length, 0);
});

test("pending aggregated notifications survive a service restart", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const harness = await createHarness({ now: () => now });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  assert.equal(
    (await harness.store.read()).pendingNotifications.length,
    1,
  );

  now = new Date("2026-10-27T09:10:00.000Z");
  const restartedStore = new JsonStateStore(harness.statePath);
  await restartedStore.init();
  const restartedNotifications = [];
  const restartedService = new ReminderService({
    store: restartedStore,
    now: () => now,
    sendNotifications: async (settings, message) => {
      restartedNotifications.push({ settings, message });
      return {
        ok: true,
        total: 1,
        delivered: 1,
        failed: 0,
        results: [
          {
            channel: "bark",
            label: "Bark",
            ok: true,
            error: null,
          },
        ],
      };
    },
    timers: {
      setTimeout: () => ({ unref() {} }),
      clearTimeout: () => {},
    },
  });

  await restartedService.start();
  restartedService.stop();
  assert.equal(restartedNotifications.length, 1);
  assert.match(restartedNotifications[0].message.body, /第 15 集/);
  assert.equal(
    (await restartedStore.read()).pendingNotifications.length,
    0,
  );
});

test("failed aggregated notifications retry after fifteen minutes", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const attempts = [];
  const harness = await createHarness({
    now: () => now,
    sendNotifications: async (settings, message) => {
      attempts.push({ settings, message });
      if (attempts.length === 1) {
        return {
          ok: false,
          total: 1,
          delivered: 0,
          failed: 1,
          results: [
            {
              channel: "bark",
              label: "Bark",
              ok: false,
              error: "网络不可用。",
            },
          ],
        };
      }
      return {
        ok: true,
        total: 1,
        delivered: 1,
        failed: 0,
        results: [
          {
            channel: "bark",
            label: "Bark",
            ok: true,
            error: null,
          },
        ],
      };
    },
  });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });

  now = new Date("2026-10-27T09:05:00.000Z");
  let result = await harness.service.flushDueNotifications();
  assert.equal(result.sent, 0);
  assert.equal(result.pending, 1);
  assert.equal(attempts.length, 1);
  let state = await harness.store.read();
  assert.equal(
    state.pendingNotifications[0].dueAt,
    "2026-10-27T09:20:00.000Z",
  );
  assert.match(
    state.pendingNotifications[0].lastError,
    /Bark：网络不可用/,
  );

  now = new Date("2026-10-27T09:19:00.000Z");
  result = await harness.service.flushDueNotifications();
  assert.equal(result.sent, 0);
  assert.equal(attempts.length, 1);

  now = new Date("2026-10-27T09:20:00.000Z");
  result = await harness.service.flushDueNotifications();
  assert.equal(result.sent, 1);
  assert.equal(result.pending, 0);
  assert.equal(attempts.length, 2);
  state = await harness.store.read();
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(
    state.events.find((event) => event.type === "episode").notified,
    true,
  );
});

test("removing a subscription clears its pending aggregated notification", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  await harness.service.checkSubscriptions([subscriptionId], {
    discover: false,
  });
  assert.equal(
    (await harness.store.read()).pendingNotifications.length,
    1,
  );

  await harness.service.removeSubscription(subscriptionId);
  const state = await harness.store.read();
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(state.events.length, 0);
});

test("episode count decreases do not lower the high-water baseline", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  harness.details.set(ROOT_ID, detail({ episodeCount: 8 }));

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );
  const state = await harness.store.read();
  const season = state.subscriptions[0].seasons[0];
  assert.equal(season.episodeCount, 8);
  assert.equal(season.lastObservedEpisodeCount, 8);
  assert.equal(season.highWaterEpisodeCount, 12);
  assert.equal(
    state.events.filter((event) => event.type === "episode").length,
    0,
  );
  assert.equal(harness.notifications.length, 0);
});

test("a completed season stays unknown without a verified complete series list", async () => {
  const harness = await createHarness();
  await addAndEnableBark(harness);
  harness.details.set(
    ROOT_ID,
    detail({ episodeCount: 12, status: "completed" }),
  );

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: false },
  );
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "unknown");
  assert.match(state.subscriptions[0].seriesStatusReason, /官方多季列表/);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    0,
  );
  assert.equal(harness.notifications.length, 0);
});

test("all completed seasons stay unknown without a series finale marker", async () => {
  const harness = await createHarness({
    albumSeriesIds: [ROOT_ID],
  });
  await addAndEnableBark(harness);
  harness.details.set(
    ROOT_ID,
    detail({
      title: "测试短剧第一季",
      episodeCount: 12,
      status: "completed",
    }),
  );

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "unknown");
  assert.match(state.subscriptions[0].seriesStatusReason, /完结篇/);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    0,
  );
  assert.equal(harness.notifications.length, 0);
});

test("complete series is announced once and non-forced checks are skipped", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({
    albumSeriesIds: [ROOT_ID],
    now: () => now,
  });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });
  harness.details.set(
    ROOT_ID,
    detail({
      title: "测试短剧第一季完结篇",
      episodeCount: 12,
      status: "completed",
    }),
  );
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  let state = await harness.store.read();
  let subscription = state.subscriptions[0];
  assert.equal(subscription.seriesStatus, "completed");
  assert.equal(subscription.seriesCompletionAnnounced, true);
  assert.ok(subscription.completedAt);
  const completedAt = subscription.completedAt;
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    1,
  );
  assert.equal(
    harness.notifications.filter(
      (item) => item.message.title === "短剧系列已完结",
    ).length,
    1,
  );

  const calls = [];
  harness.service.fetchDetail = async (seriesId) => {
    calls.push(seriesId);
    throw new Error("已完结系列不应继续请求详情");
  };
  now = new Date("2026-10-27T09:00:00.000Z");
  const skippedResult = await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
    forceCompletedCheck: false,
  });
  assert.equal(skippedResult.skipped, "completed");
  assert.deepEqual(calls, []);
  state = await harness.store.read();
  subscription = state.subscriptions[0];
  assert.equal(subscription.seriesStatus, "completed");
  assert.equal(subscription.seriesCompletionAnnounced, true);
  assert.equal(subscription.completedAt, completedAt);

  now = new Date("2026-10-27T10:00:00.000Z");
  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
    forceCompletedCheck: false,
  });
  assert.deepEqual(calls, []);
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "completed");
  assert.equal(state.subscriptions[0].completedAt, completedAt);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    1,
  );
  assert.equal(
    harness.notifications.filter(
      (item) => item.message.title === "短剧系列已完结",
    ).length,
    1,
  );
});

test("bulk checks skip completed series while manual checks force verification", async () => {
  const harness = await createHarness({
    albumSeriesIds: [ROOT_ID],
  });
  harness.details.set(
    ROOT_ID,
    detail({
      title: "测试短剧第一季完结篇",
      episodeCount: 12,
      status: "completed",
    }),
  );
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await harness.service.checkSubscription(subscriptionId, {
    notify: false,
    discover: true,
    forceDiscovery: true,
  });
  assert.equal(
    (await harness.store.read()).subscriptions[0].seriesStatus,
    "completed",
  );

  const calls = [];
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async (seriesId) => {
    calls.push(seriesId);
    return healthyFetchDetail(seriesId);
  };

  const bulkResult = await harness.service.checkSubscriptions(
    [subscriptionId],
    {
      notify: false,
      discover: false,
    },
  );
  assert.equal(bulkResult.checkedSubscriptions, 0);
  assert.equal(bulkResult.skippedCompleted, 1);
  assert.equal(bulkResult.seasonsChecked, 0);
  assert.deepEqual(calls, []);

  const manualResult = await harness.service.checkSubscription(
    subscriptionId,
    {
      notify: false,
      discover: false,
    },
  );
  assert.equal(manualResult.skipped, undefined);
  assert.equal(manualResult.seasonsChecked, 1);
  assert.equal(manualResult.completionRechecked, true);
  assert.equal(manualResult.reactivatedFromCompleted, false);
  assert.deepEqual(calls, [ROOT_ID]);
  assert.equal(
    (await harness.store.read()).subscriptions[0].seriesStatus,
    "completed",
  );
});

test("check all skips completed series and still checks active series", async () => {
  const harness = await createHarness({
    albumSeriesIds: [ROOT_ID],
  });
  harness.details.set(
    ROOT_ID,
    detail({
      title: "测试短剧第一季完结篇",
      episodeCount: 12,
      status: "completed",
    }),
  );
  await harness.service.addSubscription(ROOT_ID);
  const rootSubscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.service.checkSubscription(rootSubscriptionId, {
    notify: false,
    discover: true,
    forceDiscovery: true,
  });
  const completedLastCheckedAt = (
    await harness.store.read()
  ).subscriptions[0].lastCheckedAt;

  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 4,
    }),
  );
  await harness.service.addSubscription(OTHER_ID);

  const calls = [];
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async (seriesId) => {
    calls.push(seriesId);
    return healthyFetchDetail(seriesId);
  };
  const result = await harness.service.checkAll({
    notify: false,
    discover: false,
  });

  assert.equal(result.subscriptions, 2);
  assert.equal(result.checkedSubscriptions, 1);
  assert.equal(result.skippedCompleted, 1);
  assert.equal(result.seasonsChecked, 1);
  assert.deepEqual(calls, [OTHER_ID]);
  const state = await harness.store.read();
  const completedSubscription = state.subscriptions.find(
    (item) => item.id === rootSubscriptionId,
  );
  assert.equal(completedSubscription.lastCheckedAt, completedLastCheckedAt);
});

test("check all skips paused series without requesting their details", async (t) => {
  const harness = await createHarness({
    albumSeriesIds: [ROOT_ID],
  });
  await harness.service.addSubscription(ROOT_ID);
  const state = await harness.store.read();
  const subscriptionId = state.subscriptions[0].id;
  await harness.service.setSubscriptionTrackingState(subscriptionId, true);

  const calls = [];
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async (seriesId) => {
    calls.push(seriesId);
    return healthyFetchDetail(seriesId);
  };
  const result = await harness.service.checkAll({
    notify: false,
    discover: false,
  });

  assert.equal(result.subscriptions, 1);
  assert.equal(result.checkedSubscriptions, 0);
  assert.equal(result.skippedPaused, 1);
  assert.equal(result.seasonsChecked, 0);
  assert.deepEqual(calls, []);
  assert.equal(
    (await harness.store.read()).subscriptions[0].trackingPaused,
    true,
  );
});

test("stale active series is checked and marked inactive from content time", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({
    rootDetail: detail({
      firstVisibleTime: "2026-10-16T16:04:00.000Z",
    }),
    now: () => now,
  });
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.store.mutate((state) => {
    state.subscriptions[0].lastCheckedAt =
      "2027-02-03T07:00:00.000Z";
  });

  const calls = [];
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async (seriesId) => {
    calls.push(seriesId);
    return healthyFetchDetail(seriesId);
  };
  now = new Date("2027-02-04T08:00:00.000Z");

  const result = await harness.service.checkSubscription(subscriptionId, {
    notify: false,
    discover: false,
  });
  assert.equal(result.autoInactive, true);
  assert.equal(result.skipped, undefined);
  assert.deepEqual(calls, [ROOT_ID]);

  const state = await harness.store.read();
  const subscription = state.subscriptions[0];
  assert.equal(
    subscription.autoInactiveAt,
    "2027-02-04T08:00:00.000Z",
  );
  assert.match(subscription.autoInactiveReason, /超过 90 天/);
  assert.equal(subscription.autoCompletedAt, undefined);
  assert.equal(subscription.seriesStatus, "inactive");
  assert.equal(subscription.seriesStatusOverride, null);
  assert.equal(subscription.completedAt, null);

  const sameDay = await harness.service.checkSubscription(subscriptionId, {
    notify: false,
    discover: false,
    trigger: "cron",
  });
  assert.equal(sameDay.skipped, "inactive");
  assert.equal(sameDay.inactiveRechecked, false);
  assert.deepEqual(calls, [ROOT_ID]);

  now = new Date("2027-02-05T08:00:00.000Z");
  const nextDay = await harness.service.checkSubscription(subscriptionId, {
    notify: false,
    discover: false,
    trigger: "cron",
  });
  assert.equal(nextDay.skipped, undefined);
  assert.equal(nextDay.inactiveRechecked, true);
  assert.deepEqual(calls, [ROOT_ID, ROOT_ID]);
});

test("recent content prevents automatic inactivity", async () => {
  const harness = await createHarness({
    rootDetail: detail({
      firstVisibleTime: "2026-08-01T00:00:00.000Z",
    }),
  });

  const result = await harness.service.addSubscription(ROOT_ID);
  const checked = await harness.service.checkSubscription(
    result.subscriptionId,
    { notify: false, discover: false },
  );
  assert.equal(checked.autoInactive, false);
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].autoInactiveAt, null);
  assert.notEqual(state.subscriptions[0].seriesStatus, "inactive");
});

test("manual updating and unknown statuses still become inactive when stale", async () => {
  for (const status of ["updating", "unknown"]) {
    let now = new Date("2026-10-27T08:00:00.000Z");
    const harness = await createHarness({
      rootDetail: detail({
        firstVisibleTime: "2026-07-01T00:00:00.000Z",
      }),
      now: () => now,
    });
    const added = await harness.service.addSubscription(ROOT_ID);
    await harness.service.updateSubscriptionStatus(
      added.subscriptionId,
      status,
    );
    let dashboard = await harness.service.getDashboard();
    assert.equal(dashboard.subscriptions[0].seriesStatus, status);

    now = new Date("2026-10-28T08:00:00.000Z");
    const result = await harness.service.checkSubscription(
      added.subscriptionId,
      { notify: false, discover: false },
    );
    assert.equal(result.autoInactive, true, status);

    const state = await harness.store.read();
    assert.equal(
      state.subscriptions[0].autoInactiveAt,
      now.toISOString(),
    );
    assert.equal(state.subscriptions[0].seriesStatusOverride, null);
    dashboard = await harness.service.getDashboard();
    assert.equal(dashboard.subscriptions[0].seriesStatus, "inactive");
  }
});

test("manual check reopens an inactive series when a new episode is found", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({
    rootDetail: detail({
      firstVisibleTime: "2026-07-01T00:00:00.000Z",
    }),
    now: () => now,
  });
  const added = await harness.service.addSubscription(ROOT_ID);
  now = new Date("2027-02-04T08:00:00.000Z");
  const inactive = await harness.service.checkSubscription(
    added.subscriptionId,
    { notify: false, discover: false },
  );
  assert.equal(inactive.autoInactive, true);

  const calls = [];
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async (seriesId) => {
    calls.push(seriesId);
    return healthyFetchDetail(seriesId);
  };

  const unchanged = await harness.service.checkSubscription(
    added.subscriptionId,
    { notify: false, discover: false },
  );
  assert.equal(unchanged.inactiveRechecked, true);
  assert.equal(unchanged.reactivatedFromInactive, false);
  let state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "inactive");
  assert.equal(state.subscriptions[0].seriesStatusOverride, null);
  assert.deepEqual(calls, [ROOT_ID]);

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  const refreshed = await harness.service.checkSubscription(
    added.subscriptionId,
    { notify: false, discover: false },
  );
  assert.equal(refreshed.skipped, undefined);
  assert.equal(refreshed.reactivatedFromInactive, true);
  assert.deepEqual(calls, [ROOT_ID, ROOT_ID]);

  state = await harness.store.read();
  const subscription = state.subscriptions[0];
  assert.equal(subscription.seriesStatus, "updating");
  assert.equal(subscription.seriesStatusOverride, null);
  assert.equal(subscription.completedAt, null);
  assert.equal(subscription.seriesCompletionVerifiedAt, null);
  assert.equal(subscription.autoInactiveAt, null);
  assert.equal(subscription.autoInactiveReason, null);
  assert.equal(subscription.inactiveStatusCheckedAt, null);
  assert.equal(subscription.hasUnreadUpdate, true);
  assert.equal(
    state.events.filter((event) => event.type === "episode").length,
    1,
  );
});

test("a newly unpublished season clears a previously announced completion", async () => {
  let album = {
    publishedSeriesIds: [ROOT_ID],
    unpublishedSeriesIds: [],
    unpublishedSeasonCount: 0,
    declaredSeasonCount: 1,
    itemCount: 1,
  };
  const harness = await createHarness({
    fetchAlbumSeries: async () => album,
  });
  await addAndEnableBark(harness);
  harness.details.set(
    ROOT_ID,
    detail({
      title: "测试短剧第一季完结篇",
      episodeCount: 12,
      status: "completed",
    }),
  );
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  let state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "completed");
  assert.ok(state.subscriptions[0].completedAt);

  await harness.service.updateSubscriptionStatus(
    subscriptionId,
    "updating",
  );
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async () => {
    throw new Error("临时网络失败");
  };
  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "updating");
  assert.ok(state.subscriptions[0].completedAt);

  harness.service.fetchDetail = healthyFetchDetail;
  album = {
    publishedSeriesIds: [ROOT_ID],
    unpublishedSeriesIds: [SHELL_ID],
    unpublishedSeasonCount: 1,
    declaredSeasonCount: 2,
    itemCount: 2,
  };
  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  state = await harness.store.read();
  const subscription = state.subscriptions[0];
  assert.equal(subscription.seriesStatus, "updating");
  assert.match(subscription.seriesStatusReason, /手动标记为更新中/);
  assert.equal(subscription.seriesCompletionAnnounced, false);
  assert.equal(subscription.completedAt, null);
  assert.equal(subscription.seriesCompletionVerifiedAt, null);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    1,
  );
});

test("an unpublished season shell marks the series as incomplete", async () => {
  const harness = await createHarness({
    fetchAlbumSeries: async () => ({
      publishedSeriesIds: [ROOT_ID],
      unpublishedSeriesIds: [SHELL_ID],
      unpublishedSeasonCount: 1,
      declaredSeasonCount: 2,
      itemCount: 2,
    }),
  });
  await harness.service.addSubscription(ROOT_ID);
  harness.details.set(
    ROOT_ID,
    detail({ episodeCount: 12, status: "completed" }),
  );

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();
  const subscription = state.subscriptions[0];
  assert.equal(subscription.seriesStatus, "updating");
  assert.match(subscription.seriesStatusReason, /未发布季度/);
  assert.equal(subscription.discovery.unpublishedSeasonCount, 1);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    0,
  );
});

test("missing official seasons prevent series completion", async () => {
  const harness = await createHarness({
    albumSeriesIds: [ROOT_ID, NEXT_ID],
  });
  await harness.service.addSubscription(ROOT_ID);
  harness.details.set(
    ROOT_ID,
    detail({ episodeCount: 12, status: "completed" }),
  );

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();
  assert.match(result.discoveryError, /未能全部确认/);
  assert.equal(state.subscriptions[0].seriesStatus, "unknown");
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    0,
  );
});

test("extra locally confirmed seasons prevent series completion", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 8,
      status: "completed",
    }),
    albumSeriesIds: [ROOT_ID],
  });
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  await harness.service.addSeason(subscriptionId, NEXT_ID);
  harness.details.set(
    ROOT_ID,
    detail({ episodeCount: 12, status: "completed" }),
  );

  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 2);
  assert.equal(state.subscriptions[0].seriesStatus, "unknown");
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    0,
  );
});

test("official album discovery failure prevents series completion", async () => {
  const harness = await createHarness({
    fetchAlbumSeries: async () => {
      throw new Error("多季列表不可用");
    },
  });
  await harness.service.addSubscription(ROOT_ID);
  harness.details.set(
    ROOT_ID,
    detail({ episodeCount: 12, status: "completed" }),
  );

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "unknown");
  assert.match(state.subscriptions[0].seriesStatusReason, /核验失败/);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    0,
  );
});

test("a newly discovered season starts a new completion cycle", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const albumSeriesIds = [ROOT_ID];
  const harness = await createHarness({
    albumSeriesIds,
    now: () => now,
  });
  await addAndEnableBark(harness);
  harness.details.set(
    ROOT_ID,
    detail({
      title: "测试短剧第一季完结篇",
      episodeCount: 12,
      status: "completed",
    }),
  );
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  let state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "completed");

  await harness.service.updateSubscriptionStatus(
    subscriptionId,
    "updating",
  );
  albumSeriesIds.push(NEXT_ID);
  harness.details.set(
    NEXT_ID,
    detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 3,
      status: "updating",
      firstVisibleTime: "2026-10-28T08:00:00.000Z",
    }),
  );
  now = new Date("2026-10-28T08:00:00.000Z");
  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "updating");
  assert.equal(state.subscriptions[0].seriesCompletionAnnounced, false);
  assert.equal(state.subscriptions[0].completedAt, null);
  assert.equal(state.subscriptions[0].seriesCompletionVerifiedAt, null);
  await harness.service.updateSubscriptionStatus(subscriptionId, "auto");
  assert.equal(
    (await harness.store.read()).subscriptions[0].seriesStatusOverride,
    null,
  );

  harness.details.set(
    NEXT_ID,
    detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 8,
      status: "completed",
      firstVisibleTime: "2026-10-28T08:00:00.000Z",
    }),
  );
  now = new Date("2026-10-29T08:00:00.000Z");
  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "unknown");
  assert.match(state.subscriptions[0].seriesStatusReason, /完结篇/);
  assert.equal(state.subscriptions[0].seriesCompletionAnnounced, false);
  assert.equal(state.subscriptions[0].completedAt, null);
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    1,
  );

  harness.details.set(
    NEXT_ID,
    detail({
      seriesId: NEXT_ID,
      title: "测试短剧第二季完结篇",
      episodeCount: 8,
      status: "completed",
      firstVisibleTime: "2026-10-28T08:00:00.000Z",
    }),
  );
  now = new Date("2026-10-30T08:00:00.000Z");
  await harness.service.checkSubscription(subscriptionId, {
    discover: true,
    forceDiscovery: true,
  });
  state = await harness.store.read();
  assert.equal(state.subscriptions[0].seriesStatus, "completed");
  assert.equal(
    state.events.filter((event) => event.type === "completed").length,
    2,
  );
  assert.equal(
    harness.notifications.filter(
      (item) => item.message.title === "短剧系列已完结",
    ).length,
    2,
  );
});

test("adding a later season still displays the first season title", async () => {
  const firstDetail = detail({
    title: "万妖图录传第一季",
    status: "completed",
  });
  const sixthDetail = detail({
    seriesId: NEXT_ID,
    title: "万妖图录传第六季",
    status: "updating",
    firstVisibleTime: "2026-10-20T08:00:00.000Z",
  });
  const harness = await createHarness({
    rootDetail: firstDetail,
    albumSeriesIds: [ROOT_ID, NEXT_ID],
  });
  harness.details.set(NEXT_ID, sixthDetail);

  const result = await harness.service.addSubscription(NEXT_ID);
  const state = await harness.store.read();
  const subscription = state.subscriptions[0];
  assert.equal(result.title, "万妖图录传第一季");
  assert.equal(subscription.displayTitle, "万妖图录传第一季");
  assert.equal(subscription.firstSeasonId, ROOT_ID);
  assert.equal(subscription.seasons[0].title, "万妖图录传第六季");
});

test("a manual check combines multiple season discoveries into one detailed notification", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧第二季",
      episodeCount: 6,
      firstVisibleTime: "2026-10-17T16:04:00.000Z",
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID, OTHER_ID],
    recommendFromRoot: false,
  });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "测试短剧第三季",
      episodeCount: 8,
      firstVisibleTime: "2026-10-18T16:04:00.000Z",
    }),
  );
  await addAndEnableBark(harness);

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  assert.equal(result.discoveredSeasons, 2);
  assert.equal(harness.notifications.length, 1);
  const message = harness.notifications[0].message;
  assert.equal(message.title, "《测试短剧》更新详情");
  assert.match(message.body, /检查时间：2026-10-27 16:00/);
  assert.match(message.body, /发现新季：《测试短剧第二季》/);
  assert.match(message.body, /季上线：2026-10-18 00:04/);
  assert.match(message.body, /发现新季：《测试短剧第三季》/);
  assert.match(message.body, /季上线：2026-10-19 00:04/);
  assert.match(message.body, /检测到新季：2026-10-27 16:00/);
  assert.match(message.body, /当前共收录 3 季/);
});

test("a recommendation is added only when series_group_id matches", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
  });
  await addAndEnableBark(harness);

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  assert.equal(result.discoveredSeasons, 1);
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 2);
  assert.equal(
    state.subscriptions[0].seasons.some(
      (season) => season.seriesId === NEXT_ID,
    ),
    true,
  );
  const seasonEvent = state.events.find((event) => event.type === "season");
  assert.ok(seasonEvent);
  assert.equal(seasonEvent.notified, true);
});

test("a manually checked new season sends one detailed notification", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID],
    recommendFromRoot: false,
  });
  await addAndEnableBark(harness);
  await harness.service.updateSettings({
    episodeNotificationWindowMinutes: 60,
  });

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();
  const seasonEvent = state.events.find((event) => event.type === "season");
  assert.equal(seasonEvent.notified, true);
  assert.equal(seasonEvent.notificationDueAt, null);
  assert.equal(state.pendingNotifications.length, 0);
  assert.equal(
    harness.notifications.filter(
      (item) => item.message.title === "发现同系列新季",
    ).length,
    1,
  );
});

test("same title with a different official group is rejected", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧",
      groupId: GROUP_B,
      episodeCount: 6,
    }),
  });
  await addAndEnableBark(harness);

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 1);
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].matchesGroup,
    false,
  );
  assert.equal(
    state.events.filter((event) => event.type === "season").length,
    0,
  );
});

test("album candidates are added only after the exact group check", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID],
    recommendFromRoot: false,
  });
  await addAndEnableBark(harness);

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  assert.equal(result.discoveredSeasons, 1);
  assert.equal(result.discoveryError, null);
  assert.deepEqual(harness.albumCalls, [ROOT_ID]);

  const state = await harness.store.read();
  const addedSeason = state.subscriptions[0].seasons.find(
    (season) => season.seriesId === NEXT_ID,
  );
  assert.ok(addedSeason);
  assert.equal(addedSeason.source, "album");
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].matchesGroup,
    true,
  );
});

test("manual checks retry a recently failed album candidate", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID],
    recommendFromRoot: false,
  });
  await harness.service.addSubscription(ROOT_ID);
  await harness.store.mutate((state) => {
    state.subscriptions[0].discovery.candidates[NEXT_ID] = {
      checkedAt: "2026-10-27T08:00:00.000Z",
      matchesGroup: false,
      lastError: "临时网络失败",
    };
  });

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();

  assert.equal(result.discoveredSeasons, 1);
  assert.equal(result.discoveryError, null);
  assert.equal(state.subscriptions[0].seasons.length, 2);
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].matchesGroup,
    true,
  );
});

test("a temporary album candidate failure is retried by scheduled discovery", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID],
    recommendFromRoot: false,
    now: () => now,
    candidateRecheckMs: 24 * 60 * 60 * 1000,
  });
  await harness.service.addSubscription(ROOT_ID);
  const healthyFetchDetail = harness.service.fetchDetail;
  let failedOnce = false;
  harness.service.fetchDetail = async (seriesId) => {
    if (seriesId === NEXT_ID && !failedOnce) {
      failedOnce = true;
      throw new Error("临时网络失败");
    }
    return healthyFetchDetail(seriesId);
  };

  let result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  let state = await harness.store.read();
  assert.equal(result.discoveredSeasons, 0);
  assert.match(result.discoveryError, /1 个已发布季度待确认/);
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].matchesGroup,
    false,
  );
  assert.match(
    state.subscriptions[0].discovery.candidates[NEXT_ID].lastError,
    /临时网络失败/,
  );

  now = new Date("2026-10-27T08:01:01.000Z");
  result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  state = await harness.store.read();
  assert.equal(result.discoveredSeasons, 1);
  assert.equal(result.discoveryError, null);
  assert.equal(state.subscriptions[0].seasons.length, 2);
});

test("scheduled discovery keeps recently checked group mismatches cached", async () => {
  let now = new Date("2026-10-27T08:00:00.000Z");
  let nextChecks = 0;
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      groupId: GROUP_B,
      episodeCount: 6,
    }),
    recommendFromRoot: true,
    now: () => now,
    candidateRecheckMs: 24 * 60 * 60 * 1000,
  });
  await harness.service.addSubscription(ROOT_ID);
  const healthyFetchDetail = harness.service.fetchDetail;
  harness.service.fetchDetail = async (seriesId) => {
    if (seriesId === NEXT_ID) {
      nextChecks += 1;
    }
    return healthyFetchDetail(seriesId);
  };

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  assert.equal(nextChecks, 1);
  let state = await harness.store.read();
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].matchesGroup,
    false,
  );
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].lastError,
    null,
  );

  now = new Date("2026-10-27T08:01:01.000Z");
  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  assert.equal(nextChecks, 1);
});

test("a series with more than 24 published seasons can be fully verified", async () => {
  const additionalIds = Array.from(
    { length: 26 },
    (_, index) => String(7_700_000_000_000_000_000n + BigInt(index)),
  );
  const publishedSeriesIds = [ROOT_ID, ...additionalIds];
  const harness = await createHarness({
    albumSeriesIds: publishedSeriesIds,
  });
  for (const [index, seriesId] of additionalIds.entries()) {
    harness.details.set(
      seriesId,
      detail({
        seriesId,
        title: `测试短剧第${index + 2}季`,
        episodeCount: 1,
        firstVisibleTime: `2026-10-${String((index % 20) + 1).padStart(
          2,
          "0",
        )}T08:00:00.000Z`,
      }),
    );
  }
  await harness.service.addSubscription(ROOT_ID);

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  const state = await harness.store.read();
  const subscription = state.subscriptions[0];

  assert.equal(result.discoveredSeasons, 26);
  assert.equal(result.discoveryError, null);
  assert.equal(subscription.seasons.length, 27);
  assert.equal(subscription.discovery.confirmedSeriesIds.length, 27);
  assert.equal(subscription.discovery.lastDiscoveryIssue, null);
});

test("official album candidates are checked before recommendation candidates reach the limit", async () => {
  const recommendations = Array.from({ length: 24 }, (_, index) => ({
    seriesId: String(7_700_000_000_000_000_000n + BigInt(index)),
    title: `无关推荐短剧${index + 1}`,
    coverUrl: "https://example.com/recommendation.jpg",
    episodeCount: 1,
  }));
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID],
    recommendFromRoot: false,
    rootRecommendations: recommendations,
  });
  await addAndEnableBark(harness);

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  assert.equal(result.discoveredSeasons, 1);

  const state = await harness.store.read();
  const addedSeason = state.subscriptions[0].seasons.find(
    (season) => season.seriesId === NEXT_ID,
  );
  assert.ok(addedSeason);
  assert.equal(addedSeason.source, "album");
});

test("album candidates with another group are rejected", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      groupId: GROUP_B,
      episodeCount: 6,
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID],
    recommendFromRoot: false,
  });
  await addAndEnableBark(harness);

  await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 1);
  assert.equal(
    state.subscriptions[0].discovery.candidates[NEXT_ID].matchesGroup,
    false,
  );
});

test("album discovery can add multiple seasons without duplicates", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
      firstVisibleTime: "2026-10-17T16:04:00.000Z",
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID, OTHER_ID, NEXT_ID],
    recommendFromRoot: false,
  });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "测试短剧 第三季",
      episodeCount: 8,
      firstVisibleTime: "2026-10-18T16:04:00.000Z",
    }),
  );
  await addAndEnableBark(harness);

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  assert.equal(result.discoveredSeasons, 2);
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 3);
  assert.deepEqual(
    state.subscriptions[0].seasons
      .filter((season) => season.source === "album")
      .map((season) => season.seriesId),
    [NEXT_ID, OTHER_ID],
  );

  const dashboard = await harness.service.getDashboard();
  assert.equal(dashboard.subscriptions[0].latestSeasonId, OTHER_ID);
  assert.equal(
    dashboard.subscriptions[0].seasons.find((season) => season.isLatest)
      .seriesId,
    OTHER_ID,
  );
});

test("a batch check sends one summary with the latest change for every series", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const harness = await createHarness({ now: () => now });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 4,
    }),
  );
  await addAndEnableBark(harness);
  await harness.service.addSubscription(OTHER_ID);
  const state = await harness.store.read();
  const rootSubscriptionId = state.subscriptions.find(
    (subscription) => subscription.primarySeriesId === ROOT_ID,
  ).id;
  const otherSubscriptionId = state.subscriptions.find(
    (subscription) => subscription.primarySeriesId === OTHER_ID,
  ).id;

  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 7,
    }),
  );
  await harness.service.checkSubscriptions(
    [rootSubscriptionId, otherSubscriptionId],
    { discover: false },
  );

  assert.equal(harness.notifications.length, 1);
  const message = harness.notifications[0].message;
  assert.equal(message.title, "短剧助手 · 2 个系列有更新");
  assert.match(message.body, /检查时间：2026-10-27 16:05/);
  assert.match(message.body, /季上线：2026-10-17 00:04/);
  assert.match(message.body, /检测到更新：2026-10-27 16:05/);
  assert.match(message.body, /《测试短剧》 · 第 15 集（新增 3 集）/);
  assert.match(message.body, /《另一部短剧》 · 第 7 集（新增 3 集）/);
  assert.equal(
    message.body
      .split("\n")
      .filter((line) => /^\d+\. /u.test(line)).length,
    2,
  );
});

test("batch discovery aligns series that share the same new-season release", async () => {
  let now = new Date("2026-10-27T08:05:00.000Z");
  const thirdId = "7694653385668037661";
  const albumIdsBySeries = new Map([
    [ROOT_ID, [ROOT_ID]],
    [OTHER_ID, [OTHER_ID]],
  ]);
  const albumCalls = [];
  const harness = await createHarness({
    now: () => now,
    discoveryIntervalMs: 6 * 60 * 60_000,
    fetchAlbumSeries: async (seriesId) => {
      albumCalls.push(seriesId);
      return albumIdsBySeries.get(seriesId) || [];
    },
  });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "另一部短剧",
      groupId: GROUP_B,
      episodeCount: 4,
    }),
  );
  await addAndEnableBark(harness);
  await harness.service.addSubscription(OTHER_ID);

  let state = await harness.store.read();
  const rootSubscriptionId = state.subscriptions.find(
    (subscription) => subscription.primarySeriesId === ROOT_ID,
  ).id;
  const otherSubscriptionId = state.subscriptions.find(
    (subscription) => subscription.primarySeriesId === OTHER_ID,
  ).id;

  await harness.store.mutate((currentState) => {
    const rootSubscription = currentState.subscriptions.find(
      (subscription) => subscription.id === rootSubscriptionId,
    );
    const otherSubscription = currentState.subscriptions.find(
      (subscription) => subscription.id === otherSubscriptionId,
    );
    rootSubscription.discovery.lastRunAt = "2026-10-27T01:59:00.000Z";
    otherSubscription.discovery.lastRunAt = "2026-10-27T07:59:00.000Z";
  });

  albumIdsBySeries.set(ROOT_ID, [ROOT_ID, NEXT_ID]);
  albumIdsBySeries.set(OTHER_ID, [OTHER_ID, thirdId]);
  harness.details.set(
    NEXT_ID,
    detail({
      seriesId: NEXT_ID,
      title: "测试短剧第二季",
      groupId: GROUP_A,
      episodeCount: 6,
      firstVisibleTime: "2026-10-27T00:04:00.000Z",
    }),
  );
  harness.details.set(
    thirdId,
    detail({
      seriesId: thirdId,
      title: "另一部短剧第二季",
      groupId: GROUP_B,
      episodeCount: 8,
      firstVisibleTime: "2026-10-27T00:04:00.000Z",
    }),
  );

  const result = await harness.service.checkSubscriptions(
    [rootSubscriptionId, otherSubscriptionId],
    { discover: true },
  );

  assert.equal(result.discoveredSeasons, 2);
  assert.deepEqual(albumCalls.sort(), [OTHER_ID, ROOT_ID].sort());
  assert.equal(harness.notifications.length, 1);
  assert.match(
    harness.notifications[0].message.body,
    /《测试短剧》第二季 · 新季 6 集/,
  );
  assert.match(
    harness.notifications[0].message.body,
    /《另一部短剧》第二季 · 新季 8 集/,
  );

  state = await harness.store.read();
  assert.deepEqual(
    state.subscriptions
      .filter((subscription) =>
        [rootSubscriptionId, otherSubscriptionId].includes(subscription.id),
      )
      .map((subscription) => subscription.discovery.lastRunAt)
      .sort(),
    [now.toISOString(), now.toISOString()],
  );
});

test("a batch check shows only the latest discovered season in one series", async () => {
  const harness = await createHarness({
    rootDetail: detail({ title: "烛九阴第一季" }),
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "烛九阴第二季",
      episodeCount: 6,
      firstVisibleTime: "2026-10-17T16:04:00.000Z",
    }),
    albumSeriesIds: [ROOT_ID, NEXT_ID, OTHER_ID],
    recommendFromRoot: false,
  });
  harness.details.set(
    OTHER_ID,
    detail({
      seriesId: OTHER_ID,
      title: "烛九阴第八季",
      episodeCount: 149,
      firstVisibleTime: "2026-10-20T16:04:00.000Z",
    }),
  );
  await addAndEnableBark(harness);

  await harness.service.checkSubscriptions(
    [(await harness.store.read()).subscriptions[0].id],
    { discover: true, forceDiscovery: true },
  );

  assert.equal(harness.notifications.length, 1);
  const message = harness.notifications[0].message;
  assert.equal(message.title, "短剧助手 · 1 个系列有更新");
  assert.match(message.body, /《烛九阴》第八季 · 新季 149 集/);
  assert.match(message.body, /季上线：2026-10-21 00:04/);
  assert.match(message.body, /检测到新季：2026-10-27 16:00/);
  assert.doesNotMatch(message.body, /烛九阴第二季/);
  assert.doesNotMatch(message.body, /烛九阴第八季 · 新季/);
});

test("album discovery failure does not block normal episode checks", async () => {
  const harness = await createHarness({
    fetchAlbumSeries: async () => {
      const error = new Error("红果多季列表超时。");
      error.code = "ALBUM_REQUEST_TIMEOUT";
      throw error;
    },
  });
  await addAndEnableBark(harness);
  harness.details.set(ROOT_ID, detail({ episodeCount: 15 }));

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true },
  );
  assert.equal(result.errors, 0);
  assert.equal(result.updatedSeasons, 1);
  assert.match(result.discoveryError, /多季列表超时/);

  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons[0].highWaterEpisodeCount, 15);
  assert.equal(state.subscriptions[0].discovery.lastRunAt, null);
});

test("batch checks report incomplete album verification", async () => {
  const harness = await createHarness({
    fetchAlbumSeries: async () => {
      const error = new Error("红果多季列表超时。");
      error.code = "ALBUM_REQUEST_TIMEOUT";
      throw error;
    },
  });
  const subscriptionId = (await harness.service.addSubscription(ROOT_ID))
    .subscriptionId;

  const result = await harness.service.checkSubscriptions(
    [subscriptionId],
    {
      discover: true,
      forceDiscovery: true,
      notify: false,
    },
  );

  assert.equal(result.errors, 0);
  assert.equal(result.failedSubscriptions, 1);
  assert.equal(result.discoveryFailures, 1);
  assert.match(
    result.results[0].result.discoveryError,
    /多季列表超时/,
  );
});

test("manual checks can force one discovery despite the interval cache", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: NEXT_ID,
      title: "测试短剧 第二季",
      episodeCount: 6,
    }),
    albumSeriesIds: [NEXT_ID],
    recommendFromRoot: false,
  });
  await addAndEnableBark(harness);
  await harness.store.mutate((state) => {
    state.subscriptions[0].discovery.lastRunAt =
      "2026-10-27T07:59:30.000Z";
  });

  const result = await harness.service.checkSubscription(
    (await harness.store.read()).subscriptions[0].id,
    { discover: true, forceDiscovery: true },
  );
  assert.equal(result.discoveredSeasons, 1);
  assert.deepEqual(harness.albumCalls, [ROOT_ID]);
});

test("manual season addition also enforces the exact group ID", async () => {
  const harness = await createHarness({
    nextDetail: detail({
      seriesId: OTHER_ID,
      title: "同名但不同组",
      groupId: GROUP_B,
    }),
  });
  await harness.service.addSubscription(ROOT_ID);
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  await assert.rejects(
    harness.service.addSeason(subscriptionId, OTHER_ID),
    (error) => error.code === "SERIES_GROUP_MISMATCH",
  );
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].seasons.length, 1);
});
