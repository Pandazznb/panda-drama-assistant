import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AccountSyncService } from "../src/account-sync.js";
import { JsonStateStore } from "../src/store.js";
import { createId } from "../src/utils.js";

const FIRST_ID = "7694653385668037657";
const SECOND_ID = "7694653385668037658";
const THIRD_ID = "7694653385668037659";
const GROUP_ID = "7698938199183215640";

function category(key, items = [], status = "ok") {
  return {
    key,
    status,
    error: status === "ok" ? null : `${key} 读取失败`,
    items,
    count: items.length,
    fetchedAt: "2026-11-01T01:00:00.000Z",
  };
}

function snapshot({
  favorites = [],
  reservationsOnline = [],
  reservationsUpcoming = [],
  favoritesStatus = "ok",
  onlineStatus = "ok",
  upcomingStatus = "ok",
} = {}) {
  return {
    profile: {
      id: "1234567890123456789",
      name: "测试用户",
    },
    fetchedAt: "2026-11-01T01:00:00.000Z",
    categories: {
      favorites: category("favorites", favorites, favoritesStatus),
      reservationsOnline: category(
        "reservationsOnline",
        reservationsOnline,
        onlineStatus,
      ),
      reservationsUpcoming: category(
        "reservationsUpcoming",
        reservationsUpcoming,
        upcomingStatus,
      ),
    },
  };
}

function subscription({
  id = "sub_test",
  firstSeasonId = FIRST_ID,
  title = "测试短剧第一季",
} = {}) {
  return {
    id,
    seriesGroupId: GROUP_ID,
    title,
    displayTitle: title,
    firstSeasonId,
    firstSeasonTitle: title,
    seasons: [{ seriesId: firstSeasonId, title }],
  };
}

function createAccountMock() {
  const state = {
    snapshot: snapshot(),
    favoriteIds: new Set(),
    reservationIds: new Set(),
    calls: {
      refresh: 0,
      requireCredentials: 0,
      setFavorite: [],
      setReservation: [],
    },
    favoriteFailure: null,
    reservationFailure: null,
  };

  function refreshValue() {
    return {
      authenticated: true,
      profile: state.snapshot.profile,
      snapshot: state.snapshot,
      refreshing: false,
      issue: "",
      message: "",
    };
  }

  return {
    state,
    async refresh() {
      state.calls.refresh += 1;
      state.snapshot = snapshot({
        favorites: [...state.favoriteIds].map((seriesId) => ({
          seriesId,
          title: "收藏短剧",
        })),
        reservationsOnline: [...state.reservationIds].map((seriesId) => ({
          seriesId,
          title: "预约短剧",
        })),
      });
      return refreshValue();
    },
    status() {
      return refreshValue();
    },
    requireCredentials() {
      state.calls.requireCredentials += 1;
      return {
        userId: state.snapshot.profile.id,
        cookie: "test-cookie",
      };
    },
    async setFavorite(_credentials, seriesId, add) {
      state.calls.setFavorite.push({ seriesId, add });
      if (state.favoriteFailure) {
        throw state.favoriteFailure;
      }
      if (add) {
        state.favoriteIds.add(seriesId);
      } else {
        state.favoriteIds.delete(seriesId);
      }
      return { ok: true };
    },
    async setReservation(_credentials, seriesId, add) {
      state.calls.setReservation.push({ seriesId, add });
      if (state.reservationFailure) {
        throw state.reservationFailure;
      }
      if (add) {
        state.reservationIds.add(seriesId);
      } else {
        state.reservationIds.delete(seriesId);
      }
      return { ok: true };
    },
  };
}

function createScreenshotImportMock(
  store,
  calls,
  { checkErrors = 0 } = {},
) {
  return {
    async importSeriesIds(seriesIds, service) {
      calls.imports.push({ seriesIds, service });
      const outcomes = [];
      await store.mutate((state) => {
        for (const [index, seriesId] of seriesIds.entries()) {
          if (
            state.subscriptions.some((item) =>
              item.seasons.some(
                (season) => season.seriesId === seriesId,
              ),
            )
          ) {
            outcomes.push({
              seriesId,
              status: "skipped",
              subscriptionId: null,
              title: `测试短剧${index + 1}`,
              message: "同系列已经在追更列表中。",
            });
            continue;
          }
          const subscriptionId = createId("sub_");
          const title = `测试短剧${index + 1}`;
          state.subscriptions.push(
            subscription({
              id: subscriptionId,
              firstSeasonId: seriesId,
              title,
            }),
          );
          outcomes.push({
            seriesId,
            status: "imported",
            subscriptionId,
            title,
            message: "已开始追更。",
          });
        }
      });
      const importedCount = outcomes.filter(
        (outcome) => outcome.status === "imported",
      ).length;
      const skippedCount = outcomes.filter(
        (outcome) => outcome.status === "skipped",
      ).length;
      return {
        outcomes,
        importedCount,
        skippedCount,
        failedCount: 0,
        subscriptionCount: importedCount,
        checkedCount: seriesIds.length,
        checkErrors,
      };
    },
  };
}

async function createHarness(t, options = {}) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-account-sync-"),
  );
  const store = new JsonStateStore(path.join(directory, "state.json"));
  await store.init();
  const accountService = createAccountMock();
  const calls = { imports: [], removals: [] };
  const screenshotImport = createScreenshotImportMock(store, calls, {
    checkErrors: options.screenshotCheckErrors || 0,
  });
  const systemLog = options.systemLog || null;
  const reminderService = {
    id: "reminder-service",
    async removeSubscription(subscriptionId) {
      calls.removals.push(subscriptionId);
      return store.mutate((state) => {
        const index = state.subscriptions.findIndex(
          (subscription) => subscription.id === subscriptionId,
        );
        if (index === -1) {
          throw new Error("追更条目不存在。");
        }
        const [removed] = state.subscriptions.splice(index, 1);
        state.events = state.events.filter(
          (event) => event.subscriptionId !== subscriptionId,
        );
        state.pendingNotifications = state.pendingNotifications.filter(
          (pending) => pending.subscriptionId !== subscriptionId,
        );
        state.discoveryReminders = state.discoveryReminders.filter(
          (reminder) => reminder.subscriptionId !== subscriptionId,
        );
        return {
          id: removed.id,
          title: removed.displayTitle || removed.title,
        };
      });
    },
  };
  const service = new AccountSyncService({
    store,
    accountService,
    reminderService,
    screenshotImport,
    systemLog,
    now: () => new Date("2026-11-01T01:05:00.000Z"),
    timers: {
      setTimeout() {
        return { unref() {} };
      },
      clearTimeout() {},
    },
  });
  t.after(async () => {
    service.stop();
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return {
    store,
    accountService,
    screenshotImport,
    systemLog,
    calls,
    reminderService,
    service,
  };
}

test("account sync imports favorites and reservations as subscriptions", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(SECOND_ID);

  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.importedCount, 2);
  assert.equal(result.uploadedCount, 0);
  assert.equal(result.removedRemoteCount, 0);
  assert.deepEqual(harness.calls.imports[0].seriesIds, [
    FIRST_ID,
    SECOND_ID,
  ]);
  assert.equal(
    harness.calls.imports[0].service,
    harness.service.reminderService,
  );
  const state = await harness.store.read();
  assert.deepEqual(
    state.subscriptions.map((item) => item.firstSeasonId),
    [FIRST_ID, SECOND_ID],
  );
  assert.equal(state.settings.accountSync.lastResult, "success");
  assert.equal(state.settings.accountSync.importedCount, 2);
  const latest = state.settings.accountSync.history[0];
  assert.equal(latest.trigger, "manual");
  assert.deepEqual(
    latest.items.slice(0, 2).map((item) => ({
      kind: item.kind,
      title: item.title,
      seriesId: item.seriesId,
    })),
    [
      {
        kind: "imported",
        title: "测试短剧1",
        seriesId: FIRST_ID,
      },
      {
        kind: "imported",
        title: "测试短剧2",
        seriesId: SECOND_ID,
      },
    ],
  );
  assert.equal(latest.items.length, 2);
  assert.equal(latest.items[1].kind, "imported");
  assert.deepEqual(harness.accountService.state.calls.setReservation, []);
});

test("account sync reports incomplete season verification", async (t) => {
  const harness = await createHarness(t, {
    screenshotCheckErrors: 1,
  });
  harness.accountService.state.favoriteIds.add(FIRST_ID);

  const result = await harness.service.sync();

  assert.equal(result.result, "partial");
  assert.equal(result.importedCount, 1);
  assert.match(
    result.errors.join(" "),
    /同系列季度暂未核验完整，系统会自动重试/,
  );
  const state = await harness.store.read();
  assert.equal(state.settings.accountSync.lastResult, "partial");
});

test("first account sync merges both sides without deleting either side", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(SECOND_ID);
  await harness.store.mutate((state) => {
    state.subscriptions.push(subscription());
  });

  const result = await harness.service.sync({ trigger: "login" });

  assert.equal(result.result, "success");
  assert.equal(result.importedCount, 1);
  assert.equal(result.uploadedCount, 1);
  assert.equal(result.removedRemoteCount, 0);
  assert.equal(result.removedLocalCount, 0);
  assert.deepEqual(harness.calls.removals, []);
  const state = await harness.store.read();
  assert.equal(state.subscriptions.length, 2);
  assert.equal(
    state.subscriptions.some(
      (item) => item.firstSeasonId === FIRST_ID,
    ),
    true,
  );
  assert.equal(
    state.subscriptions.some(
      (item) => item.firstSeasonId === SECOND_ID,
    ),
    true,
  );
  assert.deepEqual(
    [...harness.accountService.state.favoriteIds].sort(),
    [FIRST_ID, SECOND_ID].sort(),
  );
  assert.deepEqual(
    state.settings.accountSync.syncBaseline.favorites.sort(),
    [FIRST_ID, SECOND_ID].sort(),
  );
});

test("account favorite removal removes the matching subscription after the baseline exists", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  await harness.service.sync();
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.accountService.state.favoriteIds.delete(FIRST_ID);
  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.removedLocalCount, 1);
  assert.equal(
    result.message.match(/账号删除移出/g)?.length,
    1,
  );
  assert.match(result.message, /账号删除移出 1 部/);
  assert.deepEqual(harness.calls.removals, [subscriptionId]);
  const state = await harness.store.read();
  assert.deepEqual(state.subscriptions, []);
  assert.equal(
    state.settings.accountSync.history[0].items.some(
      (item) =>
        item.kind === "removedLocal" &&
        item.subscriptionId === subscriptionId,
    ),
    true,
  );
  assert.deepEqual(
    state.settings.accountSync.syncBaseline.favorites,
    [],
  );
});

test("removing one account category keeps the subscription while another category still contains it", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  await harness.service.sync();
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;

  harness.accountService.state.favoriteIds.delete(FIRST_ID);
  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.removedLocalCount, 0);
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].id, subscriptionId);
  assert.equal(
    harness.accountService.state.favoriteIds.has(FIRST_ID),
    false,
  );
  assert.equal(
    harness.accountService.state.reservationIds.has(FIRST_ID),
    true,
  );
});

test("account reservation removal also removes the subscription when no category contains it", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  await harness.service.sync();

  harness.accountService.state.reservationIds.delete(FIRST_ID);
  harness.accountService.state.favoriteIds.delete(FIRST_ID);
  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.removedLocalCount, 1);
  const state = await harness.store.read();
  assert.deepEqual(state.subscriptions, []);
});

test("login sync records that no subscriptions changed when the account already matches", async (t) => {
  const harness = await createHarness(t);

  await harness.service.sync({ trigger: "login" });
  const secondResult = await harness.service.sync({ trigger: "manual" });

  assert.equal(secondResult.result, "success");
  assert.deepEqual(secondResult.items, []);
  const state = await harness.store.read();
  assert.equal(state.settings.accountSync.history[0].trigger, "manual");
  assert.deepEqual(state.settings.accountSync.history[0].items, []);
  assert.equal(state.settings.accountSync.history[1].trigger, "login");
});

test("account sync writes readable per-subscription system log entries", async (t) => {
  const logEntries = [];
  const harness = await createHarness(t, {
    systemLog: {
      async append(entry) {
        logEntries.push(entry);
      },
    },
  });
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);

  await harness.service.sync({ trigger: "login" });

  assert.equal(
    logEntries.some(
      (entry) =>
        entry.action === "account.sync.completed" &&
        entry.message.includes("登录同步完成"),
    ),
    true,
  );
  assert.equal(
    logEntries.some(
      (entry) =>
        entry.action === "account.sync.item.imported" &&
        entry.message.includes("《测试短剧1》"),
    ),
    true,
  );
});

test("account sync writes online subscriptions to favorites without adding reservations", async (t) => {
  const harness = await createHarness(t);
  await harness.store.mutate((state) => {
    state.subscriptions.push(subscription());
  });

  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.uploadedCount, 1);
  assert.deepEqual(harness.accountService.state.calls.setFavorite, [
    { seriesId: FIRST_ID, add: true },
  ]);
  assert.deepEqual(harness.accountService.state.calls.setReservation, []);
  assert.deepEqual([...harness.accountService.state.favoriteIds], [FIRST_ID]);
  assert.deepEqual([...harness.accountService.state.reservationIds], []);
  assert.equal(harness.calls.imports.length, 0);
});

test("a subscription added locally after the baseline is written to account favorites", async (t) => {
  const harness = await createHarness(t);
  await harness.service.sync();

  await harness.store.mutate((state) => {
    state.subscriptions.push(subscription());
  });
  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.uploadedCount, 1);
  assert.deepEqual(harness.accountService.state.calls.setFavorite, [
    { seriesId: FIRST_ID, add: true },
  ]);
  assert.deepEqual(harness.accountService.state.calls.setReservation, []);
});

test("a subscription deleted locally after the baseline is removed from the account", async (t) => {
  const harness = await createHarness(t);
  await harness.store.mutate((state) => {
    state.subscriptions.push(subscription());
  });
  await harness.service.sync();

  await harness.store.mutate((state) => {
    state.subscriptions = [];
  });
  const result = await harness.service.sync();

  assert.equal(result.result, "success");
  assert.equal(result.removedRemoteCount, 2);
  assert.deepEqual(harness.accountService.state.calls.setFavorite, [
    { seriesId: FIRST_ID, add: true },
    { seriesId: FIRST_ID, add: false },
  ]);
  assert.deepEqual(harness.accountService.state.calls.setReservation, [
    { seriesId: FIRST_ID, add: false },
  ]);
  assert.equal(harness.accountService.state.favoriteIds.has(FIRST_ID), false);
  assert.equal(
    harness.accountService.state.reservationIds.has(FIRST_ID),
    false,
  );
});

test("partial account reads do not infer account-side deletions", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  await harness.service.sync();
  const subscriptionId = (await harness.store.read()).subscriptions[0].id;
  harness.accountService.refresh = async () => {
    const value = snapshot({
      favorites: [],
      reservationsOnline: [],
      upcomingStatus: "error",
    });
    harness.accountService.state.snapshot = value;
    return {
      authenticated: true,
      profile: value.profile,
      snapshot: value,
    };
  };

  const result = await harness.service.sync();

  assert.equal(result.result, "error");
  assert.equal(result.removedLocalCount, 0);
  assert.deepEqual(harness.calls.removals, []);
  const state = await harness.store.read();
  assert.equal(state.subscriptions[0].id, subscriptionId);
  assert.deepEqual(
    state.settings.accountSync.syncBaseline.favorites,
    [FIRST_ID],
  );
});

test("account sync baseline survives service recreation", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  await harness.service.sync();
  harness.service.stop();

  const restarted = new AccountSyncService({
    store: harness.store,
    accountService: harness.accountService,
    reminderService: harness.reminderService,
    screenshotImport: harness.screenshotImport,
    now: () => new Date("2026-11-02T01:05:00.000Z"),
    timers: {
      setTimeout() {
        return { unref() {} };
      },
      clearTimeout() {},
    },
  });
  t.after(() => restarted.stop());
  harness.accountService.state.favoriteIds.delete(FIRST_ID);

  const result = await restarted.sync();

  assert.equal(result.removedLocalCount, 1);
  assert.deepEqual((await harness.store.read()).subscriptions, []);
});

test("deleting a subscription removes every series from the remote account", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.favoriteIds.add(SECOND_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(SECOND_ID);

  await harness.service.store.mutate((state) => {
    state.settings.accountSync.deleteRetries.push({
      subscriptionId: "sub_deleted",
      title: "测试短剧第一季",
      seriesGroupId: GROUP_ID,
      seriesIds: [FIRST_ID, SECOND_ID],
      pendingOperations: [FIRST_ID, SECOND_ID].flatMap((seriesId) =>
        ["favorite", "reservation"].map((operation) => ({
          seriesId,
          operation,
        })),
      ),
      createdAt: "2026-11-01T01:04:00.000Z",
      attempts: 0,
      lastError: null,
    });
  });
  await harness.service.flushDeleteRetries();

  assert.deepEqual(
    harness.accountService.state.calls.setFavorite,
    [
      { seriesId: FIRST_ID, add: false },
      { seriesId: SECOND_ID, add: false },
    ],
  );
  assert.deepEqual(
    harness.accountService.state.calls.setReservation,
    [
      { seriesId: FIRST_ID, add: false },
      { seriesId: SECOND_ID, add: false },
    ],
  );
  assert.equal(harness.accountService.state.favoriteIds.size, 0);
  assert.equal(harness.accountService.state.reservationIds.size, 0);
  const state = await harness.store.read();
  assert.deepEqual(state.settings.accountSync.deleteRetries, []);
});

test("queueing deletion merges all official seasons into one retry entry", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.favoriteIds.add(SECOND_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(SECOND_ID);

  await harness.service.queueRemoteDeletion({
    id: "sub_deleted",
    title: "测试短剧第一季",
    seriesGroupId: GROUP_ID,
    firstSeasonId: FIRST_ID,
    seasons: [{ seriesId: FIRST_ID }, { seriesId: SECOND_ID }],
  });
  await harness.service.flushDeleteRetries();

  assert.equal(harness.accountService.state.favoriteIds.size, 0);
  assert.equal(harness.accountService.state.reservationIds.size, 0);
  const state = await harness.store.read();
  assert.deepEqual(state.settings.accountSync.deleteRetries, []);
});

test("failed remote deletion is retained and succeeds on retry", async (t) => {
  const harness = await createHarness(t);
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  harness.accountService.state.favoriteFailure = new Error("收藏接口失败");

  await harness.service.queueRemoteDeletion(subscription());
  await harness.service.flushDeleteRetries();

  let state = await harness.store.read();
  assert.equal(state.settings.accountSync.deleteRetries.length, 1);
  assert.equal(
    state.settings.accountSync.deleteRetries[0].pendingOperations.length,
    1,
  );
  assert.equal(
    state.settings.accountSync.deleteRetries[0].pendingOperations[0].operation,
    "favorite",
  );
  assert.equal(harness.accountService.state.reservationIds.size, 0);

  harness.accountService.state.favoriteFailure = null;
  const retry = await harness.service.flushDeleteRetries();

  assert.equal(retry.removedCount, 1);
  assert.equal(harness.accountService.state.favoriteIds.size, 0);
  state = await harness.store.read();
  assert.deepEqual(state.settings.accountSync.deleteRetries, []);
});

test("partial account reads do not delete or write unavailable categories", async (t) => {
  const harness = await createHarness(t);
  await harness.store.mutate((state) => {
    state.subscriptions.push(subscription());
  });
  harness.accountService.state.favoriteIds.add(FIRST_ID);
  harness.accountService.state.reservationIds.add(FIRST_ID);
  harness.accountService.refresh = async () => {
    harness.accountService.state.calls.refresh += 1;
    const value = snapshot({
      favorites: [{ seriesId: FIRST_ID, title: "测试短剧第一季" }],
      reservationsOnline: [{ seriesId: FIRST_ID, title: "测试短剧第一季" }],
      upcomingStatus: "error",
    });
    harness.accountService.state.snapshot = value;
    return {
      authenticated: true,
      profile: value.profile,
      snapshot: value,
    };
  };

  const result = await harness.service.sync();

  assert.equal(result.result, "error");
  assert.equal(result.uploadedCount, 0);
  assert.equal(result.removedRemoteCount, 0);
  assert.deepEqual(harness.accountService.state.calls.setFavorite, []);
  assert.deepEqual(harness.accountService.state.calls.setReservation, []);
  assert.match(result.errors[0], /reservationsUpcoming 读取失败/);
});

test("account sync Cron can be updated and scheduled", async (t) => {
  const harness = await createHarness(t);
  await harness.service.start();
  const before = await harness.service.status();
  assert.equal(before.cron, "0 3 * * *");
  assert.ok(before.nextSyncAt);

  const cron = await harness.service.updateSettings({
    accountSyncCron: "30 4 * * 1",
  });
  const after = await harness.service.status();

  assert.equal(cron, "30 4 * * 1");
  assert.equal(after.cron, "30 4 * * 1");
  assert.notEqual(after.nextSyncAt, before.nextSyncAt);
  assert.equal(
    (await harness.store.read()).settings.accountSyncCron,
    "30 4 * * 1",
  );
});
