const DEFAULT_FORECAST_DAYS = 90;
const MAX_FORECAST_ENTRIES = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_BY_CHARACTER = new Map([
  ["日", 0],
  ["天", 0],
  ["一", 1],
  ["二", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
]);
const NUMBER_DIGITS = new Map([
  ["零", 0],
  ["〇", 0],
  ["一", 1],
  ["二", 2],
  ["两", 2],
  ["三", 3],
  ["四", 4],
  ["五", 5],
  ["六", 6],
  ["七", 7],
  ["八", 8],
  ["九", 9],
]);

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[０-９]/g, (character) =>
      String(character.charCodeAt(0) - 0xff10),
    )
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSmallNumber(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  if (/^\d+$/u.test(text)) {
    return Number(text);
  }
  if (text === "十") {
    return 10;
  }
  let total = 0;
  let current = 0;
  for (const character of text) {
    if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    const digit = NUMBER_DIGITS.get(character);
    if (digit === undefined) {
      return null;
    }
    current = current * 10 + digit;
  }
  return total + current;
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(dateKey || ""));
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function formatDateKey(date) {
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateKey, amount) {
  const parts = parseDateKey(dateKey);
  if (!parts) {
    return null;
  }
  return formatDateKey(
    new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day) +
        amount * DAY_MS,
    ),
  );
}

function dayOfWeek(dateKey) {
  const parts = parseDateKey(dateKey);
  return parts
    ? new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day),
      ).getUTCDay()
    : null;
}

function dateKeyInShanghai(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function parseWeekdayList(value) {
  const weekdays = new Set();
  const normalized = normalizeText(value);
  const rangePattern =
    /([一二三四五六日天])\s*(?:至|到|-|~)\s*(?:周|星期|礼拜)?\s*([一二三四五六日天])/gu;
  let rangeMatch;
  while ((rangeMatch = rangePattern.exec(normalized))) {
    const start = WEEKDAY_BY_CHARACTER.get(rangeMatch[1]);
    const end = WEEKDAY_BY_CHARACTER.get(rangeMatch[2]);
    if (start === undefined || end === undefined) {
      continue;
    }
    let weekday = start;
    weekdays.add(weekday);
    while (weekday !== end && weekdays.size <= 7) {
      weekday = (weekday + 1) % 7;
      weekdays.add(weekday);
    }
  }
  for (const character of normalized.replace(rangePattern, "")) {
    const weekday = WEEKDAY_BY_CHARACTER.get(character);
    if (weekday !== undefined) {
      weekdays.add(weekday);
    }
  }
  return [...weekdays].sort((left, right) => left - right);
}

function parseScheduleTime(value) {
  const normalized = normalizeText(value);
  const exactMatch = /(?:^|[^\d])([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?!\d)/u.exec(
    normalized,
  );
  if (exactMatch) {
    return {
      hour: Number(exactMatch[1]),
      minute: Number(exactMatch[2]),
      known: true,
    };
  }

  const chineseMatch =
    /(凌晨|早上|上午|中午|下午|晚上)?\s*([零〇一二两三四五六七八九十\d]{1,3})\s*点\s*(?:(半)|([零〇一二两三四五六七八九十\d]{1,3})\s*分?)?/u.exec(
      normalized,
    );
  if (!chineseMatch) {
    return { hour: 0, minute: 0, known: false };
  }
  let hour = parseSmallNumber(chineseMatch[2]);
  let minute = chineseMatch[3] ? 30 : parseSmallNumber(chineseMatch[4] || 0);
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 0, minute: 0, known: false };
  }
  const period = chineseMatch[1] || "";
  if (["下午", "晚上"].includes(period) && hour < 12) {
    hour += 12;
  } else if (period === "中午" && hour < 11) {
    hour += 12;
  } else if (period === "凌晨" && hour === 12) {
    hour = 0;
  }
  return { hour, minute, known: true };
}

function parseEpisodeBatch(value) {
  const match = /更新\s*(\d+)\s*集/u.exec(normalizeText(value));
  if (!match) {
    return null;
  }
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function seasonIsCompleted(season) {
  if (season?.status === "completed") {
    return true;
  }
  const rightText = normalizeText(season?.rightText).replace(
    /未完结/gu,
    "",
  );
  return /已完结|完结篇|全剧终/u.test(rightText);
}

function currentEpisodeCount(season) {
  for (const value of [
    season?.highWaterEpisodeCount,
    season?.episodeCount,
  ]) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) {
      return Math.floor(number);
    }
  }
  return null;
}

function confirmedTotalEpisodeCount(season, currentCount) {
  const total = Number(season?.totalEpisodeCount);
  return Number.isFinite(total) &&
    Number.isInteger(total) &&
    total > currentCount
    ? total
    : null;
}

function occurrenceInstant(dateKey, hour, minute) {
  return Date.parse(
    `${dateKey}T${String(hour).padStart(2, "0")}:${String(
      minute,
    ).padStart(2, "0")}:00+08:00`,
  );
}

/**
 * Parses only explicit recurring rules. Vague marketing copy returns null.
 */
export function parseUpdateRule(value) {
  const ruleText = normalizeText(value);
  if (!ruleText || ruleText.length > 80) {
    return null;
  }

  const daily = /每日|每天|日更/u.test(ruleText);
  const weekdayMatch =
    /每(?:周|星期|礼拜)\s*([一二三四五六日天](?:\s*(?:、|,|，|和|及|至|到|-|~)\s*(?:周|星期|礼拜)?\s*[一二三四五六日天])*)/u.exec(
      ruleText,
    );
  const weekdays = weekdayMatch
    ? parseWeekdayList(weekdayMatch[1])
    : [];
  if (!daily && !weekdays.length) {
    return null;
  }

  const scheduleTime = parseScheduleTime(
    weekdays.length
      ? ruleText.slice(weekdayMatch.index + weekdayMatch[0].length)
      : ruleText,
  );
  return {
    ruleText,
    frequency: daily ? "daily" : "weekly",
    weekdays,
    hour: scheduleTime.hour,
    minute: scheduleTime.minute,
    timeKnown: scheduleTime.known,
    episodeBatch: parseEpisodeBatch(ruleText),
  };
}

/**
 * Builds a bounded forecast. A season with a confirmed remaining episode
 * count is capped at that total; otherwise the forecast is only a dated
 * estimate and is discarded automatically when the season is completed.
 */
export function buildSeasonUpdateSchedule({
  season,
  todayDateKey,
  now = new Date(),
  forecastDays = DEFAULT_FORECAST_DAYS,
}) {
  if (!season || seasonIsCompleted(season)) {
    return [];
  }
  const parsedRule = parseUpdateRule(season.updateRule);
  const startDateKey =
    parseDateKey(todayDateKey) && todayDateKey
      ? todayDateKey
      : dateKeyInShanghai(now);
  if (!parsedRule || !parseDateKey(startDateKey)) {
    return [];
  }

  const nowMs =
    now instanceof Date ? now.getTime() : Date.parse(String(now || ""));
  const boundedNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const days = Math.max(
    1,
    Math.min(366, Number(forecastDays) || DEFAULT_FORECAST_DAYS),
  );
  const endDateKey = addDays(startDateKey, days);
  const currentCount = currentEpisodeCount(season);
  const confirmedTotal = confirmedTotalEpisodeCount(
    season,
    currentCount,
  );
  let remaining =
    confirmedTotal !== null && currentCount !== null
      ? confirmedTotal - currentCount
      : null;
  let projectedEpisodeCount = currentCount;
  const entries = [];

  for (
    let dateKey = startDateKey;
    dateKey && dateKey <= endDateKey;
    dateKey = addDays(dateKey, 1)
  ) {
    if (entries.length >= MAX_FORECAST_ENTRIES) {
      break;
    }
    const weekday = dayOfWeek(dateKey);
    const matchesRule =
      parsedRule.frequency === "daily" ||
      parsedRule.weekdays.includes(weekday);
    if (!matchesRule) {
      continue;
    }
    const occurredAtMs = occurrenceInstant(
      dateKey,
      parsedRule.hour,
      parsedRule.minute,
    );
    if (
      dateKey === startDateKey &&
      parsedRule.timeKnown &&
      occurredAtMs <= boundedNowMs
    ) {
      continue;
    }

    let plannedEpisodes = parsedRule.episodeBatch;
    if (remaining !== null && plannedEpisodes !== null) {
      plannedEpisodes = Math.min(plannedEpisodes, remaining);
      if (plannedEpisodes <= 0) {
        break;
      }
      remaining -= plannedEpisodes;
    }
    if (
      projectedEpisodeCount !== null &&
      plannedEpisodes !== null
    ) {
      projectedEpisodeCount += plannedEpisodes;
    }

    entries.push({
      dateKey,
      occurredAt: new Date(occurredAtMs).toISOString(),
      timeKnown: parsedRule.timeKnown,
      timeLabel: parsedRule.timeKnown
        ? `${String(parsedRule.hour).padStart(2, "0")}:${String(
            parsedRule.minute,
          ).padStart(2, "0")}`
        : "",
      plannedEpisodes,
      projectedEpisodeCount:
        parsedRule.episodeBatch === null
          ? null
          : projectedEpisodeCount,
      ruleText: parsedRule.ruleText,
      confirmedTotalEpisodeCount: confirmedTotal,
    });
    if (remaining === 0) {
      break;
    }
  }
  return entries;
}
