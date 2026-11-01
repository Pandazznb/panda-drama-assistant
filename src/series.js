import { SERIES_STATUS } from "./constants.js";
import {
  normalizeWhitespace,
  toSafeInteger,
} from "./utils.js";

const SEASON_PATTERN = /第\s*([零〇一二两三四五六七八九十百\d]+)\s*季/gu;
const SERIES_FINALE_PATTERN = /完结篇/u;

export function chineseNumber(value) {
  const text = String(value || "");
  if (/^\d+$/u.test(text)) {
    return Number(text);
  }
  const digits = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let total = 0;
  let current = 0;
  for (const character of text) {
    if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (character in digits) {
      current = current * 10 + digits[character];
      continue;
    }
    return null;
  }
  const number = total + current;
  return Number.isFinite(number) ? number : null;
}

export function seasonNumber(value) {
  const matches = [...String(value || "").matchAll(SEASON_PATTERN)];
  if (!matches.length) {
    return null;
  }
  return chineseNumber(matches.at(-1)[1]);
}

export function titleWithoutSeason(value) {
  return normalizeWhitespace(String(value || "").replace(SEASON_PATTERN, ""));
}

function visibleTime(season) {
  return Date.parse(season?.firstVisibleTime || "") || Number.POSITIVE_INFINITY;
}

function addedTime(season) {
  return Date.parse(season?.addedAt || "") || Number.POSITIVE_INFINITY;
}

function oldestSeason(seasons) {
  return [...seasons].sort(
    (left, right) =>
      visibleTime(left) - visibleTime(right) ||
      addedTime(left) - addedTime(right) ||
      String(left.seriesId).localeCompare(String(right.seriesId)),
  )[0] || null;
}

function latestTime(season) {
  return (
    Date.parse(season?.firstVisibleTime || "") ||
    Date.parse(season?.addedAt || "") ||
    0
  );
}

function publishedTime(season) {
  const value = Date.parse(season?.firstVisibleTime || "");
  return Number.isFinite(value) ? value : null;
}

export function highestSeason(seasons) {
  const normalized = (Array.isArray(seasons) ? seasons : []).filter(
    (season) => season?.seriesId,
  );
  if (!normalized.length) {
    return null;
  }

  const numbered = normalized
    .map((season) => ({
      season,
      number: seasonNumber(season.title),
    }))
    .filter((entry) => Number.isInteger(entry.number));
  if (numbered.length) {
    const highestNumbered = numbered.sort(
      (left, right) =>
        right.number - left.number ||
        latestTime(right.season) - latestTime(left.season) ||
        String(right.season.seriesId).localeCompare(
          String(left.season.seriesId),
        ),
    )[0].season;
    const latestUnnumberedFinale = normalized
      .filter(
        (season) =>
          !Number.isInteger(seasonNumber(season.title)) &&
          hasSeriesFinaleMarker(season),
      )
      .sort(
        (left, right) =>
          latestTime(right) - latestTime(left) ||
          String(right.seriesId).localeCompare(String(left.seriesId)),
      )[0];
    if (latestUnnumberedFinale) {
      const numberedPublishedAt = publishedTime(highestNumbered);
      const finalePublishedAt = publishedTime(latestUnnumberedFinale);
      if (
        Number.isFinite(finalePublishedAt) &&
        (!Number.isFinite(numberedPublishedAt) ||
          finalePublishedAt >= numberedPublishedAt)
      ) {
        return latestUnnumberedFinale;
      }
      if (
        !Number.isFinite(finalePublishedAt) &&
        !Number.isFinite(numberedPublishedAt) &&
        latestTime(latestUnnumberedFinale) >= latestTime(highestNumbered)
      ) {
        return latestUnnumberedFinale;
      }
    }
    return highestNumbered;
  }

  return [...normalized].sort(
    (left, right) =>
      latestTime(right) - latestTime(left) ||
      String(right.seriesId).localeCompare(String(left.seriesId)),
  )[0];
}

export function hasSeriesFinaleMarker(seasonOrTitle) {
  const title =
    typeof seasonOrTitle === "string"
      ? seasonOrTitle
      : seasonOrTitle?.title;
  return SERIES_FINALE_PATTERN.test(normalizeWhitespace(title || ""));
}

export function selectFirstSeason(seasons) {
  const normalized = (Array.isArray(seasons) ? seasons : []).filter(
    (season) => season?.seriesId,
  );
  if (!normalized.length) {
    return null;
  }

  const numbered = normalized
    .map((season) => ({
      season,
      number: seasonNumber(season.title),
    }))
    .filter((entry) => Number.isInteger(entry.number));
  if (numbered.length) {
    const explicitFirstSeasons = numbered.filter(
      (entry) => entry.number === 1,
    );
    if (explicitFirstSeasons.length) {
      return oldestSeason(
        explicitFirstSeasons.map((entry) => entry.season),
      );
    }
  }

  const unnumbered = normalized.filter(
    (season) => !Number.isInteger(seasonNumber(season.title)),
  );
  return unnumbered.length ? oldestSeason(unnumbered) : null;
}

export function inferFirstSeasonTitle(title) {
  const normalized = normalizeWhitespace(title);
  const number = seasonNumber(normalized);
  const base = titleWithoutSeason(normalized);
  if (number === 1) {
    return normalized;
  }
  if (Number.isInteger(number) && number > 1 && base) {
    return `${base}第一季`;
  }
  return normalized || base || "未命名短剧";
}

export function deriveSubscriptionIdentity(subscription) {
  const seasons = Array.isArray(subscription?.seasons)
    ? subscription.seasons
    : [];
  const knownFirst = selectFirstSeason(seasons);
  const storedFirstId = /^\d{8,25}$/.test(
    String(subscription?.firstSeasonId || ""),
  )
    ? String(subscription.firstSeasonId)
    : null;
  const storedFirst = seasons.find(
    (season) => season.seriesId === storedFirstId,
  );
  const storedFirstTitle = normalizeWhitespace(
    subscription?.firstSeasonTitle || "",
  );
  const fallbackTitle = inferFirstSeasonTitle(
    knownFirst?.title ||
      storedFirst?.title ||
      storedFirstTitle ||
      subscription?.title ||
      seasons[0]?.title,
  );
  const firstSeasonId =
    knownFirst?.seriesId ||
    storedFirst?.seriesId ||
    storedFirstId ||
    null;
  const firstSeasonTitle =
    normalizeWhitespace(knownFirst?.title || storedFirstTitle) ||
    fallbackTitle;

  return {
    firstSeasonId,
    firstSeasonTitle,
    displayTitle:
      normalizeWhitespace(firstSeasonTitle) ||
      normalizeWhitespace(subscription?.displayTitle) ||
      fallbackTitle,
    firstSeason:
      knownFirst ||
      storedFirst ||
      seasons.find((season) => season.seriesId === firstSeasonId) ||
      null,
  };
}

export function seriesPosition(seasons) {
  const normalized = Array.isArray(seasons) ? seasons : [];
  const seasonNumbers = normalized
    .map((season) => seasonNumber(season.title))
    .filter((number) => Number.isInteger(number));
  const visibleTimes = normalized
    .map((season) => Date.parse(season.firstVisibleTime || ""))
    .filter((value) => Number.isFinite(value));
  return {
    maxSeasonNumber: seasonNumbers.length
      ? Math.max(...seasonNumbers)
      : null,
    latestVisibleTime: visibleTimes.length ? Math.max(...visibleTimes) : null,
  };
}

export function hasNewerSeason(previousSeasons, nextSeasons) {
  const previous = seriesPosition(previousSeasons);
  const next = seriesPosition(nextSeasons);
  if (
    Number.isInteger(previous.maxSeasonNumber) &&
    Number.isInteger(next.maxSeasonNumber) &&
    next.maxSeasonNumber !== previous.maxSeasonNumber
  ) {
    return next.maxSeasonNumber > previous.maxSeasonNumber;
  }
  if (
    !Number.isInteger(previous.maxSeasonNumber) &&
    Number.isInteger(next.maxSeasonNumber)
  ) {
    return true;
  }
  if (
    Number.isFinite(previous.latestVisibleTime) &&
    Number.isFinite(next.latestVisibleTime)
  ) {
    return next.latestVisibleTime > previous.latestVisibleTime;
  }
  return next.maxSeasonNumber !== null && previous.maxSeasonNumber === null;
}

export function normalizeConfirmedSeriesIds(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || ""))
        .filter((value) => /^\d{8,25}$/.test(value)),
    ),
  ].sort();
}

export function normalizeAlbumMetadata(value) {
  const source = Array.isArray(value) ? { seriesIds: value } : value || {};
  const publishedSeriesIds = normalizeConfirmedSeriesIds(
    source.publishedSeriesIds ?? source.seriesIds,
  );
  const unpublishedSeriesIds = normalizeConfirmedSeriesIds(
    source.unpublishedSeriesIds,
  );
  const parsedDeclaredCount = Number.parseInt(
    source.declaredSeasonCount,
    10,
  );
  const declaredSeasonCount =
    Number.isFinite(parsedDeclaredCount) && parsedDeclaredCount >= 0
      ? parsedDeclaredCount
      : null;
  const parsedItemCount = Number.parseInt(source.itemCount, 10);
  const itemCount =
    Number.isFinite(parsedItemCount) && parsedItemCount >= 0
      ? parsedItemCount
      : null;
  const parsedUnpublishedCount = Number.parseInt(
    source.unpublishedSeasonCount,
    10,
  );
  const unpublishedSeasonCount =
    Number.isFinite(parsedUnpublishedCount) &&
    parsedUnpublishedCount >= 0
      ? parsedUnpublishedCount
      : unpublishedSeriesIds.length;

  return {
    publishedSeriesIds,
    unpublishedSeriesIds,
    unpublishedSeasonCount,
    declaredSeasonCount,
    itemCount,
  };
}

export function albumMetadataIssue(album) {
  if (!album.publishedSeriesIds.length) {
    return "官方多季列表没有可确认的已发布季度。";
  }
  if (album.declaredSeasonCount !== null) {
    const representedSeasonCount =
      album.publishedSeriesIds.length + album.unpublishedSeasonCount;
    if (album.declaredSeasonCount !== representedSeasonCount) {
      return "官方多季列表返回不完整，暂时不能判断整个系列。";
    }
    if (
      album.itemCount !== null &&
      album.itemCount < album.declaredSeasonCount
    ) {
      return "官方多季列表条目少于声明季数，暂时不能判断整个系列。";
    }
  }
  return null;
}

export function seriesVerificationComplete(seasons, confirmedSeriesIds) {
  const seasonIds = [
    ...new Set(
      (Array.isArray(seasons) ? seasons : [])
        .map((season) => String(season?.seriesId || ""))
        .filter(Boolean),
    ),
  ].sort();
  const confirmedIds = normalizeConfirmedSeriesIds(confirmedSeriesIds);
  return (
    seasonIds.length > 0 &&
    confirmedIds.length > 0 &&
    seasonIds.length === confirmedIds.length &&
    seasonIds.every((seriesId, index) => seriesId === confirmedIds[index])
  );
}

export function deriveSeriesStatus(
  seasons,
  {
    confirmedSeriesIds = [],
    discoveryError = null,
    seasonErrors = 0,
    unpublishedSeasonCount = 0,
  } = {},
) {
  const normalizedSeasons = Array.isArray(seasons) ? seasons : [];
  if (!normalizedSeasons.length) {
    return {
      status: SERIES_STATUS.UNKNOWN,
      reason: "尚未读取到任何已确认季度。",
    };
  }
  if (discoveryError) {
    return {
      status: SERIES_STATUS.UNKNOWN,
      reason: `官方多季列表核验失败：${normalizeWhitespace(discoveryError)}`,
    };
  }
  const unknownSeason = normalizedSeasons.find(
    (season) => season.status === SERIES_STATUS.UNKNOWN || season.lastError,
  );
  if (seasonErrors > 0 || unknownSeason) {
    return {
      status: SERIES_STATUS.UNKNOWN,
      reason: unknownSeason?.lastError
        ? `《${unknownSeason.title}》检查失败：${unknownSeason.lastError}`
        : `${toSafeInteger(seasonErrors, 1)} 个季度检查失败，暂时无法判断整个系列。`,
    };
  }
  if (
    normalizedSeasons.some(
      (season) => season.status === SERIES_STATUS.UPDATING,
    )
  ) {
    return {
      status: SERIES_STATUS.UPDATING,
      reason: `${normalizedSeasons.length} 个已确认季度中仍有季度在更新。`,
    };
  }
  if (toSafeInteger(unpublishedSeasonCount, 0) > 0) {
    return {
      status: SERIES_STATUS.UPDATING,
      reason: `官方多季列表仍有 ${toSafeInteger(
        unpublishedSeasonCount,
        1,
      )} 个未发布季度，整个系列尚未完结。`,
    };
  }
  if (
    normalizedSeasons.every(
      (season) => season.status === SERIES_STATUS.COMPLETED,
    )
  ) {
    if (
      seriesVerificationComplete(normalizedSeasons, confirmedSeriesIds)
    ) {
      const finalSeason = highestSeason(normalizedSeasons);
      if (!hasSeriesFinaleMarker(finalSeason)) {
        return {
          status: SERIES_STATUS.UNKNOWN,
          reason: `官方多季列表已核验：${normalizedSeasons.length} 季均已完结，但最高季《${
            finalSeason?.title || "未知季度"
          }》标题没有明确“完结篇”标识，无法确认整个系列完结。`,
        };
      }
      return {
        status: SERIES_STATUS.COMPLETED,
        reason: `官方多季列表已核验：最高季《${finalSeason.title}》明确标注“完结篇”，整个系列已完结，已停止自动检查。`,
      };
    }
    return {
      status: SERIES_STATUS.UNKNOWN,
      reason:
        "已确认季度均已完结，但尚未完成官方多季列表核验，不能判定整个系列完结。",
    };
  }
  return {
    status: SERIES_STATUS.UNKNOWN,
    reason: "季度状态不完整，暂时无法判断整个系列。",
  };
}
