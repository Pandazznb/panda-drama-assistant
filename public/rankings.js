(() => {
  const APP_TIME_ZONE = "Asia/Shanghai";
  const CATEGORY_KEYS = ["all", "comic", "human", "ai"];
  const TYPE_KEYS = [
    "hot",
    "prestige",
    "subscribe",
    "new",
    "hot-search",
    "must-watch",
    "followed",
  ];
  const CATEGORY_CONFIG = Object.freeze({
    all: { label: "全部" },
    comic: { label: "漫剧" },
    human: { label: "真人剧" },
    ai: { label: "AI剧" },
  });
  const TYPE_CONFIG = Object.freeze({
    hot: {
      label: "热播榜",
      description: "按红果官方观看和互动综合热度排序。",
    },
    prestige: {
      label: "臻果榜",
      description: "按红果官方已开分真人剧评分排序。",
    },
    subscribe: {
      label: "预约榜",
      description: "按红果官方预约和播放期待值排序。",
    },
    new: {
      label: "新剧榜",
      description: "按红果官方近期上架剧集热度排序。",
    },
    "hot-search": {
      label: "热搜榜",
      description: "按红果官方搜索和互动热度排序。",
    },
    "must-watch": {
      label: "必看榜",
      description: "按红果官方回溯最高热度排序。",
    },
    followed: {
      label: "收藏榜",
      description: "按红果官方累计收藏人数排序。",
    },
  });
  const AVAILABILITY = Object.freeze({
    hot: CATEGORY_KEYS,
    prestige: ["all"],
    subscribe: ["all"],
    new: CATEGORY_KEYS,
    "hot-search": CATEGORY_KEYS,
    "must-watch": ["all", "human", "ai"],
    followed: ["all", "human", "ai"],
  });

  const elements = {
    categories: [...document.querySelectorAll("[data-ranking-category]")],
    tabs: [...document.querySelectorAll("[data-ranking-type]")],
    filterRows: [...document.querySelectorAll(".rankings-filter__row")],
    refresh: document.querySelector("#rankings-refresh"),
    updated: document.querySelector("#rankings-updated"),
    notice: document.querySelector("#rankings-notice"),
    status: document.querySelector("#rankings-status"),
    list: document.querySelector("#rankings-list"),
    listTitle: document.querySelector("#rankings-list-title"),
    resultCount: document.querySelector("#rankings-result-count"),
    description: document.querySelector("#rankings-description"),
    officialUpdated: document.querySelector("#rankings-official-updated"),
    sourceLink: document.querySelector("#rankings-source-link"),
    toast: document.querySelector("#rankings-toast"),
  };

  if (!elements.categories.length || !elements.tabs.length || !elements.list) {
    return;
  }

  const state = {
    activeCategory: "all",
    activeType: "hot",
    items: [],
    loadedKey: "",
    loaded: false,
    loading: false,
    updatedText: "",
    selectionNote: "",
    loadController: null,
    requestToken: 0,
    pendingAdds: new Set(),
    pendingRemovals: new Set(),
    addControllers: new Map(),
    removeControllers: new Map(),
    toastTimer: null,
    toastHideTimer: null,
  };
  let filterHintFrame = 0;

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

  function safeHttpsUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function escapeSelectorValue(value) {
    const text = String(value);
    if (typeof globalThis.CSS?.escape === "function") {
      return globalThis.CSS.escape(text);
    }
    return text.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  }

  function formatRankingDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      return "时间未知";
    }
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: APP_TIME_ZONE,
      month: "numeric",
      day: "numeric",
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return month && day ? `${month}月${day}日已更新` : "时间未知";
  }

  function selectionKey() {
    return `${state.activeType}:${state.activeCategory}`;
  }

  function isAvailable(type, category) {
    return Boolean(AVAILABILITY[type]?.includes(category));
  }

  function firstAvailableCategory(type) {
    return (
      AVAILABILITY[type]?.find((category) => CATEGORY_KEYS.includes(category)) ||
      "all"
    );
  }

  function firstAvailableType(category) {
    return TYPE_KEYS.find((type) => isAvailable(type, category)) || "hot";
  }

  function officialRankingPath(category = state.activeCategory, type = state.activeType) {
    const segment =
      category === "all"
        ? ""
        : category === "human"
          ? "real-"
          : `${category}-`;
    return `/rank/${type}-${segment}drama`;
  }

  function officialRankingUrl() {
    return `https://hongguoduanju.com${officialRankingPath()}`;
  }

  function currentTitle() {
    return `${CATEGORY_CONFIG[state.activeCategory].label} · ${
      TYPE_CONFIG[state.activeType].label
    }`;
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

  function statusMeta(status) {
    const normalized = ["updating", "completed", "inactive", "unknown"].includes(
      status,
    )
      ? status
      : "";
    if (!normalized) {
      return null;
    }
    return {
      className: `is-${normalized}`,
      label: {
        updating: "更新中",
        completed: "已完结",
        inactive: "已停更",
        unknown: "状态未知",
      }[normalized],
      icon: {
        updating: "play-list",
        completed: "check",
        inactive: "clock",
        unknown: "alert",
      }[normalized],
    };
  }

  function rankOf(item, index) {
    const value = Number(item?.rank);
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : index + 1;
  }

  function episodeLabel(item) {
    const rightText = String(item?.rightText || "").trim();
    if (rightText) {
      return rightText;
    }
    const count = Number(item?.episodeCount);
    return Number.isFinite(count) && count > 0
      ? `共 ${Math.floor(count)} 集`
      : "集数待更新";
  }

  function coverMarkup(item) {
    const coverUrl = safeHttpsUrl(item?.coverUrl);
    const fallback = `<span class="ranking-item__cover-fallback">${icon("tv")}</span>`;
    if (!coverUrl) {
      return fallback;
    }
    return `${fallback}<img class="ranking-item__cover-image" src="${escapeHtml(
      coverUrl,
    )}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }

  function coverLinkMarkup(item, title) {
    const detailUrl = safeHttpsUrl(item?.detailUrl);
    const cover = coverMarkup(item);
    if (!detailUrl) {
      return `<span class="ranking-item__cover" aria-hidden="true">${cover}</span>`;
    }
    return `
      <a
        class="ranking-item__cover"
        href="${escapeHtml(detailUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="${escapeHtml(`在红果官网查看《${title}》`)}"
      >
        ${cover}
      </a>
    `;
  }

  function detailLinkMarkup(item, title) {
    const detailUrl = safeHttpsUrl(item?.detailUrl);
    if (!detailUrl) {
      return "";
    }
    return `
      <a
        class="ranking-item__detail"
        href="${escapeHtml(detailUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="在红果官网查看《${escapeHtml(title)}》详情"
      >
        官网详情
        ${icon("external")}
      </a>
    `;
  }

  function addButtonMarkup(item, title) {
    const tracked = Boolean(item?.tracked);
    const seriesId = String(item?.seriesId || "");
    const pendingAdd = state.pendingAdds.has(seriesId);
    const pendingRemoval = state.pendingRemovals.has(seriesId);
    const busy = pendingAdd || pendingRemoval;
    const iconName = busy ? "refresh" : tracked ? "check" : "plus";
    const label = pendingRemoval
      ? "取消中…"
      : pendingAdd
        ? "加入中…"
        : tracked
          ? "正在追更"
          : "加入追更";
    return `
      <button
        class="button ranking-add${tracked ? " is-tracked" : ""}${
          busy ? " is-busy" : ""
        }"
        type="button"
        data-action="toggle"
        data-series-id="${escapeHtml(seriesId)}"
        aria-pressed="${String(tracked)}"
        aria-label="${escapeHtml(
          tracked
            ? `《${title}》正在追更，点击停止追更`
            : `将《${title}》加入我的追更`,
        )}"
        title="${escapeHtml(tracked ? "点击停止追更" : "加入追更")}"
        ${busy ? 'aria-disabled="true" aria-busy="true"' : ""}
      >
        ${icon(iconName)}
        <span>${label}</span>
      </button>
    `;
  }

  function rowMarkup(item, index) {
    const rank = rankOf(item, index);
    const title = String(item?.title || "未命名短剧").trim() || "未命名短剧";
    const status = statusMeta(item?.status);
    const statusTags = (Array.isArray(item?.statusTags) ? item.statusTags : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 2);
    const categories = (Array.isArray(item?.categories)
      ? item.categories
      : []
    )
      .map((category) => String(category || "").trim())
      .filter((category) => category && !statusTags.includes(category))
      .slice(0, 3);
    const categoryMarkup = categories
      .map(
        (category) =>
          `<span class="ranking-item__category">${escapeHtml(category)}</span>`,
      )
      .join("");
    const categoriesMarkup = categoryMarkup
      ? `<span class="ranking-item__categories">${categoryMarkup}</span>`
      : "";
    const statusTagMarkup = statusTags
      .map(
        (tag) =>
          `<span class="ranking-item__category is-status-tag">${escapeHtml(
            tag,
          )}</span>`,
      )
      .join("");
    const metricText = String(item?.metricText || "").trim();
    const metricMarkup = metricText
      ? `<span class="ranking-item__metric">${escapeHtml(metricText)}</span>`
      : "";
    const statusMarkup = status
      ? `<span class="ranking-item__status ${status.className}">
          ${icon(status.icon)}
          ${status.label}
        </span>`
      : "";
    const factsMarkup = `
      <div class="ranking-item__facts">
        <span class="ranking-item__episodes">${escapeHtml(
          episodeLabel(item),
        )}</span>
        ${metricMarkup}
      </div>
    `;
    const tagsMarkup = `
      <div class="ranking-item__tags">
        ${statusMarkup}
        ${statusTagMarkup}
        ${categoriesMarkup}
      </div>
    `;
    const detailUrl = safeHttpsUrl(item?.detailUrl);
    const cover = coverLinkMarkup(item, title);
    const titleMarkup = detailUrl
      ? `<h3><a href="${escapeHtml(detailUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          title,
        )}</a></h3>`
      : `<h3>${escapeHtml(title)}</h3>`;

    return `
      <article class="ranking-item ranking-row" data-series-id="${escapeHtml(
        item?.seriesId || "",
      )}">
        <div class="ranking-item__rank${rank <= 3 ? " is-top" : ""}" aria-label="第 ${rank} 名">
          <span>${rank}</span>
          <small>名</small>
        </div>
        ${cover}
        <div class="ranking-item__body">
          <div class="ranking-item__heading">
            ${titleMarkup}
            ${detailLinkMarkup(item, title)}
          </div>
          <div class="ranking-item__meta">
            ${factsMarkup}
            ${tagsMarkup}
          </div>
        </div>
        ${addButtonMarkup(item, title)}
      </article>
    `;
  }

  function skeletonMarkup() {
    return Array.from(
      { length: 5 },
      (_, index) => `
        <div class="ranking-skeleton"${index ? ' aria-hidden="true"' : ' aria-label="正在加载榜单"'}>
          <span class="skeleton ranking-skeleton__rank"></span>
          <span class="skeleton ranking-skeleton__cover"></span>
          <span class="ranking-skeleton__body">
            <span class="skeleton ranking-skeleton__title"></span>
            <span class="skeleton ranking-skeleton__line"></span>
          </span>
          <span class="skeleton ranking-skeleton__button"></span>
        </div>
      `,
    ).join("");
  }

  function emptyMarkup({ error = false, message = "" } = {}) {
    const title = error ? "榜单暂时无法读取" : "这里还没有榜单内容";
    const detail =
      message ||
      (error
        ? "请稍后重试，服务恢复后榜单会自动回到这里。"
        : "红果官方暂未返回这个分类的榜单内容。");
    return `
      <div class="rankings-empty${error ? " is-error" : ""}">
        <span class="rankings-empty__icon">${icon(error ? "alert" : "inbox")}</span>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(detail)}</p>
        ${
          error
            ? '<button class="button button--secondary rankings-empty__retry" type="button" data-action="retry">重新加载</button>'
            : ""
        }
      </div>
    `;
  }

  function updateControls() {
    for (const button of elements.categories) {
      const category = button.dataset.rankingCategory;
      const selected = category === state.activeCategory;
      const available = isAvailable(state.activeType, category);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = !available;
      button.hidden = !available;
      button.title = available
        ? `${CATEGORY_CONFIG[category].label}榜单分类`
        : `${TYPE_CONFIG[state.activeType].label}官方未提供${
            CATEGORY_CONFIG[category].label
          }分类`;
    }
    for (const tab of elements.tabs) {
      const type = tab.dataset.rankingType;
      const selected = type === state.activeType;
      const available = isAvailable(type, state.activeCategory);
      tab.setAttribute("aria-selected", String(selected));
      tab.disabled = !available;
      tab.hidden = !available;
      tab.tabIndex = available && selected ? 0 : -1;
      tab.title = available
        ? `${TYPE_CONFIG[type].label}榜单`
        : `${CATEGORY_CONFIG[state.activeCategory].label}分类官方未提供${
            TYPE_CONFIG[type].label
          }`;
    }
    scheduleFilterScrollHints();
  }

  function updateFilterScrollHint(row) {
    const scroller = row.querySelector(".rankings-categories, .rankings-tabs");
    if (!scroller) {
      return;
    }
    const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
    const scrollable = maxScrollLeft > 1;
    row.classList.toggle("is-scrollable", scrollable);
    row.classList.toggle(
      "is-scroll-end",
      !scrollable || scroller.scrollLeft >= maxScrollLeft - 2,
    );
  }

  function updateFilterScrollHints() {
    filterHintFrame = 0;
    for (const row of elements.filterRows) {
      updateFilterScrollHint(row);
    }
  }

  function scheduleFilterScrollHints() {
    cancelAnimationFrame(filterHintFrame);
    filterHintFrame = requestAnimationFrame(updateFilterScrollHints);
  }

  function updateRenderedButton(seriesId) {
    const item = state.items.find(
      (candidate) => String(candidate?.seriesId || "") === String(seriesId),
    );
    if (!item) {
      return;
    }
    const button = elements.list.querySelector(
      `[data-action="toggle"][data-series-id="${escapeSelectorValue(
        seriesId,
      )}"]`,
    );
    if (!button) {
      return;
    }
    updateAddButton(button, item);
  }

  function updateAddButton(button, item) {
    const seriesId = String(item?.seriesId || "");
    const tracked = Boolean(item?.tracked);
    const pendingAdd = state.pendingAdds.has(seriesId);
    const pendingRemoval = state.pendingRemovals.has(seriesId);
    const busy = pendingAdd || pendingRemoval;
    const title = String(item?.title || "未命名短剧").trim() || "未命名短剧";

    button.classList.toggle("is-tracked", tracked);
    button.classList.toggle("is-busy", busy);
    if (busy) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
    button.setAttribute("aria-pressed", String(tracked));
    button.setAttribute(
      "aria-label",
      tracked
        ? `《${title}》正在追更，点击停止追更`
        : `将《${title}》加入我的追更`,
    );
    button.title = tracked ? "点击停止追更" : "加入追更";
    if (busy) {
      button.setAttribute("aria-busy", "true");
    } else {
      button.removeAttribute("aria-busy");
    }
    button
      .querySelector("use")
      ?.setAttribute(
        "href",
        busy ? "#icon-refresh" : tracked ? "#icon-check" : "#icon-plus",
      );
    const label = button.querySelector("span");
    if (label) {
      label.textContent = pendingRemoval
        ? "取消中…"
        : pendingAdd
          ? "加入中…"
          : tracked
            ? "正在追更"
            : "加入追更";
    }
  }

  function markTracked(seriesId, subscriptionId = "") {
    for (const item of state.items) {
      if (String(item?.seriesId || "") === String(seriesId)) {
        item.tracked = true;
        item.subscriptionId = subscriptionId || item.subscriptionId || null;
      }
    }
    updateRenderedButton(seriesId);
  }

  function markUntracked(seriesId) {
    for (const item of state.items) {
      if (String(item?.seriesId || "") === String(seriesId)) {
        item.tracked = false;
        item.subscriptionId = null;
      }
    }
    updateRenderedButton(seriesId);
  }

  function render() {
    elements.listTitle.textContent = currentTitle();
    elements.description.textContent =
      TYPE_CONFIG[state.activeType].description;
    elements.officialUpdated.textContent =
      state.updatedText || "正在读取官方更新时间…";
    elements.resultCount.textContent = state.loaded
      ? `${state.items.length} 部`
      : "-";
    elements.sourceLink.href = officialRankingUrl();
    elements.list.setAttribute(
      "aria-labelledby",
      `rankings-tab-${state.activeType}`,
    );
    elements.list.setAttribute("aria-busy", String(state.loading));
    updateControls();

    if (!state.loaded && state.loading) {
      elements.list.innerHTML = skeletonMarkup();
      return;
    }

    if (state.error && !state.loaded) {
      elements.list.innerHTML = emptyMarkup({
        error: true,
        message: state.error,
      });
      return;
    }

    if (!state.items.length) {
      elements.list.innerHTML = emptyMarkup();
      return;
    }

    elements.list.innerHTML = state.items
      .map((item, index) => rowMarkup(item, index))
      .join("");

    for (const image of elements.list.querySelectorAll(
      ".ranking-item__cover-image",
    )) {
      const hideBrokenImage = () => {
        image.hidden = true;
        image.closest(".ranking-item__cover")?.classList.add("has-fallback");
      };
      image.addEventListener("error", hideBrokenImage, { once: true });
      if (image.complete && image.naturalWidth === 0) {
        hideBrokenImage();
      }
    }
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
      // Keep the HTTP status as the useful error when the body is not JSON.
    }
    if (!response.ok || payload?.ok === false) {
      const error = new Error(
        payload?.error?.message || `请求失败（HTTP ${response.status}）。`,
      );
      error.code = payload?.error?.code || "REQUEST_FAILED";
      error.status = response.status;
      error.subscriptionId = payload?.error?.subscriptionId || "";
      error.seriesTitle = payload?.error?.seriesTitle || "";
      throw error;
    }
    return payload;
  }

  async function loadRankings({ force = false } = {}) {
    if (!isAvailable(state.activeType, state.activeCategory)) {
      const previousType = TYPE_CONFIG[state.activeType].label;
      state.activeType = firstAvailableType(state.activeCategory);
      state.selectionNote = `当前分类未提供${previousType}，已切换到${
        TYPE_CONFIG[state.activeType].label
      }。`;
    }
    state.loadController?.abort();
    const controller = new AbortController();
    state.loadController = controller;
    const requestToken = ++state.requestToken;
    const requestedKey = selectionKey();
    if (state.loadedKey !== requestedKey) {
      state.items = [];
      state.loaded = false;
      state.updatedText = "";
    }
    const isInitial = !state.loaded;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45_000);

    state.loading = true;
    state.error = "";
    elements.refresh.disabled = true;
    elements.refresh.classList.add("is-busy");
    elements.refresh.setAttribute("aria-busy", "true");
    elements.list.setAttribute("aria-busy", "true");
    setNotice(state.selectionNote);
    setStatus(isInitial ? "正在读取红果官方榜单…" : "正在刷新榜单…");
    if (isInitial) {
      render();
    } else {
      updateControls();
    }

    const params = new URLSearchParams({
      category: state.activeCategory,
      type: state.activeType,
    });
    if (force) {
      params.set("refresh", "1");
    }

    try {
      const payload = await fetchJson(`/api/rankings?${params}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (
        requestToken !== state.requestToken ||
        requestedKey !== selectionKey()
      ) {
        return;
      }
      state.items = Array.isArray(payload.items) ? payload.items : [];
      state.updatedText = String(payload.updatedText || "");
      state.loadedKey = requestedKey;
      state.loaded = true;
      state.error = "";
      elements.updated.textContent = formatRankingDate(payload.fetchedAt);
      setNotice(
        payload.warning ||
          (payload.stale
            ? "榜单更新失败，当前显示上次成功获取的内容。"
            : state.selectionNote),
      );
      setStatus("");
    } catch (error) {
      if (
        requestToken !== state.requestToken ||
        requestedKey !== selectionKey()
      ) {
        return;
      }
      if (error.name === "AbortError" && timedOut) {
        state.error = "榜单加载超时，请稍后重试。";
      } else if (error.name !== "AbortError") {
        state.error = error.message || "榜单暂时无法读取，请稍后重试。";
      }
      if (state.error) {
        setStatus(state.error, "error");
        render();
      }
    } finally {
      if (requestToken === state.requestToken) {
        clearTimeout(timeout);
        state.loading = false;
        elements.refresh.disabled = false;
        elements.refresh.classList.remove("is-busy");
        elements.refresh.removeAttribute("aria-busy");
        elements.list.setAttribute("aria-busy", "false");
        render();
      }
    }
  }

  async function addRanking(seriesId, button) {
    const item = state.items.find(
      (candidate) => String(candidate?.seriesId || "") === String(seriesId),
    );
    if (!item || item.tracked || state.pendingAdds.has(String(seriesId))) {
      return;
    }

    state.pendingAdds.add(String(seriesId));
    const pendingButton = button;
    const title = String(item.title || "未命名短剧").trim() || "未命名短剧";
    updateAddButton(pendingButton, item);
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
          markTracked(seriesId, error.subscriptionId);
          showToast(`《${title}》已经在追更中。`);
          return;
        }
        throw error;
      }
      markTracked(seriesId, payload?.result?.subscriptionId);
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
      updateRenderedButton(seriesId);
    }
  }

  async function removeRanking(seriesId, button) {
    const item = state.items.find(
      (candidate) => String(candidate?.seriesId || "") === String(seriesId),
    );
    if (
      !item ||
      !item.tracked ||
      state.pendingAdds.has(String(seriesId)) ||
      state.pendingRemovals.has(String(seriesId))
    ) {
      return;
    }

    const title = String(item.title || "未命名短剧").trim() || "未命名短剧";
    let subscriptionId = String(item.subscriptionId || "");
    if (!subscriptionId) {
      const dashboard = await fetchJson("/api/state");
      const subscription = (dashboard?.subscriptions || []).find((candidate) =>
        (candidate?.seasons || []).some(
          (season) => String(season?.seriesId || "") === String(seriesId),
        ),
      );
      subscriptionId = String(subscription?.id || "");
      if (subscriptionId) {
        item.subscriptionId = subscriptionId;
      }
    }
    if (!subscriptionId) {
      showToast("未找到这条追更记录，请刷新榜单后重试。", "error");
      return;
    }

    state.pendingRemovals.add(String(seriesId));
    updateAddButton(button, item);
    const controller = new AbortController();
    state.removeControllers.set(String(seriesId), controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);

    try {
      const payload = await fetchJson(
        `/api/subscriptions/${encodeURIComponent(subscriptionId)}`,
        {
          method: "DELETE",
          signal: controller.signal,
        },
      );
      markUntracked(seriesId);
      showToast(payload.message || `已停止追更：《${title}》`);
    } catch (error) {
      if (timedOut) {
        showToast("停止追更超时，请稍后重试。", "error");
      } else if (error.name !== "AbortError") {
        showToast(error.message || "停止追更失败，请稍后重试。", "error");
      }
    } finally {
      clearTimeout(timeout);
      state.pendingRemovals.delete(String(seriesId));
      state.removeControllers.delete(String(seriesId));
      updateRenderedButton(seriesId);
    }
  }

  function activateCategory(category, { focus = false } = {}) {
    if (!CATEGORY_KEYS.includes(category)) {
      return;
    }
    const previousType = state.activeType;
    const typeChanged = !isAvailable(previousType, category);
    state.activeCategory = category;
    if (typeChanged) {
      state.activeType = firstAvailableType(category);
      state.selectionNote = `${CATEGORY_CONFIG[category].label}分类官方未提供${
        TYPE_CONFIG[previousType].label
      }，已切换到${TYPE_CONFIG[state.activeType].label}。`;
    } else {
      state.selectionNote = "";
    }
    render();
    if (
      !typeChanged &&
      elements.categories.find(
        (button) => button.dataset.rankingCategory === category,
      )?.getAttribute("aria-pressed") === "true" &&
      state.loadedKey === selectionKey() &&
      state.loaded
    ) {
      if (focus) {
        const button = elements.categories.find(
          (candidate) => candidate.dataset.rankingCategory === category,
        );
        button?.focus();
        button?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      return;
    }
    loadRankings();
    if (focus) {
      const button = elements.categories.find(
        (candidate) => candidate.dataset.rankingCategory === category,
      );
      button?.focus();
      button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function activateType(type, { focus = false } = {}) {
    if (!TYPE_KEYS.includes(type)) {
      return;
    }
    const previousCategory = state.activeCategory;
    const categoryChanged = !isAvailable(type, state.activeCategory);
    state.activeType = type;
    if (categoryChanged) {
      state.activeCategory = firstAvailableCategory(type);
      state.selectionNote = `${TYPE_CONFIG[type].label}未提供${
        CATEGORY_CONFIG[previousCategory].label
      }分类，已切换到${CATEGORY_CONFIG[state.activeCategory].label}。`;
    } else {
      state.selectionNote = "";
    }
    render();
    if (!categoryChanged && state.loadedKey === selectionKey() && state.loaded) {
      if (focus) {
        const tab = elements.tabs.find(
          (candidate) => candidate.dataset.rankingType === type,
        );
        tab?.focus();
        tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      return;
    }
    loadRankings();
    if (focus) {
      const tab = elements.tabs.find(
        (candidate) => candidate.dataset.rankingType === type,
      );
      tab?.focus();
      tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleTabKeydown(event) {
    const enabledTabs = elements.tabs.filter(
      (tab) => !tab.disabled && !tab.hidden,
    );
    const currentIndex = enabledTabs.findIndex(
      (tab) => tab.dataset.rankingType === state.activeType,
    );
    if (currentIndex < 0 || !enabledTabs.length) {
      return;
    }
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledTabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    activateType(enabledTabs[nextIndex].dataset.rankingType, {
      focus: true,
    });
  }

  for (const button of elements.categories) {
    button.addEventListener("click", () => {
      activateCategory(button.dataset.rankingCategory);
    });
  }
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      activateType(tab.dataset.rankingType);
    });
    tab.addEventListener("keydown", handleTabKeydown);
  }
  for (const row of elements.filterRows) {
    row
      .querySelector(".rankings-categories, .rankings-tabs")
      ?.addEventListener("scroll", () => updateFilterScrollHint(row), {
        passive: true,
      });
  }

  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(scheduleFilterScrollHints);
    for (const row of elements.filterRows) {
      resizeObserver.observe(row);
    }
  } else {
    window.addEventListener("resize", scheduleFilterScrollHints, {
      passive: true,
    });
  }

  elements.refresh.addEventListener("click", () => {
    loadRankings({ force: true });
  });

  elements.list.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest("[data-action]");
    if (!action) {
      return;
    }
    if (action.dataset.action === "retry") {
      loadRankings({ force: true });
      return;
    }
    if (action.dataset.action === "toggle") {
      const item = state.items.find(
        (candidate) =>
          String(candidate?.seriesId || "") ===
          String(action.dataset.seriesId || ""),
      );
      if (item?.tracked) {
        removeRanking(action.dataset.seriesId, action);
      } else {
        addRanking(action.dataset.seriesId, action);
      }
    }
  });

  updateControls();
  render();
  loadRankings();
})();
