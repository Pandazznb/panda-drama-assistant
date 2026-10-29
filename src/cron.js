import { CronExpressionParser } from "cron-parser";
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
} from "./constants.js";
import { normalizeWhitespace } from "./utils.js";

export const CRON_TIME_ZONE = "Asia/Shanghai";
export const DISCOVERY_REMINDER_CRON_TIME_ZONE = CRON_TIME_ZONE;

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
    tz: CRON_TIME_ZONE,
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

export function legacyIntervalMinutesToCron(value) {
  const minutes = Number(value);
  if (
    !Number.isInteger(minutes) ||
    minutes < MIN_INTERVAL_MINUTES ||
    minutes > MAX_INTERVAL_MINUTES
  ) {
    return null;
  }
  if (minutes < 60) {
    return 60 % minutes === 0
      ? `*/${minutes} * * * *`
      : null;
  }
  if (minutes === 60) {
    return "0 * * * *";
  }
  if (minutes % 60 === 0 && minutes < 1440) {
    return `0 */${minutes / 60} * * *`;
  }
  if (minutes === 1440) {
    return "0 0 * * *";
  }
  if (minutes === 10_080) {
    return "0 0 * * 0";
  }
  return null;
}
