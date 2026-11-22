const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeDigits(value) {
  return String(value ?? "").replace(/[０-９]/g, (character) =>
    String(character.charCodeAt(0) - 0xff10),
  );
}

function parseDateKey(dateKey) {
  const match = DATE_KEY_PATTERN.exec(String(dateKey || ""));
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

function formatDateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

function validDateKey(year, month, day) {
  return parseDateKey(formatDateKey(year, month, day))
    ? formatDateKey(year, month, day)
    : null;
}

/**
 * Reads an explicit launch date from an account reservation description.
 * Month/day dates without a year roll to the next year after they pass.
 */
export function parseReservationExpectedDate(value, currentDateKey) {
  const current = parseDateKey(currentDateKey);
  if (!current) {
    return null;
  }
  const normalized = normalizeDigits(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const explicitYearMatch =
    /(?:^|[^\d])(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(
      normalized,
    );
  const numericDateMatch =
    /(?:^|[^\d])(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/.exec(
      normalized,
    );
  const monthDayMatch =
    /(?:^|[^\d])(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(normalized);

  let candidate = null;
  const exactMatch = explicitYearMatch || numericDateMatch;
  if (exactMatch) {
    candidate = validDateKey(
      Number(exactMatch[1]),
      Number(exactMatch[2]),
      Number(exactMatch[3]),
    );
    if (!candidate || candidate < currentDateKey) {
      return null;
    }
    return candidate;
  }

  if (!monthDayMatch) {
    return null;
  }
  const month = Number(monthDayMatch[1]);
  const day = Number(monthDayMatch[2]);
  let year = current.year;
  candidate = validDateKey(year, month, day);
  if (!candidate) {
    return null;
  }
  if (candidate < currentDateKey) {
    year += 1;
    candidate = validDateKey(year, month, day);
  }
  return candidate;
}

/**
 * Official placeholder seasons use the same item ID as upcoming reservations.
 * Only this explicit relationship is reliable enough for date placement.
 */
export function reservationPlaceholderId(value) {
  const match = /^reservation:(\d{8,25})$/u.exec(String(value || ""));
  return match ? match[1] : null;
}
