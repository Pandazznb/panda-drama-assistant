import { DEFAULT_ACCOUNT_SYNC_CRON } from "./constants.js";
import {
  isValidCronExpression,
  nextCronOccurrence,
  normalizeCronExpression,
} from "./cron.js";
import { createId } from "./utils.js";

const DEFAULT_RETRY_DELAY_MS = 60_000;
const REMOTE_CATEGORY_KEYS = [
  "favorites",
  "reservationsOnline",
  "reservationsUpcoming",
];

function syncError(message, code = "ACCOUNT_SYNC_ERROR", statusCode = 502) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function categoryIds(snapshot, key) {
  const category = snapshot?.categories?.[key];
  if (!category || category.status !== "ok") {
    return null;
  }
  const ids = new Set();
  for (const item of category.items || []) {
    if (item.seriesId) {
      ids.add(String(item.seriesId));
    }
  }
  return ids;
}

function reservationIds(snapshot) {
  const online = categoryIds(snapshot, "reservationsOnline");
  const upcoming = categoryIds(snapshot, "reservationsUpcoming");
  if (online === null || upcoming === null) {
    return null;
  }
  return new Set([...online, ...upcoming]);
}

function combinedRemoteIds(snapshot) {
  const ids = new Set();
  let available = false;
  for (const key of REMOTE_CATEGORY_KEYS) {
    const category = categoryIds(snapshot, key);
    if (category === null) {
      continue;
    }
    available = true;
    for (const seriesId of category) {
      ids.add(seriesId);
    }
  }
  return available ? ids : null;
}

function failedCategories(snapshot) {
  return Object.values(snapshot?.categories || {})
    .filter((category) => category?.status === "error")
    .map((category) => category.error || "账号数据读取失败。");
}

function subscriptionTitle(subscription) {
  return (
    subscription.displayTitle ||
    subscription.firstSeasonTitle ||
    subscription.title
  );
}

function allSeriesIds(subscription) {
  return [
    ...new Set(
      [
        subscription.firstSeasonId,
        ...(subscription.seasons || []).map((season) => season.seriesId),
      ]
        .map((seriesId) => String(seriesId || "").trim())
        .filter((seriesId) => /^\d{8,25}$/.test(seriesId)),
    ),
  ];
}

function firstSeasonIds(subscription) {
  const seriesId = String(subscription.firstSeasonId || "").trim();
  return /^\d{8,25}$/.test(seriesId) ? [seriesId] : [];
}

function remoteDeletionSeriesIds(subscription) {
  return allSeriesIds(subscription);
}

function localBaselineEntry(subscription) {
  return {
    subscriptionId: String(subscription.id),
    title: subscriptionTitle(subscription),
    seriesGroupId: subscription.seriesGroupId
      ? String(subscription.seriesGroupId)
      : null,
    seriesIds: allSeriesIds(subscription),
  };
}

function localBaselineEntries(baseline) {
  return Array.isArray(baseline?.localSubscriptions)
    ? baseline.localSubscriptions
    : [];
}

function subscriptionMatchesAnySeriesId(subscription, seriesIds) {
  return allSeriesIds(subscription).some((seriesId) =>
    seriesIds.has(seriesId),
  );
}

function deletedBaselineSeriesIds(baseline, snapshot) {
  const deleted = new Set();
  if (!baseline) {
    return deleted;
  }
  for (const key of REMOTE_CATEGORY_KEYS) {
    const previous = Array.isArray(baseline[key])
      ? new Set(baseline[key])
      : null;
    const current = categoryIds(snapshot, key);
    if (!previous || current === null) {
      continue;
    }
    for (const seriesId of previous) {
      if (!current.has(seriesId)) {
        deleted.add(seriesId);
      }
    }
  }
  return deleted;
}

function normalizeDeleteOperation(operation) {
  return ["favorite", "reservation"].includes(operation)
    ? operation
    : null;
}

function normalizeDeleteRetryEntry(entry) {
  const seriesIds = [
    ...new Set(
      (Array.isArray(entry?.seriesIds) ? entry.seriesIds : [])
        .map((seriesId) => String(seriesId || "").trim())
        .filter((seriesId) => /^\d{8,25}$/.test(seriesId)),
    ),
  ];
  const pendingOperations = new Map();
  if (
    Array.isArray(entry?.pendingOperations) &&
    entry.pendingOperations.length > 0
  ) {
    for (const item of entry.pendingOperations) {
      const seriesId = String(item?.seriesId || "").trim();
      const operation = normalizeDeleteOperation(item?.operation);
      if (
        /^\d{8,25}$/.test(seriesId) &&
        operation &&
        seriesIds.includes(seriesId)
      ) {
        pendingOperations.set(`${seriesId}:${operation}`, {
          seriesId,
          operation,
        });
      }
    }
  } else {
    for (const seriesId of seriesIds) {
      pendingOperations.set(`${seriesId}:favorite`, {
        seriesId,
        operation: "favorite",
      });
      pendingOperations.set(`${seriesId}:reservation`, {
        seriesId,
        operation: "reservation",
      });
    }
  }
  return {
    ...entry,
    seriesIds,
    pendingOperations: [...pendingOperations.values()],
  };
}

function sessionError(error) {
  return [
    "ACCOUNT_LOGIN_REQUIRED",
    "ACCOUNT_SESSION_EXPIRED",
  ].includes(error?.code) || error?.status === 401;
}

function remoteImportGroups(snapshot) {
  const groups = new Map();
  for (const key of [
    "favorites",
    "reservationsOnline",
    "reservationsUpcoming",
  ]) {
    const category = snapshot?.categories?.[key];
    if (!category || category.status !== "ok") {
      continue;
    }
    for (const item of category.items || []) {
      if (!item.seriesId || !/^\d{8,25}$/.test(item.seriesId)) {
        continue;
      }
      if (!groups.has(item.seriesId)) {
        groups.set(item.seriesId, {
          seriesId: String(item.seriesId),
          title: item.title || "",
        });
      }
    }
  }
  return [...groups.values()];
}

function normalizeSyncTrigger(value) {
  return ["login", "manual", "cron"].includes(value) ? value : "manual";
}

function syncTriggerLabel(trigger) {
  return {
    login: "登录同步",
    manual: "手动同步",
    cron: "自动同步",
  }[trigger] || "账号同步";
}

function syncResultMessage(trigger, result) {
  const prefix = syncTriggerLabel(trigger);
  const counts = `导入 ${result.importedCount || 0} 部，同步到账号 ${
    result.uploadedCount || 0
  } 部，从账号移除 ${result.removedRemoteCount || 0} 项`;
  if (result.result === "error") {
    return `${prefix}未完成：${result.errors?.[0] || "账号数据暂时无法同步"}`;
  }
  if (
    result.result === "success" &&
    !result.importedCount &&
    !result.uploadedCount &&
    !result.removedRemoteCount &&
    !result.removedLocalCount
  ) {
    return `${prefix}完成：本次没有需要同步的短剧变化。`;
  }
  if (result.result === "partial") {
    return `${prefix}部分完成：${counts}，账号删除移出 ${
      result.removedLocalCount || 0
    } 部，有 ${result.errors?.length || 0} 项未完成。`;
  }
  return `${prefix}完成：${counts}，账号删除移出 ${
    result.removedLocalCount || 0
  } 部。`;
}

function syncItemKey(item) {
  if (item.subscriptionId) {
    return `subscription:${item.subscriptionId}`;
  }
  if (item.title) {
    return `title:${item.title}`;
  }
  if (item.seriesId) {
    return `series:${item.seriesId}`;
  }
  return `message:${item.message}`;
}

function mergeSyncItem(items, item) {
  const normalized = {
    kind: [
      "imported",
      "uploaded",
      "removed",
    "removedLocal",
      "skipped",
      "failed",
    ].includes(item.kind)
      ? item.kind
      : "failed",
    title: String(item.title || "").trim(),
    subscriptionId: item.subscriptionId
      ? String(item.subscriptionId)
      : null,
    seriesId: item.seriesId ? String(item.seriesId) : null,
    message: String(item.message || "").trim(),
  };
  const key = syncItemKey(normalized);
  const existing = items.find((entry) => syncItemKey(entry) === key);
  if (!existing) {
    items.push(normalized);
    return normalized;
  }
  existing.title ||= normalized.title;
  existing.subscriptionId ||= normalized.subscriptionId;
  existing.seriesId ||= normalized.seriesId;
  if (
    normalized.kind === "failed" &&
    existing.kind !== "failed"
  ) {
    existing.kind = "failed";
  } else if (
    normalized.kind === "imported" &&
    existing.kind !== "imported"
  ) {
    existing.kind = "imported";
  } else if (
    normalized.kind === "removedLocal" &&
    existing.kind !== "removedLocal"
  ) {
    existing.kind = "removedLocal";
  }
  if (
    normalized.message &&
    !existing.message.includes(normalized.message)
  ) {
    existing.message = existing.message
      ? `${existing.message} ${normalized.message}`
      : normalized.message;
  }
  return existing;
}

function importOutcomeKind(status) {
  return {
    imported: "imported",
    skipped: "skipped",
    failed: "failed",
  }[status] || "failed";
}

export class AccountSyncService {
  constructor({
    store,
    accountService,
    reminderService,
    screenshotImport,
    systemLog = null,
    removeSubscription = null,
    now = () => new Date(),
    timers = { setTimeout, clearTimeout },
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  }) {
    this.store = store;
    this.accountService = accountService;
    this.reminderService = reminderService;
    this.screenshotImport = screenshotImport;
    this.systemLog = systemLog;
    this.removeSubscription =
      removeSubscription ||
      (typeof reminderService?.removeSubscription === "function"
        ? reminderService.removeSubscription.bind(reminderService)
        : null);
    this.now = now;
    this.timers = timers;
    this.retryDelayMs = retryDelayMs;
    this.operation = null;
    this.schedulerTimer = null;
    this.nextSyncAt = null;
    this.stopped = true;
  }

  async writeSystemLog(entry) {
    if (!this.systemLog) {
      return;
    }
    try {
      await this.systemLog.append(entry);
    } catch (error) {
      console.error(
        `系统操作日志写入失败：${error?.message || "未知错误"}`,
      );
    }
  }

  enqueue(task) {
    if (this.operation) {
      throw syncError(
        "账号同步正在进行，请稍候。",
        "ACCOUNT_SYNC_BUSY",
        429,
      );
    }
    this.operation = Promise.resolve().then(task);
    return this.operation.finally(() => {
      this.operation = null;
    });
  }

  async sync(options = {}) {
    return this.enqueue(() => this.runSync(options));
  }

  async runSync({ trigger = "manual" } = {}) {
    trigger = normalizeSyncTrigger(trigger);
    const startedAt = this.now().toISOString();
    const syncId = createId("sync_");
    await this.store.mutate((state) => {
      state.settings.accountSync.lastStartedAt = startedAt;
      state.settings.accountSync.lastError = null;
    });

    const errors = [];
    let importedCount = 0;
    let uploadedCount = 0;
    let removedRemoteCount = 0;
    let removedLocalCount = 0;
    const syncItems = [];

    try {
      const retryResult = await this.flushDeleteRetries();
      removedRemoteCount += retryResult.removedCount;
      errors.push(...retryResult.errors);
      for (const item of retryResult.items || []) {
        mergeSyncItem(syncItems, item);
      }

      const snapshot = await this.accountService.refresh();
      const categories = snapshot.snapshot?.categories || {};
      const categoryErrors = failedCategories(snapshot.snapshot);
      errors.push(...categoryErrors);
      if (
        !Object.values(categories).some(
          (category) => category?.status === "ok",
        )
      ) {
        throw syncError(
          categoryErrors[0] || "账号收藏和预约记录暂时无法读取。",
          "ACCOUNT_SYNC_READ_FAILED",
        );
      }

      const stateBeforeAccountChanges = await this.store.read();
      const baseline =
        stateBeforeAccountChanges.settings.accountSync.syncBaseline;
      const remoteDeletedIds = deletedBaselineSeriesIds(
        baseline,
        snapshot.snapshot,
      );
      const hasCategoryFailure = categoryErrors.length > 0;
      const holdRemoteDeletion =
        hasCategoryFailure && remoteDeletedIds.size > 0;
      const accountRemovedSubscriptionIds = new Set();
      let workingSnapshot = snapshot.snapshot;

      if (remoteDeletedIds.size && !hasCategoryFailure) {
        const currentRemoteIds =
          combinedRemoteIds(snapshot.snapshot) || new Set();
        for (const subscription of stateBeforeAccountChanges.subscriptions) {
          const seriesIds = allSeriesIds(subscription);
          if (
            !seriesIds.some((seriesId) =>
              remoteDeletedIds.has(seriesId),
            ) ||
            seriesIds.some((seriesId) =>
              currentRemoteIds.has(seriesId),
            )
          ) {
            continue;
          }
          const title = subscriptionTitle(subscription);
          try {
            if (!this.removeSubscription) {
              throw new Error("本地追更删除服务不可用。");
            }
            await this.removeSubscription(subscription.id);
            accountRemovedSubscriptionIds.add(subscription.id);
            removedLocalCount += 1;
            mergeSyncItem(syncItems, {
              kind: "removedLocal",
              title,
              subscriptionId: subscription.id,
              seriesId: seriesIds[0] || null,
              message:
                "账号中已取消该系列的收藏和预约，因此同步移出我的追更。",
            });
          } catch (error) {
            errors.push(`《${title}》移出追更失败：${error.message}`);
            mergeSyncItem(syncItems, {
              kind: "failed",
              title,
              subscriptionId: subscription.id,
              seriesId: seriesIds[0] || null,
              message: `账号侧删除已确认，但本地移出失败：${error.message}`,
            });
          }
        }
      }

      const stateBeforeDeletionSync = await this.store.read();
      const currentSubscriptionsById = new Map(
        stateBeforeDeletionSync.subscriptions.map((subscription) => [
          subscription.id,
          subscription,
        ]),
      );
      const pendingRemoteDeletionIds = new Set(
        stateBeforeDeletionSync.settings.accountSync.deleteRetries.map(
          (entry) => entry.subscriptionId,
        ),
      );
      const protectedDeletedSeriesIds = new Set();
      let queuedRemoteDeletion = false;
      for (const entry of localBaselineEntries(baseline)) {
        if (
          currentSubscriptionsById.has(entry.subscriptionId) ||
          accountRemovedSubscriptionIds.has(entry.subscriptionId)
        ) {
          continue;
        }
        for (const seriesId of entry.seriesIds || []) {
          protectedDeletedSeriesIds.add(seriesId);
        }
        if (pendingRemoteDeletionIds.has(entry.subscriptionId)) {
          continue;
        }
        const knownRemoteIds = combinedRemoteIds(snapshot.snapshot);
        const remoteStillHasSeries = (entry.seriesIds || []).some(
          (seriesId) => knownRemoteIds?.has(seriesId),
        );
        if (!hasCategoryFailure && knownRemoteIds && !remoteStillHasSeries) {
          continue;
        }
        await this.queueRemoteDeletion(
          {
            id: entry.subscriptionId,
            title: entry.title,
            seriesGroupId: entry.seriesGroupId,
            firstSeasonId: entry.seriesIds?.[0] || null,
            seasons: (entry.seriesIds || []).slice(1).map((seriesId) => ({
              seriesId,
            })),
          },
          { flush: false },
        );
        queuedRemoteDeletion = true;
      }
      if (queuedRemoteDeletion) {
        const deletionResult = await this.flushDeleteRetries();
        removedRemoteCount += deletionResult.removedCount;
        errors.push(...deletionResult.errors);
        for (const item of deletionResult.items || []) {
          mergeSyncItem(syncItems, item);
        }
        const afterDeletion = await this.accountService.refresh();
        workingSnapshot =
          afterDeletion.snapshot || workingSnapshot;
        for (const message of failedCategories(workingSnapshot)) {
          if (!errors.includes(message)) {
            errors.push(message);
          }
        }
      }

      const stateBeforeImport = await this.store.read();
      const knownSeriesIds = new Set(
        stateBeforeImport.subscriptions.flatMap(allSeriesIds),
      );
      const remoteGroups = remoteImportGroups(workingSnapshot);
      const remoteTitlesBySeriesId = new Map(
        remoteGroups.map((item) => [item.seriesId, item.title]),
      );
      const importCandidates = remoteGroups
        .filter(
          (item) =>
            !knownSeriesIds.has(item.seriesId) &&
            !protectedDeletedSeriesIds.has(item.seriesId),
        )
        .map((item) => item.seriesId);
      if (importCandidates.length) {
        const imported = await this.screenshotImport.importSeriesIds(
          importCandidates,
          this.reminderService,
        );
        importedCount =
          Number(imported.importedCount) ||
          Number(imported.imported) ||
          0;
        if (imported.failedCount) {
          errors.push(
            `${imported.failedCount} 部账号剧集导入失败。`,
          );
        }
        if (imported.checkErrors) {
          errors.push(
            `${imported.checkErrors} 部账号剧集的同系列季度暂未核验完整，系统会自动重试。`,
          );
        }
        for (const outcome of imported.outcomes || []) {
          mergeSyncItem(syncItems, {
            kind: importOutcomeKind(outcome.status),
            title:
              outcome.title ||
              remoteTitlesBySeriesId.get(String(outcome.seriesId)) ||
              "未命名短剧",
            subscriptionId: outcome.subscriptionId || null,
            seriesId: outcome.seriesId || null,
            message: outcome.message || "",
          });
        }
      }

      const stateForFavorites = await this.store.read();
      const remoteFavoriteIds = categoryIds(workingSnapshot, "favorites");
      const hasLocalBaseline = Array.isArray(
        baseline?.localSubscriptions,
      );
      const previousLocalIds = new Set(
        localBaselineEntries(baseline).map(
          (entry) => entry.subscriptionId,
        ),
      );
      const localAdditionIds = new Set(
        stateBeforeAccountChanges.subscriptions
          .filter(
            (subscription) =>
              !hasLocalBaseline ||
              !previousLocalIds.has(subscription.id),
          )
          .map((subscription) => subscription.id),
      );
      const writeCandidates = [];
      for (const subscription of stateForFavorites.subscriptions) {
        if (!localAdditionIds.has(subscription.id)) {
          continue;
        }
        const [firstSeasonId] = firstSeasonIds(subscription);
        if (!firstSeasonId) {
          continue;
        }
        const seriesIds = allSeriesIds(subscription);
        const needsFavorite =
          remoteFavoriteIds !== null &&
          !holdRemoteDeletion &&
          !seriesIds.some((seriesId) =>
            remoteFavoriteIds.has(seriesId),
          );
        if (!needsFavorite || holdRemoteDeletion) {
          continue;
        }
        writeCandidates.push({
          subscription,
          firstSeasonId,
          needsFavorite,
        });
      }

      const credentials = writeCandidates.length
        ? this.accountService.requireCredentials()
        : null;
      for (const candidate of writeCandidates) {
        const title = subscriptionTitle(candidate.subscription);
        if (candidate.needsFavorite) {
          try {
            await this.accountService.setFavorite(
              credentials,
              candidate.firstSeasonId,
              true,
              { verify: false },
            );
          } catch (error) {
            candidate.favoriteError = error;
            errors.push(`《${title}》收藏同步失败：${error.message}`);
          }
        }
      }

      let finalSnapshot = workingSnapshot;
      if (writeCandidates.length) {
        const verification = await this.accountService.refresh();
        finalSnapshot = verification.snapshot || finalSnapshot;
        const verifiedFavoriteIds = categoryIds(
          verification.snapshot,
          "favorites",
        );
        for (const candidate of writeCandidates) {
          const favoriteReady =
            !candidate.needsFavorite ||
            (verifiedFavoriteIds !== null &&
              verifiedFavoriteIds.has(candidate.firstSeasonId));
          if (favoriteReady) {
            uploadedCount += 1;
            mergeSyncItem(syncItems, {
              kind: "uploaded",
              title: subscriptionTitle(candidate.subscription),
              subscriptionId: candidate.subscription.id,
              seriesId: candidate.firstSeasonId,
              message: "已将系列收藏写入红果账号。",
            });
          } else {
            const title = subscriptionTitle(candidate.subscription);
            const failedOperations = [];
            if (!favoriteReady && !candidate.favoriteError) {
              const message = `《${title}》收藏写入后未在账号中确认。`;
              errors.push(message);
              failedOperations.push("收藏未能确认");
            }
            if (candidate.favoriteError) {
              failedOperations.push("收藏写入失败");
            }
            mergeSyncItem(syncItems, {
              kind: "failed",
              title,
              subscriptionId: candidate.subscription.id,
              seriesId: candidate.firstSeasonId,
              message: `${failedOperations.join("，") || "账号写入未完成"}。`,
            });
          }
        }
      }

      const completedAt = this.now().toISOString();
      const stateBeforeSave = await this.store.read();
      const previousBaseline =
        stateBeforeSave.settings.accountSync.syncBaseline;
      const nextBaseline = {
        initializedAt:
          previousBaseline?.initializedAt || completedAt,
        updatedAt: completedAt,
        favorites: previousBaseline?.favorites || null,
        reservationsOnline:
          previousBaseline?.reservationsOnline || null,
        reservationsUpcoming:
          previousBaseline?.reservationsUpcoming || null,
        localSubscriptions: [],
      };
      for (const key of REMOTE_CATEGORY_KEYS) {
        const current = holdRemoteDeletion
          ? null
          : categoryIds(finalSnapshot, key);
        if (current !== null) {
          nextBaseline[key] = [...current].sort();
        }
      }
      const nextLocalSubscriptions = new Map(
        stateBeforeSave.subscriptions.map((subscription) => [
          subscription.id,
          localBaselineEntry(subscription),
        ]),
      );
      const pendingAfterSync = new Set(
        stateBeforeSave.settings.accountSync.deleteRetries.map(
          (entry) => entry.subscriptionId,
        ),
      );
      for (const entry of localBaselineEntries(previousBaseline)) {
        if (
          !nextLocalSubscriptions.has(entry.subscriptionId) &&
          pendingAfterSync.has(entry.subscriptionId)
        ) {
          nextLocalSubscriptions.set(entry.subscriptionId, entry);
        }
      }
      nextBaseline.localSubscriptions = [
        ...nextLocalSubscriptions.values(),
      ];

      const result =
        errors.length === 0
          ? "success"
          : importedCount ||
              uploadedCount ||
              removedRemoteCount ||
              removedLocalCount
            ? "partial"
            : "error";
      await this.store.mutate((currentState) => {
        const historyEntry = {
          id: syncId,
          trigger,
          startedAt,
          completedAt,
          result,
          importedCount,
          uploadedCount,
          removedRemoteCount,
          removedLocalCount,
          errors,
          items: syncItems,
        };
        currentState.settings.accountSync = {
          ...currentState.settings.accountSync,
          lastCompletedAt: completedAt,
          lastResult: result,
          lastError: errors[0] || null,
          importedCount,
          uploadedCount,
          removedRemoteCount:
            currentState.settings.accountSync.removedRemoteCount +
            removedRemoteCount,
          removedLocalCount:
            currentState.settings.accountSync.removedLocalCount +
            removedLocalCount,
          syncBaseline: nextBaseline,
          history: [
            historyEntry,
            ...(currentState.settings.accountSync.history || []),
          ].slice(0, 20),
        };
      });
      await this.writeSystemLog({
        category: "account",
        action: "account.sync.completed",
        level:
          result === "success"
            ? "success"
            : result === "partial"
              ? "warning"
              : "error",
        message: syncResultMessage(trigger, {
          result,
          importedCount,
          uploadedCount,
          removedRemoteCount,
          removedLocalCount,
          errors,
        }),
        metadata: {
          syncId,
          trigger,
          result,
          importedCount,
          uploadedCount,
          removedRemoteCount,
          removedLocalCount,
        },
      });
      for (const item of syncItems) {
        const actionLabel = {
          imported: "导入",
          uploaded: "同步到账号",
          removed: "从账号移除",
          removedLocal: "账号删除后移出追更",
          skipped: "跳过",
          failed: "同步失败",
        }[item.kind];
        await this.writeSystemLog({
          category: "account",
          action: `account.sync.item.${item.kind}`,
          level:
            item.kind === "failed"
              ? "error"
              : item.kind === "skipped"
                ? "warning"
                : "success",
          message: `${syncTriggerLabel(trigger)}${actionLabel}《${
            item.title || "未命名短剧"
          }》${item.message ? `：${item.message}` : "。"}`,
          metadata: {
            syncId,
            subscriptionId: item.subscriptionId,
            seriesId: item.seriesId,
            kind: item.kind,
          },
        });
      }
      const resultMessage = syncResultMessage(trigger, {
        result,
        importedCount,
        uploadedCount,
        removedRemoteCount,
        removedLocalCount,
        errors,
      });
      return {
        id: syncId,
        trigger,
        result,
        importedCount,
        uploadedCount,
        removedRemoteCount,
        removedLocalCount,
        errors,
        items: syncItems,
        message: resultMessage,
      };
    } catch (error) {
      const completedAt = this.now().toISOString();
      const message = error?.message || "账号同步失败。";
      await this.store.mutate((currentState) => {
        const historyEntry = {
          id: syncId,
          trigger,
          startedAt,
          completedAt,
          result: "error",
          importedCount,
          uploadedCount,
          removedRemoteCount,
          removedLocalCount,
          errors: [...errors, message],
          items: syncItems,
        };
        currentState.settings.accountSync.lastCompletedAt = completedAt;
        currentState.settings.accountSync.lastResult = "error";
        currentState.settings.accountSync.lastError = message;
        currentState.settings.accountSync.history = [
          historyEntry,
          ...(currentState.settings.accountSync.history || []),
        ].slice(0, 20);
      });
      await this.writeSystemLog({
        category: "account",
        action: "account.sync.failed",
        level: "error",
        message: `账号同步失败：${message}`,
        metadata: {
          syncId,
          trigger,
          importedCount,
          uploadedCount,
          removedRemoteCount,
          removedLocalCount,
        },
      });
      throw error;
    }
  }

  async queueRemoteDeletion(
    subscription,
    { flush = true } = {},
  ) {
    const seriesIds = remoteDeletionSeriesIds(subscription);
    if (!seriesIds.length) {
      return;
    }
    await this.store.mutate((state) => {
      const existing = state.settings.accountSync.deleteRetries.find((entry) => {
        if (
          subscription.id &&
          entry.subscriptionId === subscription.id
        ) {
          return true;
        }
        return Boolean(
          subscription.seriesGroupId &&
            entry.seriesGroupId === subscription.seriesGroupId,
        );
      });
      if (existing) {
        const normalized = normalizeDeleteRetryEntry(existing);
        existing.seriesIds = [
          ...new Set([...normalized.seriesIds, ...seriesIds]),
        ];
        const pending = new Map(
          normalized.pendingOperations.map((operation) => [
            `${operation.seriesId}:${operation.operation}`,
            operation,
          ]),
        );
        for (const seriesId of seriesIds) {
          for (const operation of ["favorite", "reservation"]) {
            pending.set(`${seriesId}:${operation}`, {
              seriesId,
              operation,
            });
          }
        }
        existing.pendingOperations = [...pending.values()];
        existing.lastError = null;
        existing.attempts = 0;
        return;
      }
      const pendingOperations = seriesIds.flatMap((seriesId) =>
        ["favorite", "reservation"].map((operation) => ({
          seriesId,
          operation,
        })),
      );
      state.settings.accountSync.deleteRetries.push({
        subscriptionId: subscription.id,
        title: subscriptionTitle(subscription),
        seriesGroupId: subscription.seriesGroupId || null,
        seriesIds,
        pendingOperations,
        createdAt: this.now().toISOString(),
        attempts: 0,
        lastError: null,
      });
    });
    await this.writeSystemLog({
      category: "account",
      action: "account.remote-delete.queued",
      message: `已安排从红果账号移除《${subscriptionTitle(subscription)}》的收藏和预约。`,
      metadata: {
        subscriptionId: subscription.id || null,
      },
    });
    if (flush) {
      void this.flushDeleteRetries().catch(() => {});
    }
  }

  async flushDeleteRetries() {
    const state = await this.store.read();
    const retries = state.settings.accountSync.deleteRetries.map(
      normalizeDeleteRetryEntry,
    );
    if (!retries.length) {
      return { removedCount: 0, errors: [], items: [] };
    }
    const remaining = new Map();
    const errors = [];
    const items = [];
    let removedCount = 0;
    let credentials;
    try {
      credentials = this.accountService.requireCredentials();
    } catch (error) {
      for (const entry of retries) {
        remaining.set(entry.subscriptionId, {
          ...entry,
          attempts: entry.attempts + 1,
          lastError: error.message,
        });
      }
      errors.push(`账号远端清理待登录后重试：${error.message}`);
      for (const entry of retries) {
        items.push({
          kind: "failed",
          title: entry.title,
          subscriptionId: entry.subscriptionId,
          seriesId: null,
          message: "账号远端清理待登录后重试。",
        });
      }
      await this.replaceProcessedDeleteRetries(retries, remaining);
      return { removedCount, errors, items };
    }
    for (let entryIndex = 0; entryIndex < retries.length; entryIndex += 1) {
      const entry = retries[entryIndex];
      const pending = new Map(
        entry.pendingOperations.map((operation) => [
          `${operation.seriesId}:${operation.operation}`,
          operation,
        ]),
      );
      const entryErrors = [];
      let stopForSession = false;
      for (const operation of entry.pendingOperations) {
        try {
          if (operation.operation === "favorite") {
            await this.accountService.setFavorite(
              credentials,
              operation.seriesId,
              false,
              { verify: false },
            );
          } else {
            await this.accountService.setReservation(
              credentials,
              operation.seriesId,
              false,
              { verify: false },
            );
          }
          pending.delete(
            `${operation.seriesId}:${operation.operation}`,
          );
          removedCount += 1;
        } catch (error) {
          entryErrors.push(error.message);
          if (sessionError(error)) {
            stopForSession = true;
            break;
          }
        }
      }
      if (entryErrors.length || pending.size) {
        remaining.set(entry.subscriptionId, {
          ...entry,
          pendingOperations: [...pending.values()],
          attempts: entry.attempts + 1,
          lastError: entryErrors[0] || "部分远端清理操作尚未完成。",
        });
        errors.push(
          `《${entry.title || entry.seriesGroupId || entry.subscriptionId}》远端清理待重试：${entryErrors[0] || "部分远端清理操作尚未完成。"}`,
        );
        items.push({
          kind: "failed",
          title: entry.title,
          subscriptionId: entry.subscriptionId,
          seriesId: null,
          message: `远端清理待重试：${entryErrors[0] || "部分操作尚未完成。"}`,
        });
      } else {
        items.push({
          kind: "removed",
          title: entry.title,
          subscriptionId: entry.subscriptionId,
          seriesId: null,
          message: "已从红果账号移除收藏和预约。",
        });
      }
      if (stopForSession) {
        for (const pendingEntry of retries.slice(entryIndex + 1)) {
          remaining.set(pendingEntry.subscriptionId, {
            ...pendingEntry,
            attempts: pendingEntry.attempts + 1,
            lastError: entryErrors[0] || "账号登录态已失效。",
          });
          items.push({
            kind: "failed",
            title: pendingEntry.title,
            subscriptionId: pendingEntry.subscriptionId,
            seriesId: null,
            message: "账号登录态已失效，远端清理待重试。",
          });
        }
        break;
      }
    }
    await this.replaceProcessedDeleteRetries(retries, remaining);
    for (const item of items) {
      await this.writeSystemLog({
        category: "account",
        action:
          item.kind === "removed"
            ? "account.remote-delete.completed"
            : "account.remote-delete.failed",
        level: item.kind === "removed" ? "success" : "warning",
        message: item.title
          ? `《${item.title}》${item.message}`
          : item.message,
        metadata: {
          subscriptionId: item.subscriptionId,
        },
      });
    }
    return { removedCount, errors, items };
  }

  async replaceProcessedDeleteRetries(processed, remaining) {
    const processedIds = new Set(
      processed.map((entry) => entry.subscriptionId),
    );
    await this.store.mutate((currentState) => {
      const untouched = currentState.settings.accountSync.deleteRetries.filter(
        (entry) => !processedIds.has(entry.subscriptionId),
      );
      currentState.settings.accountSync.deleteRetries = [
        ...untouched,
        ...remaining.values(),
      ];
    });
  }

  async updateSettings(patch) {
    const value = normalizeCronExpression(patch.accountSyncCron);
    if (!isValidCronExpression(value, this.now())) {
      throw syncError(
        "账号同步计划需要使用有效的 5 段 Cron 表达式。",
        "INVALID_ACCOUNT_SYNC_CRON",
        400,
      );
    }
    await this.store.mutate((state) => {
      state.settings.accountSyncCron = value;
    });
    await this.reschedule();
    return value;
  }

  async status() {
    const state = await this.store.read();
    const accountSync = state.settings.accountSync;
    const legacyLatest =
      !accountSync.history?.length && accountSync.lastCompletedAt
        ? {
            id: `legacy-${accountSync.lastCompletedAt}`,
            trigger: null,
            startedAt:
              accountSync.lastStartedAt || accountSync.lastCompletedAt,
            completedAt: accountSync.lastCompletedAt,
            result: accountSync.lastResult || "error",
            importedCount: accountSync.importedCount || 0,
            uploadedCount: accountSync.uploadedCount || 0,
            removedRemoteCount: 0,
            removedLocalCount: 0,
            errors: accountSync.lastError
              ? [accountSync.lastError]
              : [],
            items: [],
          }
        : null;
    return {
      cron: state.settings.accountSyncCron || DEFAULT_ACCOUNT_SYNC_CRON,
      nextSyncAt: this.nextSyncAt,
      running: Boolean(this.operation),
      latest: accountSync.history?.[0] || legacyLatest,
      ...accountSync,
    };
  }

  async start() {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    await this.reschedule();
  }

  stop() {
    this.stopped = true;
    this.nextSyncAt = null;
    if (this.schedulerTimer) {
      this.timers.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async reschedule() {
    if (this.schedulerTimer) {
      this.timers.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.stopped) {
      return;
    }
    const state = await this.store.read();
    const next = nextCronOccurrence(
      state.settings.accountSyncCron || DEFAULT_ACCOUNT_SYNC_CRON,
      this.now(),
    );
    this.nextSyncAt = next.toISOString();
    const delay = Math.max(1_000, next.getTime() - this.now().getTime());
    this.schedulerTimer = this.timers.setTimeout(async () => {
      this.schedulerTimer = null;
      try {
        if (this.accountService.status().authenticated) {
          await this.sync({ trigger: "cron" });
        }
      } catch {
        // Keep the next Cron occurrence active after transient failures.
      } finally {
        await this.reschedule();
      }
    }, delay);
    this.schedulerTimer?.unref?.();
  }
}
