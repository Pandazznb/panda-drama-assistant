import { isPlainObject } from "./utils.js";

export const NOTIFICATION_TEMPLATE_TYPES = Object.freeze([
  "detailed",
  "batch",
  "reminder",
]);
export const NOTIFICATION_TEMPLATE_FIELDS = Object.freeze([
  "title",
  "body",
  "seasonLine",
  "episodeLine",
  "completedLine",
]);
export const MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH = 80;
export const MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH = 1_200;
export const MAX_NOTIFICATION_TEMPLATE_LINE_LENGTH = 300;

const SHELL_VARIABLES = Object.freeze({
  detailed: Object.freeze([
    "appName",
    "seriesTitle",
    "checkTime",
    "updates",
    "seasonCount",
    "updateCount",
    "updateDate",
    "updateTime",
  ]),
  batch: Object.freeze([
    "appName",
    "checkTime",
    "updateCount",
    "updates",
    "updateDate",
    "updateTime",
  ]),
  reminder: Object.freeze([
    "appName",
    "reminderTime",
    "updateCount",
    "updates",
    "updateDate",
    "updateTime",
  ]),
});
const LINE_VARIABLES = Object.freeze([
  "appName",
  "seriesTitle",
  "seasonTitle",
  "eventLabel",
  "episodeCount",
  "addedEpisodeCount",
  "seasonCount",
  "updatedAt",
  "updatedDate",
  "updatedTime",
  "updateText",
]);
export const NOTIFICATION_TEMPLATE_VARIABLES = Object.freeze(
  Object.fromEntries(
    NOTIFICATION_TEMPLATE_TYPES.map((type) => [
      type,
      Object.freeze([
        ...new Set([
          ...SHELL_VARIABLES[type],
          ...LINE_VARIABLES,
        ]),
      ]),
    ]),
  ),
);
export const NOTIFICATION_TEMPLATE_FIELD_VARIABLES = Object.freeze(
  Object.fromEntries(
    NOTIFICATION_TEMPLATE_TYPES.map((type) => [
      type,
      Object.freeze({
        title: SHELL_VARIABLES[type],
        body: SHELL_VARIABLES[type],
        seasonLine: LINE_VARIABLES,
        episodeLine: LINE_VARIABLES,
        completedLine: LINE_VARIABLES,
      }),
    ]),
  ),
);

const TEMPLATE_LABELS = Object.freeze({
  detailed: "单系列详情",
  batch: "批量汇总",
  reminder: "持续提醒",
});
const TEMPLATE_FIELD_LABELS = Object.freeze({
  title: "标题",
  body: "正文",
  seasonLine: "新季条目",
  episodeLine: "集更新条目",
  completedLine: "完结条目",
});
const TEMPLATE_FIELD_MAX_LENGTHS = Object.freeze({
  title: MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH,
  body: MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH,
  seasonLine: MAX_NOTIFICATION_TEMPLATE_LINE_LENGTH,
  episodeLine: MAX_NOTIFICATION_TEMPLATE_LINE_LENGTH,
  completedLine: MAX_NOTIFICATION_TEMPLATE_LINE_LENGTH,
});
const TEMPLATE_VARIABLE_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export class NotificationTemplateError extends Error {
  constructor(message, code = "INVALID_NOTIFICATION_TEMPLATE") {
    super(message);
    this.name = "NotificationTemplateError";
    this.code = code;
    this.statusCode = 400;
  }
}

function normalizeTemplateText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function templateLength(value) {
  return [...value].length;
}

function validateTemplateVariables(type, field, value) {
  const allowed = new Set(
    NOTIFICATION_TEMPLATE_FIELD_VARIABLES[type][field],
  );
  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    if (!allowed.has(match[1])) {
      throw new NotificationTemplateError(
        `${TEMPLATE_LABELS[type]}的${TEMPLATE_FIELD_LABELS[field]}包含不支持的变量 {${match[1]}}。`,
        "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
      );
    }
  }
}

function validateTemplateField(type, field, value, maxLength) {
  const normalized = normalizeTemplateText(value);
  if (templateLength(normalized) > maxLength) {
    throw new NotificationTemplateError(
      `${TEMPLATE_LABELS[type]}的${TEMPLATE_FIELD_LABELS[field]}不能超过 ${maxLength} 个字符。`,
      "INVALID_NOTIFICATION_TEMPLATE_LENGTH",
    );
  }
  validateTemplateVariables(type, field, normalized);
  return normalized;
}

export function createDefaultNotificationTemplates() {
  return Object.fromEntries(
    NOTIFICATION_TEMPLATE_TYPES.map((type) => [
      type,
      Object.fromEntries(
        NOTIFICATION_TEMPLATE_FIELDS.map((field) => [field, ""]),
      ),
    ]),
  );
}

export function normalizeNotificationTemplates(input) {
  const source = isPlainObject(input) ? input : {};
  return Object.fromEntries(
    NOTIFICATION_TEMPLATE_TYPES.map((type) => {
      const template = isPlainObject(source[type]) ? source[type] : {};
      const legacyTemplate =
        template.seasonLine === undefined &&
        template.episodeLine === undefined &&
        template.completedLine === undefined;
      const legacyPlaceholderBody =
        legacyTemplate &&
        normalizeTemplateText(template.body).trim() === "{updates}";
      return [
        type,
        Object.fromEntries(
          NOTIFICATION_TEMPLATE_FIELDS.map((field) => [
            field,
            normalizeTemplateText(
              field === "body" && legacyPlaceholderBody
                ? ""
                : template[field],
            )
              .slice(0, TEMPLATE_FIELD_MAX_LENGTHS[field]),
          ]),
        ),
      ];
    }),
  );
}

export function validateNotificationTemplatesPatch(input) {
  if (!isPlainObject(input)) {
    throw new NotificationTemplateError(
      "通知模板格式不正确。",
      "INVALID_NOTIFICATION_TEMPLATE",
    );
  }

  const result = {};
  for (const type of NOTIFICATION_TEMPLATE_TYPES) {
    if (input[type] === undefined) {
      continue;
    }
    const template = input[type];
    if (!isPlainObject(template)) {
      throw new NotificationTemplateError(
        `${TEMPLATE_LABELS[type]}模板格式不正确。`,
        "INVALID_NOTIFICATION_TEMPLATE",
      );
    }

    const normalized = {};
    for (const field of NOTIFICATION_TEMPLATE_FIELDS) {
      if (template[field] === undefined) {
        continue;
      }
      normalized[field] = validateTemplateField(
        type,
        field,
        template[field],
        TEMPLATE_FIELD_MAX_LENGTHS[field],
      );
    }
    result[type] = normalized;
  }
  return result;
}

export function applyNotificationTemplatesPatch(current, patch) {
  const templates = normalizeNotificationTemplates(current);
  const normalizedPatch = validateNotificationTemplatesPatch(patch);
  for (const type of NOTIFICATION_TEMPLATE_TYPES) {
    if (!normalizedPatch[type]) {
      continue;
    }
    Object.assign(templates[type], normalizedPatch[type]);
  }
  return templates;
}

export function renderNotificationTemplate(template, variables = {}) {
  return normalizeTemplateText(template).replace(
    TEMPLATE_VARIABLE_PATTERN,
    (_match, name) => String(variables[name] ?? ""),
  );
}
