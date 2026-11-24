(() => {
  const SERIES_ID_PATTERN = /^\d{8,25}$/;

  function safeHttpsUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalizeSeriesId(value) {
    const seriesId = String(value || "").trim();
    return SERIES_ID_PATTERN.test(seriesId) ? seriesId : "";
  }

  function url(upstreamUrl, seriesId, { refresh = false } = {}) {
    const sourceUrl = safeHttpsUrl(upstreamUrl);
    const normalizedSeriesId = normalizeSeriesId(seriesId);
    if (!sourceUrl && !normalizedSeriesId) {
      return "";
    }

    const params = new URLSearchParams();
    if (sourceUrl) {
      params.set("url", sourceUrl);
    }
    if (normalizedSeriesId) {
      params.set("seriesId", normalizedSeriesId);
    }
    if (refresh) {
      params.set("refresh", "1");
      params.set("v", String(Date.now()));
    }
    return `/api/covers?${params.toString()}`;
  }

  function escapeAttribute(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function attributes(upstreamUrl, seriesId) {
    const sourceUrl = safeHttpsUrl(upstreamUrl);
    const normalizedSeriesId = normalizeSeriesId(seriesId);
    if (!sourceUrl && !normalizedSeriesId) {
      return "";
    }
    return [
      'data-drama-cover="true"',
      sourceUrl
        ? `data-cover-url="${escapeAttribute(sourceUrl)}"`
        : "",
      normalizedSeriesId
        ? `data-cover-series-id="${normalizedSeriesId}"`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function fallbackFor(image) {
    const container = image.closest("[data-cover-container]") || image.parentElement;
    return (
      container?.querySelector("[data-cover-fallback]") ||
      image.parentElement?.querySelector("[data-cover-fallback]") ||
      null
    );
  }

  function showFallback(image) {
    const fallback = fallbackFor(image);
    if (fallback) {
      fallback.hidden = false;
    }
    image.hidden = true;
    image.dataset.coverFailed = "true";
  }

  function handleImageError(image) {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }
    if (image.dataset.dramaCover !== "true") {
      return;
    }
    if (image.dataset.coverRetried === "true") {
      showFallback(image);
      return;
    }

    const retryUrl = url(
      image.dataset.coverUrl || "",
      image.dataset.coverSeriesId || "",
      { refresh: true },
    );
    if (!retryUrl) {
      showFallback(image);
      return;
    }
    image.dataset.coverRetried = "true";
    image.src = retryUrl;
  }

  window.addEventListener(
    "error",
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        handleImageError(event.target);
      }
    },
    true,
  );

  window.DramaCover = Object.freeze({
    attributes,
    url,
  });
})();
