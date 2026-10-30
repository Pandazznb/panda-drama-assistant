import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  JsonStateStore,
  SqliteStateStore,
  createDefaultState,
  databaseFileForStateFile,
  normalizeState,
} from "../src/store.js";

async function temporaryStatePath() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hongguo-store-"));
  return path.join(directory, "state.json");
}

test("store creates a private SQLite database with defaults", async () => {
  const filePath = await temporaryStatePath();
  const store = new JsonStateStore(filePath);
  try {
    const state = await store.init();
    assert.deepEqual(state, createDefaultState());
    assert.equal(store.databaseFile, databaseFileForStateFile(filePath));
    const stat = await fs.stat(store.databaseFile);
    assert.equal(stat.mode & 0o777, 0o600);
    const header = (await fs.readFile(store.databaseFile))
      .subarray(0, 16)
      .toString("utf8");
    assert.equal(header, "SQLite format 3\u0000");
    assert.equal(
      store.db.prepare("PRAGMA journal_mode").get().journal_mode,
      "wal",
    );
  } finally {
    await store.close();
  }
});

test("store backs up corrupt JSON and starts fresh", async () => {
  const filePath = await temporaryStatePath();
  await fs.writeFile(filePath, "{broken", "utf8");
  const store = new JsonStateStore(filePath);
  try {
    const state = await store.init();
    assert.deepEqual(state, createDefaultState());
    const files = await fs.readdir(path.dirname(filePath));
    assert.ok(files.some((file) => file.startsWith("state.json.corrupt-")));
  } finally {
    await store.close();
  }
});

test("mutations are serialized and survive reopening SQLite", async () => {
  const filePath = await temporaryStatePath();
  const store = new JsonStateStore(filePath);
  await store.init();
  const cronExpressions = Array.from(
    { length: 8 },
    (_, index) => `*/${10 + index} * * * *`,
  );
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      store.mutate((state) => {
        state.settings.checkCron = cronExpressions[index];
      }),
    ),
  );
  const state = await store.read();
  assert.equal(state.settings.checkCron, cronExpressions[7]);
  await store.close();

  const restartedStore = new JsonStateStore(filePath);
  try {
    const restartedState = await restartedStore.init();
    assert.equal(
      restartedState.settings.checkCron,
      cronExpressions[7],
    );
  } finally {
    await restartedStore.close();
  }
});

test("two store instances preserve concurrent read-modify-write updates", async () => {
  const filePath = await temporaryStatePath();
  const first = new SqliteStateStore(databaseFileForStateFile(filePath), {
    legacyStateFile: filePath,
  });
  const second = new SqliteStateStore(databaseFileForStateFile(filePath), {
    legacyStateFile: filePath,
  });

  try {
    await first.init();
    await second.init();
    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        (index % 2 === 0 ? first : second).mutate((state) => {
          state.settings.staleCompletionDays += 1;
        }),
      ),
    );
    assert.equal(
      (await first.read()).settings.staleCompletionDays,
      130,
    );
    assert.equal(
      (await second.read()).settings.staleCompletionDays,
      130,
    );
  } finally {
    await first.close();
    await second.close();
  }
});

test("legacy JSON is imported once and retained for rollback", async () => {
  const filePath = await temporaryStatePath();
  const legacyState = createDefaultState();
  legacyState.settings.staleCompletionDays = 123;
  await fs.writeFile(filePath, JSON.stringify(legacyState), "utf8");

  const store = new JsonStateStore(filePath);
  try {
    await store.init();
    assert.equal(
      (await store.read()).settings.staleCompletionDays,
      123,
    );
    assert.equal(
      store.readMetadata("legacy_imported_from"),
      filePath,
    );
    const legacyStat = await fs.stat(filePath);
    assert.equal(legacyStat.mode & 0o777, 0o600);
  } finally {
    await store.close();
  }

  legacyState.settings.staleCompletionDays = 321;
  await fs.writeFile(filePath, JSON.stringify(legacyState), "utf8");
  const restartedStore = new JsonStateStore(filePath);
  try {
    await restartedStore.init();
    assert.equal(
      (await restartedStore.read()).settings.staleCompletionDays,
      123,
    );
  } finally {
    await restartedStore.close();
  }
});

test("normalizeState keeps only valid event records and bounds settings", () => {
  const normalized = normalizeState({
    settings: { intervalMinutes: 20000, barkKey: "abc_DEF" },
    subscriptions: [],
    events: [{ id: "evt_1", type: "episode", message: "更新" }],
  });
  assert.equal(normalized.settings.checkCron, "*/30 * * * *");
  assert.deepEqual(normalized.settings.notifications.bark, {
    enabled: true,
    key: "abc_DEF",
  });
  assert.equal(normalized.events.length, 1);
  assert.equal(normalized.events[0].notified, false);
});

test("normalizeState validates Cron and migrates representable legacy intervals", () => {
  assert.equal(
    normalizeState({
      settings: { checkCron: "  0   */6 * * * " },
    }).settings.checkCron,
    "0 */6 * * *",
  );
  assert.equal(
    normalizeState({
      settings: { checkCron: "60 * * * *" },
    }).settings.checkCron,
    "*/30 * * * *",
  );
  assert.equal(
    normalizeState({ settings: { intervalMinutes: 60 } }).settings
      .checkCron,
    "0 * * * *",
  );
  assert.equal(
    normalizeState({ settings: { intervalMinutes: 10_080 } }).settings
      .checkCron,
    "0 0 * * 0",
  );
  assert.equal(
    normalizeState({ settings: { intervalMinutes: 45 } }).settings
      .checkCron,
    "*/30 * * * *",
  );
});

test("normalizeState bounds the stale completion window", () => {
  assert.equal(
    normalizeState({}).settings.staleCompletionDays,
    90,
  );
  assert.equal(
    normalizeState({
      settings: { staleCompletionDays: 1 },
    }).settings.staleCompletionDays,
    1,
  );
  assert.equal(
    normalizeState({
      settings: { staleCompletionDays: 3650 },
    }).settings.staleCompletionDays,
    3650,
  );
  assert.equal(
    normalizeState({
      settings: { staleCompletionDays: 0 },
    }).settings.staleCompletionDays,
    1,
  );
  assert.equal(
    normalizeState({
      settings: { staleCompletionDays: 3651 },
    }).settings.staleCompletionDays,
    3650,
  );
});

test("normalizeState exposes automatic completion as completed and clears overrides", () => {
  const seriesId = "7694653385668037657";
  const normalized = normalizeState({
    subscriptions: [
      {
        id: "sub_auto_completed",
        primarySeriesId: seriesId,
        seriesGroupId: "7698938199183215640",
        title: "测试短剧",
        seriesStatusOverride: "updating",
        seriesStatusOverrideAt: "2026-10-27T08:00:00.000Z",
        autoCompletedAt: "2027-02-04T08:00:00.000Z",
        autoCompletionReason:
          "超过 90 天未检测到新季或新集，已自动标记为完结。",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7698938199183215640",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 12,
          },
        ],
      },
    ],
  });
  const subscription = normalized.subscriptions[0];
  assert.equal(subscription.seriesStatus, "completed");
  assert.equal(subscription.seriesStatusOverride, null);
  assert.equal(
    subscription.autoCompletedAt,
    "2027-02-04T08:00:00.000Z",
  );
  assert.match(subscription.seriesStatusReason, /超过 90 天/);
});

test("normalizeState preserves and derives the next scheduled check", () => {
  const explicit = normalizeState({
    version: 10,
    settings: {
      checkCron: "0 * * * *",
      lastCheckAt: "2026-10-27T08:00:00.000Z",
      nextCheckAt: "2026-10-27T09:15:00.000Z",
    },
  });
  assert.equal(
    explicit.settings.nextCheckAt,
    "2026-10-27T09:15:00.000Z",
  );

  const legacy = normalizeState({
    version: 9,
    settings: {
      intervalMinutes: 60,
      lastCheckAt: "2026-10-27T08:00:00.000Z",
      nextCheckAt: "2026-10-27T09:15:00.000Z",
    },
  });
  assert.equal(legacy.settings.checkCron, "0 * * * *");
  assert.equal(
    legacy.settings.nextCheckAt,
    "2026-10-27T09:00:00.000Z",
  );
});

test("normalizeState keeps only supported notification aggregation windows", () => {
  assert.equal(
    normalizeState({
      settings: { episodeNotificationWindowMinutes: 30 },
    }).settings.episodeNotificationWindowMinutes,
    0,
  );
  assert.equal(
    normalizeState({
      settings: { episodeNotificationWindowMinutes: 60 },
    }).settings.episodeNotificationWindowMinutes,
    60,
  );
  assert.equal(
    normalizeState({
      settings: { episodeNotificationWindowMinutes: "1440" },
    }).settings.episodeNotificationWindowMinutes,
    1440,
  );
});

test("normalizeState bounds discovery reminder settings", () => {
  const normalized = normalizeState({
    settings: {
      discoveryReminderDurationMinutes: 50_000,
      discoveryReminderCron: "  0   */4 * * * ",
    },
  });
  assert.equal(normalized.settings.discoveryReminderDurationMinutes, 43_200);
  assert.equal(normalized.settings.discoveryReminderCron, "0 */4 * * *");

  const invalid = normalizeState({
    settings: {
      discoveryReminderDurationMinutes: -10,
      discoveryReminderCron: "bad cron",
    },
  });
  assert.equal(invalid.settings.discoveryReminderDurationMinutes, 0);
  assert.equal(invalid.settings.discoveryReminderCron, "0 */6 * * *");
});

test("normalizeState keeps one valid pending notification per season", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    version: 3,
    subscriptions: [
      {
        id: "sub_pending",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
    ],
    pendingNotifications: [
      {
        id: "notify_old",
        subscriptionId: "sub_pending",
        seasonId: seriesId,
        seasonTitle: "测试短剧第一季",
        baselineEpisodeCount: 12,
        episodeCount: 15,
        firstObservedAt: "2026-10-27T08:00:00.000Z",
        lastObservedAt: "2026-10-27T08:05:00.000Z",
        dueAt: "2026-10-27T09:00:00.000Z",
        eventIds: ["evt_1"],
      },
      {
        id: "notify_latest",
        subscriptionId: "sub_pending",
        seasonId: seriesId,
        seasonTitle: "测试短剧第一季",
        baselineEpisodeCount: 12,
        episodeCount: 18,
        firstObservedAt: "2026-10-27T08:00:00.000Z",
        lastObservedAt: "2026-10-27T08:20:00.000Z",
        dueAt: "2026-10-27T09:00:00.000Z",
        eventIds: ["evt_1", "evt_2"],
      },
      {
        id: "notify_invalid",
        subscriptionId: "sub_pending",
        seasonId: seriesId,
        baselineEpisodeCount: 18,
        episodeCount: 18,
        dueAt: "2026-10-27T09:00:00.000Z",
      },
    ],
  });

  assert.equal(normalized.pendingNotifications.length, 1);
  assert.equal(normalized.pendingNotifications[0].id, "notify_latest");
  assert.equal(normalized.pendingNotifications[0].episodeCount, 18);
  assert.deepEqual(normalized.pendingNotifications[0].eventIds, [
    "evt_1",
    "evt_2",
  ]);
});

test("normalizeState migrates legacy Bark settings without losing the key", () => {
  const normalized = normalizeState({
    settings: {
      barkKey: "legacy_BARK-key",
      intervalMinutes: 45,
    },
  });
  assert.equal("barkKey" in normalized.settings, false);
  assert.deepEqual(normalized.settings.notifications.bark, {
    enabled: true,
    key: "legacy_BARK-key",
  });
  assert.equal(normalized.settings.notifications.ntfy.enabled, false);
  assert.equal(normalized.settings.notifications.telegram.enabled, false);
  assert.equal(normalized.settings.notifications.wecom.enabled, false);
  assert.equal(normalized.settings.notifications.dingtalk.enabled, false);
  assert.equal(normalized.settings.checkCron, "*/30 * * * *");
  assert.deepEqual(normalized.settings.notifications.proxy, {
    enabled: false,
    url: "",
    channels: {
      bark: false,
      ntfy: false,
      telegram: false,
      wecom: false,
      dingtalk: false,
    },
  });
});

test("normalizeState preserves the official album discovery source", () => {
  const normalized = normalizeState({
    subscriptions: [
      {
        id: "sub_album",
        primarySeriesId: "7645616042022014014",
        seriesGroupId: "7624475539960499262",
        title: "测试短剧",
        seasons: [
          {
            seriesId: "7690163276214176792",
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第十三季",
            source: "album",
          },
        ],
      },
    ],
  });
  assert.equal(normalized.subscriptions[0].seasons[0].source, "album");
});

test("normalizeState migrates watched update state for legacy subscriptions", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    version: 6,
    subscriptions: [
      {
        id: "sub_legacy_watch_state",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
    ],
  });

  assert.equal(normalized.subscriptions[0].hasUnreadUpdate, false);
  assert.equal(normalized.subscriptions[0].lastWatchedAt, null);
});

test("normalizeState preserves a valid watched timestamp", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    subscriptions: [
      {
        id: "sub_watched",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        hasUnreadUpdate: true,
        lastWatchedAt: "2026-10-27T08:30:00+08:00",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
    ],
  });

  assert.equal(normalized.subscriptions[0].hasUnreadUpdate, true);
  assert.equal(
    normalized.subscriptions[0].lastWatchedAt,
    "2026-10-27T00:30:00.000Z",
  );
});

test("normalizeState migrates the three reminder states", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    subscriptions: [
      {
        id: "sub_reminder_default",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
      {
        id: "sub_reminder_off",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        reminderEnabled: false,
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
      {
        id: "sub_reminder_muted",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        reminderMutedForCurrentUpdate: true,
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
      {
        id: "sub_reminder_off_and_muted",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        reminderEnabled: false,
        reminderMutedForCurrentUpdate: true,
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
    ],
  });

  assert.equal(normalized.subscriptions[0].reminderEnabled, true);
  assert.equal(
    normalized.subscriptions[0].reminderMutedForCurrentUpdate,
    false,
  );
  assert.equal(normalized.subscriptions[1].reminderEnabled, false);
  assert.equal(
    normalized.subscriptions[1].reminderMutedForCurrentUpdate,
    false,
  );
  assert.equal(normalized.subscriptions[2].reminderEnabled, true);
  assert.equal(
    normalized.subscriptions[2].reminderMutedForCurrentUpdate,
    true,
  );
  assert.equal(normalized.subscriptions[3].reminderEnabled, false);
  assert.equal(
    normalized.subscriptions[3].reminderMutedForCurrentUpdate,
    false,
  );
});

test("normalizeState migrates the latest episode detection time into its season", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    version: 4,
    subscriptions: [
      {
        id: "sub_episode_time",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第一季",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第一季",
            status: "updating",
            episodeCount: 18,
          },
        ],
      },
    ],
    events: [
      {
        id: "evt_episode_latest",
        type: "episode",
        subscriptionId: "sub_episode_time",
        seasonId: seriesId,
        createdAt: "2026-10-28T18:38:14.946Z",
      },
      {
        id: "evt_episode_old",
        type: "episode",
        subscriptionId: "sub_episode_time",
        seasonId: seriesId,
        createdAt: "2026-10-27T08:00:00.000Z",
      },
    ],
  });

  assert.equal(
    normalized.subscriptions[0].seasons[0].lastEpisodeChangedAt,
    "2026-10-28T18:38:14.946Z",
  );
});

test("normalizeState clears a verified legacy completion without a finale marker", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    version: 1,
    subscriptions: [
      {
        id: "sub_legacy_completed",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第六季",
        seriesStatus: "completed",
        completedAt: "2026-10-01T00:00:00.000Z",
        seriesCompletionVerifiedAt: "2026-10-01T00:00:00.000Z",
        seriesCompletionAnnounced: true,
        discovery: {
          confirmedSeriesIds: [seriesId],
        },
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第六季",
            status: "completed",
            episodeCount: 20,
          },
        ],
      },
    ],
  });
  const subscription = normalized.subscriptions[0];
  assert.equal(normalized.version, 12);
  assert.equal(subscription.seriesStatus, "unknown");
  assert.match(subscription.seriesStatusReason, /完结篇/);
  assert.equal(subscription.completedAt, null);
  assert.equal(subscription.seriesCompletionAnnounced, false);
  assert.equal(subscription.seriesCompletionVerifiedAt, null);
});

test("normalizeState preserves a verified completion cycle through a temporary error", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    subscriptions: [
      {
        id: "sub_verified_completed",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "测试短剧第七季完结篇",
        completedAt: "2026-10-01T00:00:00.000Z",
        seriesCompletionVerifiedAt: "2026-10-01T00:00:00.000Z",
        seriesCompletionAnnounced: true,
        discovery: {
          confirmedSeriesIds: [seriesId],
        },
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "测试短剧第七季完结篇",
            status: "completed",
            episodeCount: 20,
            lastError: "临时网络失败",
          },
        ],
      },
    ],
  });
  const subscription = normalized.subscriptions[0];
  assert.equal(subscription.seriesStatus, "unknown");
  assert.equal(subscription.completedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(subscription.seriesCompletionAnnounced, true);
  assert.equal(
    subscription.seriesCompletionVerifiedAt,
    "2026-10-01T00:00:00.000Z",
  );
});

test("normalizeState removes only legacy completion events without finale evidence", () => {
  const legacySeriesId = "7621200213801176126";
  const finaleSeriesId = "7621200213801176127";
  const legacySubscription = {
    id: "sub_legacy_event",
    primarySeriesId: legacySeriesId,
    seriesGroupId: "7624475539960499262",
    title: "旧规则完结剧",
    completedAt: "2026-10-01T00:00:00.000Z",
    seriesCompletionVerifiedAt: "2026-10-01T00:00:00.000Z",
    seriesCompletionAnnounced: true,
    discovery: { confirmedSeriesIds: [legacySeriesId] },
    seasons: [
      {
        seriesId: legacySeriesId,
        seriesGroupId: "7624475539960499262",
        title: "旧规则完结剧第六季",
        status: "completed",
        episodeCount: 20,
      },
    ],
  };
  const finaleSubscription = {
    id: "sub_finale_event",
    primarySeriesId: finaleSeriesId,
    seriesGroupId: "7624475539960499263",
    title: "明确完结剧第七季完结篇",
    completedAt: "2026-10-02T00:00:00.000Z",
    seriesCompletionVerifiedAt: "2026-10-02T00:00:00.000Z",
    seriesCompletionAnnounced: true,
    discovery: { confirmedSeriesIds: [finaleSeriesId] },
    seasons: [
      {
        seriesId: finaleSeriesId,
        seriesGroupId: "7624475539960499263",
        title: "明确完结剧第七季完结篇",
        status: "completed",
        episodeCount: 20,
      },
    ],
  };
  const completionEvent = (id, subscriptionId) => ({
    id,
    type: "completed",
    subscriptionId,
    message: "系列已完结",
  });
  const normalized = normalizeState({
    version: 1,
    subscriptions: [legacySubscription, finaleSubscription],
    events: [
      completionEvent("evt_legacy_completed", legacySubscription.id),
      completionEvent("evt_finale_completed", finaleSubscription.id),
    ],
  });

  assert.deepEqual(
    normalized.events.map((event) => event.id),
    ["evt_finale_completed"],
  );
  assert.equal(normalized.subscriptions[0].seriesStatus, "unknown");
  assert.equal(normalized.subscriptions[1].seriesStatus, "completed");

  const currentVersion = normalizeState({
    version: 2,
    subscriptions: [legacySubscription],
    events: [
      completionEvent("evt_historical_completed", legacySubscription.id),
    ],
  });
  assert.deepEqual(
    currentVersion.events.map((event) => event.id),
    ["evt_historical_completed"],
  );
});

test("store persists a legacy state migration and completion event cleanup", async () => {
  const filePath = await temporaryStatePath();
  const seriesId = "7621200213801176126";
  await fs.writeFile(
    filePath,
    JSON.stringify({
      version: 1,
      subscriptions: [
        {
          id: "sub_disk_legacy",
          primarySeriesId: seriesId,
          seriesGroupId: "7624475539960499262",
          title: "磁盘旧规则完结剧",
          completedAt: "2026-10-01T00:00:00.000Z",
          seriesCompletionVerifiedAt: "2026-10-01T00:00:00.000Z",
          seriesCompletionAnnounced: true,
          discovery: { confirmedSeriesIds: [seriesId] },
          seasons: [
            {
              seriesId,
              seriesGroupId: "7624475539960499262",
              title: "磁盘旧规则完结剧第六季",
              status: "completed",
              episodeCount: 20,
            },
          ],
        },
      ],
      events: [
        {
          id: "evt_disk_legacy_completed",
          type: "completed",
          subscriptionId: "sub_disk_legacy",
          message: "旧规则误报完结",
        },
        {
          id: "evt_disk_episode",
          type: "episode",
          subscriptionId: "sub_disk_legacy",
          message: "集数更新",
        },
      ],
    }),
    "utf8",
  );

  const store = new JsonStateStore(filePath);
  try {
    const state = await store.init();
    assert.equal(state.version, 12);
    assert.deepEqual(
      state.events.map((event) => event.id),
      ["evt_disk_episode"],
    );
    assert.equal(state.subscriptions[0].seriesStatus, "unknown");
    assert.equal(state.subscriptions[0].completedAt, null);
  } finally {
    await store.close();
  }
});
