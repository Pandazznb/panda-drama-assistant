import { isPlainObject } from "./utils.js";

export const NOTIFICATION_TEMPLATE_TYPES = Object.freeze([
  "detailed",
  "batch",
  "reminder",
]);
export const MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH = 80;
export const MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH = 1_200;
export const NOTIFICATION_TEMPLATE_VARIABLES = Object.freeze({
  detailed: Object.freeze([
    "appName",
    "seriesTitle",
    "checkTime",
    "updates",
    "seasonCount",
  ]),
  batch: Object.freeze([
    "appName",
    "checkTime",
    "updateCount",
    "updates",
  ]),
  reminder: Object.freeze([
    "appName",
    "reminderTime",
    "updateCount",
    "updates",
  ]),
});

const TEMPLATE_LABELS = Object.freeze({
  detailed: "单系列详情",
  batch: "批量汇总",
  reminder: "持续提醒",
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
  const allowed = new Set(NOTIFICATION_TEMPLATE_VARIABLES[type]);
  for (const match of value.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    if (!allowed.has(match[1])) {
      throw new NotificationTemplateError(
        `${TEMPLATE_LABELS[type]}的${field}包含不支持的变量 {${match[1]}}。`,
        "INVALID_NOTIFICATION_TEMPLATE_VARIABLE",
      );
    }
  }
}

function validateTemplateField(type, field, value, maxLength) {
  const normalized = normalizeTemplateText(value);
  if (templateLength(normalized) > maxLength) {
    throw new NotificationTemplateError(
      `${TEMPLATE_LABELS[type]}的${field}不能超过 ${maxLength} 个字符。`,
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
      { title: "", body: "" },
    ]),
  );
}

export function normalizeNotificationTemplates(input) {
  const source = isPlainObject(input) ? input : {};
  return Object.fromEntries(
    NOTIFICATION_TEMPLATE_TYPES.map((type) => {
      const template = isPlainObject(source[type]) ? source[type] : {};
      return [
        type,
        {
          title: normalizeTemplateText(template.title).slice(
            0,
            MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH,
          ),
          body: normalizeTemplateText(template.body).slice(
            0,
            MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH,
          ),
        },
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
    if (template.title !== undefined) {
      normalized.title = validateTemplateField(
        type,
        "标题",
        template.title,
        MAX_NOTIFICATION_TEMPLATE_TITLE_LENGTH,
      );
    }
    if (template.body !== undefined) {
      normalized.body = validateTemplateField(
        type,
        "正文",
        template.body,
        MAX_NOTIFICATION_TEMPLATE_BODY_LENGTH,
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
