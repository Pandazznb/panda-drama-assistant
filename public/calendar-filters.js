export function isSeasonCalendarEntry(entry) {
  return (
    (entry?.type === "update" && entry?.kind === "season") ||
    entry?.type === "placeholder-schedule" ||
    entry?.type === "reservation"
  );
}

export function isEpisodeCalendarEntry(entry) {
  return entry?.type === "update" && entry?.kind === "episode";
}

export function filterCalendarEntries(entries, typeFilter) {
  const values = Array.isArray(entries) ? entries : [];
  if (typeFilter === "all") {
    return values;
  }
  if (typeFilter === "season") {
    return values.filter(isSeasonCalendarEntry);
  }
  if (typeFilter === "episode") {
    return values.filter(isEpisodeCalendarEntry);
  }
  return [];
}
