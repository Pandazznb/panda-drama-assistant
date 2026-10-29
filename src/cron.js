import { CronExpressionParser } from "cron-parser";
import { normalizeWhitespace } from "./utils.js";

export const DISCOVERY_REMINDER_CRON_TIME_ZONE = "Asia/Shanghai";

export function normalizeCronExpression(value) {
  return normalizeWhitespace(value);
}

export function parseCronExpression(value, currentDate = new Date()) {
  const expression = normalizeCronExpression(value);
  if (!expression || expression.split(" ").length !== 5) {
    throw new Error("Cron 表达式必须使用 5 段格式。");
  }

  return CronExpressionParser.parse(expression, {
    currentDate,
    tz: DISCOVERY_REMINDER_CRON_TIME_ZONE,
  });
}

export function isValidCronExpression(value, currentDate = new Date()) {
  try {
    parseCronExpression(value, currentDate).next();
    return true;
  } catch {
    return false;
  }
}

export function nextCronOccurrence(value, currentDate = new Date()) {
  return parseCronExpression(value, currentDate).next().toDate();
}
