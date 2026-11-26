function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validIso(value) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
}

export function calendarEventSeasonKey(event) {
  if (!event?.subscriptionId || !event?.seasonId) {
    return null;
  }
  return `${event.subscriptionId}:${event.seasonId}`;
}

export function latestEpisodeEventIdBySeason(events) {
  const latestEvents = new Map();
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.type !== "episode") {
      continue;
    }
    const key = calendarEventSeasonKey(event);
    if (!key) {
      continue;
    }
    const current = latestEvents.get(key);
    if (!current) {
      latestEvents.set(key, event);
      continue;
    }
    const eventTime = Date.parse(event.createdAt || "") || 0;
    const currentTime = Date.parse(current.createdAt || "") || 0;
    const eventEpisodes = finiteNumber(event.episodeCount) ?? -1;
    const currentEpisodes = finiteNumber(current.episodeCount) ?? -1;
    if (
      eventTime > currentTime ||
      (eventTime === currentTime && eventEpisodes > currentEpisodes)
    ) {
      latestEvents.set(key, event);
    }
  }
  return new Map(
    [...latestEvents].map(([key, event]) => [key, String(event.id)]),
  );
}

export function resolveUpdateEventOccurredAt(
  event,
  season,
  latestEpisodeEventId = null,
) {
  const fallback = validIso(event?.createdAt);
  if (!fallback) {
    return null;
  }
  if (event.type === "season") {
    return validIso(season?.firstVisibleTime) || fallback;
  }
  if (event.type !== "episode") {
    return fallback;
  }
  if (String(event.id) !== String(latestEpisodeEventId || "")) {
    return fallback;
  }
  const eventEpisodeCount = finiteNumber(event.episodeCount);
  const seasonEpisodeCount =
    finiteNumber(season?.highWaterEpisodeCount) ??
    finiteNumber(season?.episodeCount);
  if (
    eventEpisodeCount === null ||
    seasonEpisodeCount === null ||
    eventEpisodeCount !== seasonEpisodeCount
  ) {
    return fallback;
  }
  return validIso(season?.lastEpisodeChangedAt) || fallback;
}
