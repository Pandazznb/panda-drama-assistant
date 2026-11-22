import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH,
  MAX_NOTIFICATION_TEMPLATE_LINE_LENGTH,
  MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH,
  NotificationTemplateError,
  applyNotificationTemplatesPatch,
  createDefaultNotificationTemplates,
  normalizeNotificationTemplates,
  renderNotificationTemplate,
  validateNotificationTemplatesPatch,
} from "../src/notification-templates.js";

function emptyTemplate() {
  return {
    title: "",
    body: "",
    seasonLine: "",
    episodeLine: "",
    completedLine: "",
  };
}

function emptyTemplates() {
  return {
    detailed: emptyTemplate(),
    batch: emptyTemplate(),
    reminder: emptyTemplate(),
  };
}

function assertTemplateError(fn, code) {
  assert.throws(
    fn,
    (error) =>
      error instanceof NotificationTemplateError &&
      error.statusCode === 400 &&
      error.code === code,
  );
}

test("notification templates default to empty custom content", () => {
  const first = createDefaultNotificationTemplates();
  const second = createDefaultNotificationTemplates();

  assert.deepEqual(first, emptyTemplates());
  assert.notEqual(first, second);
  assert.notEqual(first.detailed, second.detailed);
});

test("notification templates normalize every field and ignore unknown content", () => {
  const normalized = normalizeNotificationTemplates({
    detailed: {
      title: "第一行\r\n第二行",
      body: "正文\r第三行",
      seasonLine: "新季\r\n条目",
      episodeLine: "集更新\r条目",
      completedLine: "完结\r\n条目",
      ignored: "不应保留",
    },
    unexpected: {
      title: "未知类型",
    },
  });

  assert.deepEqual(normalized, {
    detailed: {
      title: "第一行\n第二行",
      body: "正文\n第三行",
      seasonLine: "新季\n条目",
      episodeLine: "集更新\n条目",
      completedLine: "完结\n条目",
    },
    batch: emptyTemplate(),
    reminder: emptyTemplate(),
  });
});

test("legacy templates gain new fields and reset the old updates-only body placeholder", () => {
  const normalized = normalizeNotificationTemplates({
    detailed: {
      title: "旧详情标题",
      body: "{updates}",
    },
    batch: {
      title: "旧汇总标题",
      body: "保留这段自定义正文\n{updates}",
    },
  });

  assert.deepEqual(normalized.detailed, {
    ...emptyTemplate(),
    title: "旧详情标题",
  });
  assert.deepEqual(normalized.batch, {
    ...emptyTemplate(),
    title: "旧汇总标题",
    body: "保留这段自定义正文\n{updates}",
  });
  assert.deepEqual(normalizeNotificationTemplates(normalized), normalized);
});

test("notification template patches merge every field without replacing untouched fields", () => {
  const current = {
    detailed: {
      title: "原标题",
      body: "原正文",
      seasonLine: "原新季行",
      episodeLine: "原集更新行",
      completedLine: "原完结行",
    },
    batch: {
      title: "汇总标题",
      body: "汇总正文",
      seasonLine: "汇总新季行",
      episodeLine: "汇总集更新行",
      completedLine: "汇总完结行",
    },
    reminder: {
      title: "提醒标题",
      body: "提醒正文",
      seasonLine: "提醒新季行",
      episodeLine: "提醒集更新行",
      completedLine: "提醒完结行",
    },
  };
  const patch = validateNotificationTemplatesPatch({
    detailed: {
      body: "新正文",
      episodeLine: "{seriesTitle} +{addedEpisodeCount}集 {updatedTime}",
    },
    reminder: { title: "新提醒标题" },
  });
  const merged = applyNotificationTemplatesPatch(current, patch);

  assert.deepEqual(merged, {
    detailed: {
      ...current.detailed,
      body: "新正文",
      episodeLine: "{seriesTitle} +{addedEpisodeCount}集 {updatedTime}",
    },
    batch: current.batch,
    reminder: {
      ...current.reminder,
      title: "新提醒标题",
    },
  });
  assert.notEqual(merged.detailed, current.detailed);
});

test("notification template validation rejects unsupported variables per field", () => {
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        detailed: { body: "{seriesTitle} {unknownVariable}" },
      }),
    "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
  );
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        detailed: {
          seasonLine: "{checkTime}",
        },
      }),
    "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
  );
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        reminder: {
          completedLine: "{updates}",
        },
      }),
    "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
  );
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        batch: { title: "汇总 {seriesTitle}" },
      }),
    "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
  );
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        reminder: "不是对象",
      }),
    "INVALID_NOTIFICATION_TEMPLATE",
  );
});

test("notification template validation enforces all field lengths", () => {
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        detailed: {
          title: "剧".repeat(MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH + 1),
        },
      }),
    "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
  );
  assertTemplateError(
    () =>
      validateNotificationTemplatesPatch({
        reminder: {
          body: "剧".repeat(MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH + 1),
        },
      }),
    "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
  );
  for (const field of ["seasonLine", "episodeLine", "completedLine"]) {
    assertTemplateError(
      () =>
        validateNotificationTemplatesPatch({
          batch: {
            [field]: "剧".repeat(
              MAX_NOTIFICATION_TEMPLATE_LINE_LENGTH + 1,
            ),
          },
        }),
      "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
    );
  }
});

test("all notification template types render supported variables", () => {
  const variables = {
    appName: "短剧助手",
    seriesTitle: "万妖图录传",
    checkTime: "2026-11-01 08:30",
    reminderTime: "2026-11-01 09:00",
    updateCount: 2,
    updates: "1. 第一季更新\n2. 第二季完结",
    seasonCount: 6,
  };

  assert.equal(
    renderNotificationTemplate(
      "{appName}｜{seriesTitle}｜{checkTime}\n{updates}\n共 {seasonCount} 季",
      variables,
    ),
    "短剧助手｜万妖图录传｜2026-11-01 08:30\n1. 第一季更新\n2. 第二季完结\n共 6 季",
  );
  assert.equal(
    renderNotificationTemplate(
      "{appName}汇总：{updateCount} 个系列\n{checkTime}\n{updates}",
      variables,
    ),
    "短剧助手汇总：2 个系列\n2026-11-01 08:30\n1. 第一季更新\n2. 第二季完结",
  );
  assert.equal(
    renderNotificationTemplate(
      "{appName}提醒：{updateCount} 个系列\n{reminderTime}\n{updates}",
      variables,
    ),
    "短剧助手提醒：2 个系列\n2026-11-01 09:00\n1. 第一季更新\n2. 第二季完结",
  );
  assert.equal(
    renderNotificationTemplate("{missing}-{appName}", variables),
    "-短剧助手",
  );
});
