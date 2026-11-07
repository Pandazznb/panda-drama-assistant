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
  runSqliteMigrations,
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

test("automatic SQLite migrations preserve data and create a secure backup", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-migration-"),
  );
  const databaseFile = path.join(directory, "state.sqlite3");
  const database = new DatabaseSync(databaseFile);
  const migrations = [
    {
      version: 1,
      up() {},
    },
    {
      version: 2,
      up(db) {
        db.exec(`
          ALTER TABLE demo_records
          ADD COLUMN note TEXT NOT NULL DEFAULT '';
          UPDATE demo_records SET note = '已升级';
        `);
      },
    },
  ];

  try {
    database.exec(`
      CREATE TABLE demo_records (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL
      );
      INSERT INTO demo_records (title) VALUES ('已有追更');
      PRAGMA user_version = 1;
    `);

    const result = await runSqliteMigrations(database, {
      databaseFile,
      migrations,
    });

    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, 2);
    assert.ok(result.backupPath);
    assert.equal(
      database.prepare("PRAGMA user_version").get().user_version,
      2,
    );
    assert.deepEqual(
      {
        ...database
          .prepare("SELECT title, note FROM demo_records")
          .get(),
      },
      { title: "已有追更", note: "已升级" },
    );
    assert.equal((await fs.stat(result.backupPath)).mode & 0o777, 0o600);

    const backup = new DatabaseSync(result.backupPath);
    try {
      assert.deepEqual(
        {
          ...backup.prepare("SELECT title FROM demo_records").get(),
        },
        { title: "已有追更" },
      );
      assert.equal(
        backup.prepare("PRAGMA user_version").get().user_version,
        1,
      );
      assert.equal(
        backup
          .prepare(
            "SELECT COUNT(*) AS count FROM pragma_table_info('demo_records') WHERE name = 'note'",
          )
          .get().count,
        0,
      );
    } finally {
      backup.close();
    }

    const repeated = await runSqliteMigrations(database, {
      databaseFile,
      migrations,
    });
    assert.equal(repeated.backupPath, null);
    assert.equal(repeated.fromVersion, 2);
    assert.equal(repeated.toVersion, 2);
  } finally {
    database.close();
  }
});

test("a failed automatic SQLite migration rolls back and keeps the old version", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-migration-failure-"),
  );
  const databaseFile = path.join(directory, "state.sqlite3");
  const database = new DatabaseSync(databaseFile);
  const migrations = [
    {
      version: 1,
      up() {},
    },
    {
      version: 2,
      up(db) {
        db.exec(`
          ALTER TABLE demo_records
          ADD COLUMN must_rollback TEXT NOT NULL DEFAULT 'x';
        `);
        throw new Error("模拟迁移失败");
      },
    },
  ];

  try {
    database.exec(`
      CREATE TABLE demo_records (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL
      );
      INSERT INTO demo_records (title) VALUES ('升级前数据');
      PRAGMA user_version = 1;
    `);

    await assert.rejects(
      runSqliteMigrations(database, { databaseFile, migrations }),
      /SQLite 数据库自动升级失败.*模拟迁移失败/,
    );
    assert.equal(
      database.prepare("PRAGMA user_version").get().user_version,
      1,
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM pragma_table_info('demo_records') WHERE name = 'must_rollback'",
        )
        .get().count,
      0,
    );
    assert.equal(
      database.prepare("SELECT title FROM demo_records").get().title,
      "升级前数据",
    );
  } finally {
    database.close();
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
  assert.equal(
    normalized.settings.checkCron,
    "11 0,6,10,12,18 * * *",
  );
  assert.deepEqual(normalized.settings.notifications.bark, {
    enabled: true,
    key: "abc_DEF",
  });
  assert.equal(normalized.events.length, 1);
  assert.equal(normalized.events[0].notified, false);
});

test("normalizeState keeps account sync baseline and bidirectional removal counts", () => {
  const normalized = normalizeState({
    settings: {
      accountSync: {
        removedLocalCount: 3,
        syncBaseline: {
          initializedAt: "2026-11-01T01:00:00.000Z",
          favorites: [
            "7694653385668037657",
            "7694653385668037657",
            "invalid",
          ],
          reservationsOnline: [],
          localSubscriptions: [
            {
              subscriptionId: "sub_test",
              title: "测试短剧第一季",
              seriesGroupId: "7698938199183215640",
              seriesIds: ["7694653385668037657"],
            },
            {
              subscriptionId: "sub_invalid",
              seriesIds: ["invalid"],
            },
          ],
        },
        history: [
          {
            id: "sync_test",
            trigger: "manual",
            startedAt: "2026-11-01T01:00:00.000Z",
            completedAt: "2026-11-01T01:01:00.000Z",
            result: "success",
            removedLocalCount: 1,
            items: [{ kind: "removedLocal", title: "测试短剧第一季" }],
          },
        ],
      },
    },
  });

  assert.equal(normalized.settings.accountSync.removedLocalCount, 3);
  assert.deepEqual(
    normalized.settings.accountSync.syncBaseline.favorites,
    ["7694653385668037657"],
  );
  assert.deepEqual(
    normalized.settings.accountSync.syncBaseline.localSubscriptions,
    [
      {
        subscriptionId: "sub_test",
        title: "测试短剧第一季",
        seriesGroupId: "7698938199183215640",
        seriesIds: ["7694653385668037657"],
      },
    ],
  );
  assert.equal(
    normalized.settings.accountSync.history[0].removedLocalCount,
    1,
  );
  assert.equal(
    normalized.settings.accountSync.history[0].items[0].kind,
    "removedLocal",
  );
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
    "11 0,6,10,12,18 * * *",
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
    "11 0,6,10,12,18 * * *",
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

test("normalizeState exposes automatic inactivity as inactive and clears overrides", () => {
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
  assert.equal(subscription.seriesStatus, "inactive");
  assert.equal(subscription.seriesStatusOverride, null);
  assert.equal(
    subscription.autoInactiveAt,
    "2027-02-04T08:00:00.000Z",
  );
  assert.equal(subscription.autoCompletedAt, undefined);
  assert.match(subscription.seriesStatusReason, /超过 90 天/);
  assert.match(subscription.seriesStatusReason, /已自动标记为停更/);
  assert.doesNotMatch(subscription.seriesStatusReason, /自动标记为完结/);
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
  assert.equal(
    invalid.settings.discoveryReminderDurationMinutes,
    0,
  );
  assert.equal(invalid.settings.discoveryReminderCron, "0 */4 * * *");

  const defaults = normalizeState({});
  assert.equal(
    defaults.settings.discoveryReminderDurationMinutes,
    2 * 24 * 60,
  );
  assert.equal(defaults.settings.discoveryReminderCron, "0 */4 * * *");
  assert.equal(
    normalizeState({
      settings: { discoveryReminderDurationMinutes: 0 },
    }).settings.discoveryReminderDurationMinutes,
    0,
  );
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
  assert.equal(normalized.settings.notifications.wecomApp.enabled, false);
  assert.equal(normalized.settings.notifications.dingtalk.enabled, false);
  assert.equal(
    normalized.settings.checkCron,
    "11 0,6,10,12,18 * * *",
  );
  assert.deepEqual(normalized.settings.notifications.proxy, {
    enabled: false,
    url: "",
    channels: {
      bark: false,
      ntfy: false,
      telegram: false,
      wecom: false,
      wecomApp: false,
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

test("normalizeState derives a base series title without changing season titles", () => {
  const seriesId = "7621200213801176126";
  const normalized = normalizeState({
    subscriptions: [
      {
        id: "sub_series_title",
        primarySeriesId: seriesId,
        seriesGroupId: "7624475539960499262",
        title: "万妖图录传第一季",
        displayTitle: "万妖图录传第一季",
        firstSeasonTitle: "万妖图录传第一季",
        seasons: [
          {
            seriesId,
            seriesGroupId: "7624475539960499262",
            title: "万妖图录传第一季",
            status: "completed",
            episodeCount: 84,
          },
          {
            seriesId: "7698938199183215640",
            seriesGroupId: "7624475539960499262",
            title: "万妖图录传第六季",
            status: "updating",
            episodeCount: 12,
          },
        ],
      },
    ],
  });

  assert.equal(normalized.subscriptions[0].title, "万妖图录传");
  assert.equal(normalized.subscriptions[0].displayTitle, "万妖图录传");
  assert.equal(normalized.subscriptions[0].firstSeasonTitle, "万妖图录传第一季");
  assert.equal(normalized.subscriptions[0].seasons[0].title, "万妖图录传第一季");
  assert.equal(normalized.subscriptions[0].seasons[1].title, "万妖图录传第六季");
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
  assert.equal(normalized.version, 14);
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
    assert.equal(state.version, 14);
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
