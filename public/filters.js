(() => {
  const APP_TIME_ZONE = "Asia/Shanghai";
  const GROUP_LABELS = Object.freeze({
    genre: "内容类型",
    category_dim_theme: "主题",
    category_dim_role: "设定",
    category_dim_epoch: "背景",
    sort: "推荐",
    gender: "受众",
    online_time: "时间",
    creation_status: "状态",
  });
  const OFFICIAL_CATEGORY_PATHS = Object.freeze({
    short_play: "/category/real-drama",
    comic_series: "/category/comic-drama",
    ai_series: "/category/ai-drama",
  });

  const elements = {
    genreOptions: document.querySelector("#filters-genre-options"),
    advanced: document.querySelector("#filters-advanced"),
    toggleAdvanced: document.querySelector("#filters-toggle-advanced"),
    reset: document.querySelector("#filters-reset"),
    refresh: document.querySelector("#filters-refresh"),
    activeCount: document.querySelector("#filters-active-count"),
    selectionSummary: document.querySelector("#filters-selection-summary"),
    resultMeta: document.querySelector("#filters-result-meta"),
    resultTitle: document.querySelector("#filters-results-title"),
    resultCount: document.querySelector("#filters-result-count"),
    resultsDescription: document.querySelector("#filters-results-description"),
    activeSummary: document.querySelector("#filters-active-summary"),
    sourceLink: document.querySelector("#filters-source-link"),
    notice: document.querySelector("#filters-notice"),
    status: document.querySelector("#filters-status"),
    list: document.querySelector("#filters-list"),
    more: document.querySelector("#filters-more"),
    moreCopy: document.querySelector("#filters-more-copy"),
    loadMore: document.querySelector("#filters-load-more"),
    toast: document.querySelector("#filters-toast"),
    optionsDialog: document.querySelector("#filters-options-dialog"),
    optionsTitle: document.querySelector("#filters-options-title"),
    optionsClose: document.querySelector("#filters-options-close"),
    optionsGrid: document.querySelector("#filters-options-grid"),
    filterPanel: document.querySelector("#discovery-filter-panel"),
  };

  if (!elements.list || !elements.genreOptions || !elements.advanced) {
    return;
  }

  const state = {
    selection: {},
    groups: [],
    items: [],
    nextCursor: null,
    hasMore: false,
    loaded: false,
    loading: false,
    loadingMore: false,
    error: "",
    notice: "",
    fetchedAt: "",
    requestToken: 0,
    loadController: null,
    loadMoreController: null,
    pendingAdds: new Set(),
    addControllers: new Map(),
    toastTimer: null,
    toastHideTimer: null,
    filterExpanded: true,
    optionsGroup: "",
    optionsTrigger: null,
    focusAfterRender: null,
  };

  let overflowFrame = 0;
  let resizeObserver = null;

  const icon = (name, className = "icon") =>
    `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeSelectorValue(value) {
    const text = String(value);
    if (typeof globalThis.CSS?.escape === "function") {
      return globalThis.CSS.escape(text);
    }
    return text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  }

  function safeHttpsUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function formatFetchedAt(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      return "时间未知";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: APP_TIME_ZONE,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function groupLabel(group) {
    return GROUP_LABELS[group?.type] || String(group?.label || "筛选");
  }

  function findGroup(type) {
    return state.groups.find((group) => group.type === type) || null;
  }

  function findOption(type, id) {
    return findGroup(type)?.options?.find((option) => option.id === id) || null;
  }

  function selectionEntries() {
    return Object.entries(state.selection).filter(([, value]) => value);
  }

  function currentSelectionSummary() {
    const parts = selectionEntries().map(([type, id]) => {
      const option = findOption(type, id);
      const label = option?.label || id;
      return `${groupLabel(findGroup(type) || { type })}：${label}`;
    });
    return parts.length ? parts.join(" · ") : "全部类型 · 全部条件";
  }

  function officialCategoryUrl() {
    const path =
      OFFICIAL_CATEGORY_PATHS[state.selection.genre] ||
      OFFICIAL_CATEGORY_PATHS.short_play;
    return `https://hongguoduanju.com${path}`;
  }

  function setStatus(message = "", type = "") {
    elements.status.textContent = message;
    elements.status.className = `rankings-status${type ? ` is-${type}` : ""}`;
    elements.status.hidden = !message;
  }

  function setNotice(message = "") {
    elements.notice.textContent = message;
    elements.notice.hidden = !message;
  }

  function showToast(message, type = "success") {
    clearTimeout(state.toastTimer);
    clearTimeout(state.toastHideTimer);
    elements.toast.classList.remove("is-hiding");
    elements.toast.classList.toggle("toast--error", type === "error");
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    void elements.toast.offsetWidth;
    elements.toast.classList.add("is-refreshing");
    state.toastTimer = setTimeout(() => {
      elements.toast.classList.add("is-hiding");
      state.toastHideTimer = setTimeout(() => {
        elements.toast.hidden = true;
        elements.toast.classList.remove("is-hiding", "is-refreshing");
      }, 160);
    }, 3600);
  }

  function updateSelectionChrome() {
    const count = selectionEntries().length;
    const summary = currentSelectionSummary();
    elements.activeCount.textContent = count ? `已选 ${count} 项` : "未选择";
    elements.selectionSummary.textContent = summary;
    elements.activeSummary.textContent = `当前条件：${summary}`;
    elements.sourceLink.href = officialCategoryUrl();
    elements.reset.disabled = count === 0;
  }

  function syncFilterToggle() {
    elements.advanced.hidden = !state.filterExpanded;
    elements.toggleAdvanced.setAttribute(
      "aria-expanded",
      String(state.filterExpanded),
    );
    elements.toggleAdvanced.querySelector("span").textContent =
      state.filterExpanded ? "收起筛选" : "展开筛选";
    elements.toggleAdvanced
      .querySelector("use")
      ?.setAttribute(
        "href",
        state.filterExpanded ? "#icon-chevron-up" : "#icon-chevron-down",
      );
  }

  function optionButtonMarkup(group, option, { inDialog = false } = {}) {
    const selected =
      option.id === ""
        ? !state.selection[group.type]
        : state.selection[group.type] === option.id;
    const label =
      option.id === "" && group.type === "genre" ? "全部类型" : option.label;
    return `
      <button
        class="discovery-option${inDialog ? " discovery-option--dialog" : ""}"
        type="button"
        aria-pressed="${selected}"
        data-discovery-group="${escapeHtml(group.type)}"
        data-option-id="${escapeHtml(option.id)}"
        title="${escapeHtml(label)}"
      >
        ${escapeHtml(label)}
      </button>
    `;
  }

  function renderGroupRow(group) {
    const options = [{ id: "", label: "全部" }, ...(group.options || [])];
    const label = groupLabel(group);
    return `
      <div class="discovery-filter-row" data-group-row="${escapeHtml(group.type)}">
        <span class="discovery-filter-row__label">${escapeHtml(label)}</span>
        <div
          class="discovery-option-strip"
          role="group"
          aria-label="${escapeHtml(label)}"
          data-group-strip="${escapeHtml(group.type)}"
        >
          ${options.map((option) => optionButtonMarkup(group, option)).join("")}
          <button
            class="discovery-option-more"
            type="button"
            data-action="show-options"
            data-group="${escapeHtml(group.type)}"
            aria-label="${escapeHtml(`查看${label}的全部 ${options.length} 项`)}"
            title="${escapeHtml(`查看${label}全部选项`)}"
            hidden
          >
            全部 ${options.length} 项
          </button>
        </div>
      </div>
    `;
  }

  function observeStrips() {
    resizeObserver?.disconnect();
    const strips = elements.filterPanel.querySelectorAll("[data-group-strip]");
    if (typeof ResizeObserver === "function") {
      resizeObserver ||= new ResizeObserver(scheduleOverflowUpdate);
      for (const strip of strips) {
        resizeObserver.observe(strip);
      }
    }
    scheduleOverflowUpdate();
  }

  function renderFilters() {
    const genreGroup = findGroup("genre");
    elements.genreOptions.innerHTML = genreGroup
      ? [
          { id: "", label: "全部" },
          ...(genreGroup.options || []),
        ]
          .map((option) =>
            optionButtonMarkup(
              { ...genreGroup, type: "genre" },
              option,
            ),
          )
          .join("")
      : '<span class="discovery-filter-loading">正在读取内容类型…</span>';

    const advancedGroups = state.groups.filter(
      (group) => group.type !== "genre" && group.options?.length,
    );
    elements.advanced.innerHTML = advancedGroups.length
      ? advancedGroups.map(renderGroupRow).join("")
      : `<p class="discovery-filter-loading">${
          state.loading ? "正在读取更多筛选条件…" : "当前没有更多筛选条件"
        }</p>`;

    syncFilterToggle();
    updateSelectionChrome();
    observeStrips();

    if (state.focusAfterRender) {
      const { type, id } = state.focusAfterRender;
      state.focusAfterRender = null;
      requestAnimationFrame(() => focusOption(type, id));
    }
  }

  function updateStripOverflow(strip) {
    const more = strip.querySelector('[data-action="show-options"]');
    if (!more) {
      return;
    }
    more.hidden = true;
    const overflow = strip.scrollWidth > strip.clientWidth + 1;
    more.hidden = !overflow;
    strip
      .closest("[data-group-row]")
      ?.classList.toggle("is-scrollable", overflow);
  }

  function updateOverflows() {
    overflowFrame = 0;
    for (const strip of elements.filterPanel.querySelectorAll(
      "[data-group-strip]",
    )) {
      updateStripOverflow(strip);
    }
  }

  function scheduleOverflowUpdate() {
    cancelAnimationFrame(overflowFrame);
    overflowFrame = requestAnimationFrame(updateOverflows);
  }

  function focusOption(type, id = "") {
    const button = elements.filterPanel.querySelector(
      `[data-discovery-group="${escapeSelectorValue(
        type,
      )}"][data-option-id="${escapeSelectorValue(id)}"]`,
    );
    if (!button) {
      return;
    }
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function statusMeta() {
    return null;
  }

  function episodeLabel(item) {
    const count = Math.max(
      Number(item?.episodeCount) || 0,
      Number(item?.totalEpisodeCount) || 0,
    );
    return count > 0 ? `共 ${count} 集` : "集数待更新";
  }

  function coverMarkup(item, title) {
    const coverUrl = safeHttpsUrl(item?.coverUrl);
    const fallback = `<span class="discovery-card__cover-fallback">${icon(
      "tv",
    )}</span>`;
    const inner = `${fallback}${
      coverUrl
        ? `<img class="discovery-card__cover-image" src="${escapeHtml(
            coverUrl,
          )}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
        : ""
    }`;
    const detailUrl = safeHttpsUrl(item?.detailUrl);
    if (!detailUrl) {
      return `<span class="discovery-card__cover" aria-hidden="true">${inner}</span>`;
    }
    return `
      <a
        class="discovery-card__cover"
        href="${escapeHtml(detailUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="${escapeHtml(`在红果官网查看《${title}》`)}"
      >
        ${inner}
      </a>
    `;
  }

  function addButtonMarkup(item, title) {
    const seriesId = String(item?.seriesId || "");
    const tracked = Boolean(item?.tracked);
    const pending = state.pendingAdds.has(seriesId);
    return `
      <button
        class="button discovery-card__add${tracked ? " is-tracked" : ""}${
          pending ? " is-busy" : ""
        }"
        type="button"
        data-action="add"
        data-series-id="${escapeHtml(seriesId)}"
        aria-label="${escapeHtml(
          tracked
            ? `《${title}》已加入我的追更`
            : `将《${title}》加入我的追更`,
        )}"
        ${tracked || pending ? 'aria-disabled="true"' : ""}
        ${pending ? 'aria-busy="true"' : ""}
      >
        ${icon(tracked ? "check" : "plus")}
        <span>${tracked ? "已追更" : pending ? "加入中…" : "加入追更"}</span>
      </button>
    `;
  }

  function cardMarkup(item) {
    const title = String(item?.title || "未命名短剧").trim() || "未命名短剧";
    const detailUrl = safeHttpsUrl(item?.detailUrl);
    const tags = (Array.isArray(item?.tags) ? item.tags : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 2);
    const intro = String(item?.intro || "").trim();
    const titleMarkup = detailUrl
      ? `<a href="${escapeHtml(
          detailUrl,
        )}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
      : escapeHtml(title);

    return `
      <article class="discovery-card" data-series-id="${escapeHtml(
        item?.seriesId || "",
      )}">
        ${coverMarkup(item, title)}
        <div class="discovery-card__body">
          <h3>${titleMarkup}</h3>
          ${
            intro
              ? `<p class="discovery-card__intro">${escapeHtml(intro)}</p>`
              : ""
          }
          <div class="discovery-card__meta">
            <span class="discovery-card__episodes">${escapeHtml(
              episodeLabel(item),
            )}</span>
            ${tags
              .map(
                (tag) =>
                  `<span class="discovery-card__tag">${escapeHtml(tag)}</span>`,
              )
              .join("")}
          </div>
          <div class="discovery-card__footer">
            ${
              detailUrl
                ? `<a class="discovery-card__detail" href="${escapeHtml(
                    detailUrl,
                  )}" target="_blank" rel="noopener noreferrer">${icon(
                    "external",
                  )}<span>详情</span></a>`
                : '<span class="discovery-card__detail is-disabled" aria-hidden="true"></span>'
            }
            ${addButtonMarkup(item, title)}
          </div>
        </div>
      </article>
    `;
  }

  function skeletonMarkup(count = 8) {
    return Array.from(
      { length: count },
      (_, index) => `
        <div class="discovery-card-skeleton"${
          index ? ' aria-hidden="true"' : ' aria-label="正在加载短剧"'
        }>
          <span class="skeleton discovery-card-skeleton__cover"></span>
          <span class="discovery-card-skeleton__body">
            <span class="skeleton discovery-card-skeleton__title"></span>
            <span class="skeleton discovery-card-skeleton__line"></span>
            <span class="skeleton discovery-card-skeleton__button"></span>
          </span>
        </div>
      `,
    ).join("");
  }

  function emptyMarkup({ error = false, message = "" } = {}) {
    const title = error ? "暂时无法筛选短剧" : "没有找到符合条件的短剧";
    const detail =
      message ||
      (error
        ? "红果筛选服务暂时不可用，请稍后重试。"
        : "可以少选几个条件，或者重置后重新浏览。");
    return `
      <div class="rankings-empty discovery-empty${error ? " is-error" : ""}">
        <span class="rankings-empty__icon">${icon(
          error ? "alert" : "inbox",
        )}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
        <button
          class="button button--secondary rankings-empty__retry"
          type="button"
          data-action="${error ? "retry" : "reset"}"
        >
          ${error ? "重新加载" : "重置筛选"}
        </button>
      </div>
    `;
  }

  function bindImageFallbacks() {
    for (const image of elements.list.querySelectorAll(
      ".discovery-card__cover-image",
    )) {
      const hideBrokenImage = () => {
        image.hidden = true;
        image.closest(".discovery-card__cover")?.classList.add("has-fallback");
      };
      image.addEventListener("error", hideBrokenImage, { once: true });
      if (image.complete && image.naturalWidth === 0) {
        hideBrokenImage();
      }
    }
  }

  function renderResults() {
    elements.list.setAttribute(
      "aria-busy",
      String(state.loading || state.loadingMore),
    );
    elements.resultTitle.textContent =
      state.selection.genre === "comic_series"
        ? "漫剧筛选结果"
        : state.selection.genre === "ai_series"
          ? "AI 剧筛选结果"
          : "筛选结果";
    elements.resultCount.textContent = state.loaded
      ? `${state.items.length} 部`
      : "-";
    elements.resultMeta.textContent = state.loaded
      ? `${state.items.length} 部已加载`
      : state.loading
        ? "读取中"
        : "-";
    elements.resultsDescription.textContent = state.loaded
      ? `红果官方返回 ${state.items.length} 部短剧${
          state.hasMore ? "，可继续加载" : ""
        }${state.fetchedAt ? `，数据时间 ${formatFetchedAt(state.fetchedAt)}` : ""}。`
      : state.loading
        ? "正在按官方条件读取短剧…"
        : "正在读取红果官方筛选条件…";
    elements.sourceLink.href = officialCategoryUrl();
    elements.refresh.disabled = state.loading || state.loadingMore;
    elements.refresh.classList.toggle("is-busy", state.loading);
    if (state.loading) {
      elements.refresh.setAttribute("aria-busy", "true");
    } else {
      elements.refresh.removeAttribute("aria-busy");
    }

    if (!state.loaded && state.loading) {
      elements.list.innerHTML = skeletonMarkup();
    } else if (state.error && !state.loaded) {
      elements.list.innerHTML = emptyMarkup({
        error: true,
        message: state.error,
      });
    } else if (state.loaded && !state.items.length) {
      elements.list.innerHTML = emptyMarkup();
    } else {
      elements.list.innerHTML = state.items.map(cardMarkup).join("");
      bindImageFallbacks();
    }

    const showMore = state.loaded && (state.hasMore || state.loadingMore);
    elements.more.hidden = !showMore;
    if (showMore) {
      elements.moreCopy.textContent = state.loadingMore
        ? "正在加载更多短剧…"
        : `已加载 ${state.items.length} 部，继续浏览更多`;
      elements.loadMore.disabled = state.loadingMore;
      elements.loadMore.classList.toggle("is-busy", state.loadingMore);
      elements.loadMore
        .querySelector("use")
        ?.setAttribute(
          "href",
          state.loadingMore ? "#icon-refresh" : "#icon-chevron-down",
        );
      const label = elements.loadMore.querySelector("span");
      if (label) {
        label.textContent = state.loadingMore ? "加载中…" : "加载更多";
      }
    }

    elements.activeCount.textContent = selectionEntries().length
      ? `已选 ${selectionEntries().length} 项`
      : "未选择";
    elements.selectionSummary.textContent = currentSelectionSummary();
    elements.activeSummary.textContent = `当前条件：${currentSelectionSummary()}`;
    elements.reset.disabled = selectionEntries().length === 0;
    setNotice(state.notice);
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // The HTTP status remains useful when the response is not JSON.
    }
    if (!response.ok || payload?.ok === false) {
      const error = new Error(
        payload?.error?.message || `请求失败（HTTP ${response.status}）。`,
      );
      error.code = payload?.error?.code || "REQUEST_FAILED";
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function mergeItems(current, incoming) {
    const merged = [];
    const seen = new Set();
    for (const item of [...current, ...incoming]) {
      const seriesId = String(item?.seriesId || "");
      if (!seriesId || seen.has(seriesId)) {
        continue;
      }
      seen.add(seriesId);
      merged.push(item);
    }
    return merged;
  }

  function normalizedItems(payload) {
    return Array.isArray(payload?.items)
      ? payload.items.filter(
          (item) => item && String(item.seriesId || "").trim(),
        )
      : [];
  }

  function normalizedGroups(payload) {
    return Array.isArray(payload?.groups)
      ? payload.groups.filter(
          (group) =>
            group &&
            typeof group.type === "string" &&
            Array.isArray(group.options),
        )
      : [];
  }

  function reconcileSelection() {
    const next = {};
    for (const [type, id] of selectionEntries()) {
      const group = findGroup(type);
      if (!group || group.options.some((option) => option.id === id)) {
        next[type] = id;
      }
    }
    state.selection = next;
  }

  function abortLoads() {
    state.loadController?.abort();
    state.loadMoreController?.abort();
    state.loadController = null;
    state.loadMoreController = null;
  }

  async function loadFirstPage({ clear = false, focus = null } = {}) {
    abortLoads();
    const controller = new AbortController();
    state.loadController = controller;
    const requestToken = ++state.requestToken;
    const hadContent = state.loaded && state.items.length > 0;

    if (clear) {
      state.items = [];
      state.loaded = false;
      state.error = "";
      state.nextCursor = null;
      state.hasMore = false;
      state.fetchedAt = "";
    }
    state.loading = true;
    state.loadingMore = false;
    state.error = "";
    state.notice = "";
    if (focus) {
      state.focusAfterRender = focus;
    }
    setStatus(
      hadContent && !clear
        ? "正在刷新筛选结果…"
        : "正在读取红果官方筛选结果…",
    );
    renderFilters();
    renderResults();

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45_000);

    try {
      const payload = await fetchJson("/api/catalog/discovery", {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        body: JSON.stringify({
          selection: state.selection,
          cursor: null,
        }),
      });
      if (requestToken !== state.requestToken) {
        return;
      }
      const groups = normalizedGroups(payload);
      if (groups.length) {
        state.groups = groups;
        reconcileSelection();
      }
      state.items = mergeItems([], normalizedItems(payload));
      state.nextCursor = payload.nextCursor || null;
      state.hasMore = Boolean(payload.hasMore && state.nextCursor);
      state.fetchedAt = String(payload.fetchedAt || "");
      state.loaded = true;
      state.error = "";
      state.notice = "";
      setStatus("");
    } catch (error) {
      if (requestToken !== state.requestToken) {
        return;
      }
      const message =
        error.name === "AbortError" && timedOut
          ? "筛选加载超时，请稍后重试。"
          : error.name === "AbortError"
            ? ""
            : error.message || "筛选加载失败，请稍后重试。";
      if (message) {
        if (hadContent && !clear) {
          state.notice = `刷新失败，继续显示上次结果：${message}`;
          setStatus("");
        } else {
          state.error = message;
          setStatus(message, "error");
        }
      }
    } finally {
      if (requestToken === state.requestToken) {
        clearTimeout(timeout);
        state.loading = false;
        state.loadController = null;
        renderFilters();
        renderResults();
      }
    }
  }

  async function loadMore() {
    if (
      state.loading ||
      state.loadingMore ||
      !state.hasMore ||
      !state.nextCursor
    ) {
      return;
    }
    const controller = new AbortController();
    state.loadMoreController = controller;
    const requestToken = state.requestToken;
    state.loadingMore = true;
    state.notice = "";
    setStatus("正在加载更多短剧…");
    renderResults();

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45_000);

    try {
      const payload = await fetchJson("/api/catalog/discovery", {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        body: JSON.stringify({
          selection: state.selection,
          cursor: state.nextCursor,
        }),
      });
      if (requestToken !== state.requestToken) {
        return;
      }
      state.items = mergeItems(state.items, normalizedItems(payload));
      state.nextCursor = payload.nextCursor || null;
      state.hasMore = Boolean(payload.hasMore && state.nextCursor);
      state.fetchedAt = String(payload.fetchedAt || state.fetchedAt);
      state.notice = "";
      setStatus("");
    } catch (error) {
      if (requestToken !== state.requestToken) {
        return;
      }
      if (error.name === "AbortError" && !timedOut) {
        return;
      }
      state.notice =
        error.name === "AbortError" && timedOut
          ? "加载更多超时，已保留当前结果，可以重试。"
          : error.message || "加载更多失败，已保留当前结果。";
      setStatus("");
    } finally {
      if (requestToken === state.requestToken) {
        clearTimeout(timeout);
        state.loadingMore = false;
        state.loadMoreController = null;
        renderResults();
      }
    }
  }

  function activateOption(type, id, { focus = true } = {}) {
    const group = findGroup(type);
    if (!group && type !== "genre") {
      return;
    }
    if (type === "genre") {
      if (state.selection.genre === (id || undefined)) {
        return;
      }
      state.selection = id ? { genre: id } : {};
    } else {
      if (state.selection[type] === (id || undefined)) {
        return;
      }
      if (id) {
        state.selection[type] = id;
      } else {
        delete state.selection[type];
      }
    }
    closeOptions({ restoreFocus: false });
    renderFilters();
    loadFirstPage({
      clear: true,
      focus: focus ? { type, id: id || "" } : null,
    });
  }

  function resetFilters() {
    if (!selectionEntries().length && state.loaded) {
      return;
    }
    state.selection = {};
    closeOptions({ restoreFocus: false });
    renderFilters();
    loadFirstPage({ clear: true, focus: { type: "genre", id: "" } });
  }

  function optionsForGroup(type) {
    const group = findGroup(type);
    if (!group) {
      return [];
    }
    return [{ id: "", label: "全部" }, ...(group.options || [])];
  }

  function renderOptionsDialog(type) {
    const group = findGroup(type);
    if (!group) {
      return;
    }
    const label = groupLabel(group);
    elements.optionsTitle.textContent = `${label} · 全部选项`;
    elements.optionsGrid.innerHTML = optionsForGroup(type)
      .map((option) =>
        optionButtonMarkup(group, option, { inDialog: true }),
      )
      .join("");
  }

  function openOptions(type, trigger) {
    if (!findGroup(type) || typeof elements.optionsDialog?.showModal !== "function") {
      return;
    }
    state.optionsGroup = type;
    state.optionsTrigger = trigger || null;
    renderOptionsDialog(type);
    elements.optionsDialog.showModal();
    requestAnimationFrame(() => {
      const selected =
        elements.optionsGrid.querySelector('[aria-pressed="true"]') ||
        elements.optionsGrid.querySelector("button");
      selected?.focus();
    });
  }

  function closeOptions({ restoreFocus = true } = {}) {
    if (!elements.optionsDialog?.open) {
      return;
    }
    elements.optionsDialog.close();
    if (restoreFocus && state.optionsTrigger?.isConnected) {
      state.optionsTrigger.focus();
    }
    state.optionsGroup = "";
    state.optionsTrigger = null;
  }

  function handleOptionKeyboard(event) {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
        event.key,
      )
    ) {
      return;
    }
    const button = event.target.closest?.("[data-discovery-group]");
    if (!button) {
      return;
    }
    const container = button.closest(
      "[data-group-strip], #filters-options-grid",
    );
    const buttons = [...(container?.querySelectorAll("[data-option-id]") || [])];
    if (buttons.length < 2) {
      return;
    }
    const currentIndex = buttons.indexOf(button);
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    let nextIndex = currentIndex;
    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    } else if (horizontal || container.id === "filters-options-grid") {
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      nextIndex = (currentIndex + step + buttons.length) % buttons.length;
    }
    event.preventDefault();
    buttons[nextIndex]?.focus();
    buttons[nextIndex]?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }

  function updateAddButton(seriesId) {
    const item = state.items.find(
      (candidate) => String(candidate?.seriesId || "") === String(seriesId),
    );
    if (!item) {
      return;
    }
    const button = elements.list.querySelector(
      `[data-action="add"][data-series-id="${escapeSelectorValue(seriesId)}"]`,
    );
    if (!button) {
      return;
    }
    const title = String(item.title || "未命名短剧").trim() || "未命名短剧";
    const tracked = Boolean(item.tracked);
    const pending = state.pendingAdds.has(String(seriesId));
    button.classList.toggle("is-tracked", tracked);
    button.classList.toggle("is-busy", pending);
    if (tracked || pending) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
    button.setAttribute(
      "aria-label",
      tracked
        ? `《${title}》已加入我的追更`
        : `将《${title}》加入我的追更`,
    );
    if (pending) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
    button
      .querySelector("use")
      ?.setAttribute("href", tracked ? "#icon-check" : "#icon-plus");
    const label = button.querySelector("span");
    if (label) {
      label.textContent = tracked ? "已追更" : pending ? "加入中…" : "加入追更";
    }
  }

  function markTracked(seriesId) {
    for (const item of state.items) {
      if (String(item?.seriesId || "") === String(seriesId)) {
        item.tracked = true;
      }
    }
    updateAddButton(seriesId);
  }

  async function addToWatchlist(seriesId, button) {
    const item = state.items.find(
      (candidate) => String(candidate?.seriesId || "") === String(seriesId),
    );
    if (!item || item.tracked || state.pendingAdds.has(String(seriesId))) {
      return;
    }
    const title = String(item.title || "未命名短剧").trim() || "未命名短剧";
    state.pendingAdds.add(String(seriesId));
    updateAddButton(seriesId);

    const controller = new AbortController();
    state.addControllers.set(String(seriesId), controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 90_000);

    try {
      let payload;
      try {
        payload = await fetchJson("/api/subscriptions", {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({ input: String(seriesId) }),
        });
      } catch (error) {
        if (error.status === 409 && error.code === "SUBSCRIPTION_EXISTS") {
          markTracked(seriesId);
          showToast(`《${title}》已经在追更中。`);
          return;
        }
        throw error;
      }
      markTracked(seriesId);
      showToast(payload.message || `已加入追更：《${title}》`);
    } catch (error) {
      if (timedOut) {
        showToast("加入追更超时，请稍后重试。", "error");
      } else if (error.name !== "AbortError") {
        showToast(
          error.message || "加入追更失败，请稍后重试。",
          "error",
        );
      }
    } finally {
      clearTimeout(timeout);
      state.pendingAdds.delete(String(seriesId));
      state.addControllers.delete(String(seriesId));
      updateAddButton(seriesId);
    }
  }

  elements.genreOptions.addEventListener("click", (event) => {
    const option = event.target
      .closest?.("[data-discovery-group][data-option-id]");
    if (!option) {
      return;
    }
    activateOption("genre", option.dataset.optionId || "");
  });

  elements.genreOptions.addEventListener("keydown", handleOptionKeyboard);
  elements.advanced.addEventListener("click", (event) => {
    const showOptions = event.target.closest?.(
      '[data-action="show-options"]',
    );
    if (showOptions) {
      openOptions(showOptions.dataset.group, showOptions);
      return;
    }
    const option = event.target.closest?.(
      "[data-discovery-group][data-option-id]",
    );
    if (option) {
      activateOption(
        option.dataset.discoveryGroup,
        option.dataset.optionId || "",
      );
    }
  });
  elements.advanced.addEventListener("keydown", handleOptionKeyboard);

  elements.optionsGrid.addEventListener("click", (event) => {
    const option = event.target.closest?.(
      "[data-discovery-group][data-option-id]",
    );
    if (!option) {
      return;
    }
    activateOption(
      option.dataset.discoveryGroup,
      option.dataset.optionId || "",
    );
  });
  elements.optionsGrid.addEventListener("keydown", handleOptionKeyboard);
  elements.optionsClose.addEventListener("click", () => closeOptions());
  elements.optionsDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeOptions();
  });
  elements.optionsDialog.addEventListener("click", (event) => {
    if (event.target === elements.optionsDialog) {
      closeOptions();
    }
  });
  elements.optionsDialog.addEventListener("close", () => {
    if (state.optionsTrigger?.isConnected) {
      state.optionsTrigger.focus();
    }
    state.optionsGroup = "";
    state.optionsTrigger = null;
  });

  elements.toggleAdvanced.addEventListener("click", () => {
    state.filterExpanded = !state.filterExpanded;
    syncFilterToggle();
    scheduleOverflowUpdate();
  });
  elements.reset.addEventListener("click", resetFilters);
  elements.refresh.addEventListener("click", () => {
    loadFirstPage({ clear: false });
  });
  elements.loadMore.addEventListener("click", loadMore);

  elements.list.addEventListener("click", (event) => {
    const action = event.target.closest?.("[data-action]");
    if (!action) {
      return;
    }
    if (action.dataset.action === "add") {
      addToWatchlist(action.dataset.seriesId, action);
    } else if (action.dataset.action === "retry") {
      loadFirstPage({ clear: true });
    } else if (action.dataset.action === "reset") {
      resetFilters();
    }
  });

  if (typeof ResizeObserver !== "function") {
    window.addEventListener("resize", scheduleOverflowUpdate, {
      passive: true,
    });
  }

  renderFilters();
  renderResults();
  loadFirstPage();
})();
