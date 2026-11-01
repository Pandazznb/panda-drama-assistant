(() => {
  const APP_TIME_ZONE = "Asia/Shanghai";
  const PAGE_SIZE = 100;
  const VIEWS = new Set(["events", "system"]);
  const elements = {
    tabs: [...document.querySelectorAll("[data-log-view]")],
    listTitle: document.querySelector("#logs-list-title"),
    total: document.querySelector("#logs-total"),
    fileCount: document.querySelector("#logs-file-count"),
    newest: document.querySelector("#logs-newest"),
    storage: document.querySelector("#logs-storage"),
    openFile: document.querySelector("#logs-open-file"),
    refresh: document.querySelector("#logs-refresh"),
    status: document.querySelector("#logs-status"),
    list: document.querySelector("#logs-list"),
    range: document.querySelector("#logs-range"),
  };
  const initialView = window.location.hash === "#system"
    ? "system"
    : "events";
  const state = {
    view: initialView,
    loading: false,
    controller: null,
    requestToken: 0,
    total: 0,
    loadedCount: 0,
    seenRecordIds: new Set(),
  };

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

  function formatDateTime(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      return "时间未知";
    }
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(date);
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "1 MiB";
    }
    if (bytes >= 1024 * 1024) {
      return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MiB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  }

  function viewLabel(view = state.view) {
    return view === "system" ? "系统操作" : "追更动态";
  }

  function eventTypeLabel(type) {
    return (
      {
        baseline: "首次记录",
        episode: "集数更新",
        season: "新季发现",
        completed: "系列完结",
        error: "检查异常",
      }[type] || "系统动态"
    );
  }

  function eventIcon(type) {
    if (type === "episode" || type === "season") {
      return "bell";
    }
    if (type === "completed") {
      return "check";
    }
    if (type === "error") {
      return "alert";
    }
    return "clock";
  }

  function deliveryState(event) {
    if (event.notified) {
      return {
        label: "已通知",
        className: "is-success",
      };
    }
    if (event.notificationError) {
      return {
        label: "通知失败，等待重试",
        className: "is-error",
      };
    }
    if (event.notificationDueAt) {
      return {
        label: `等待汇总 · ${formatDateTime(event.notificationDueAt)}`,
        className: "is-pending",
      };
    }
    if (event.type === "baseline" || event.type === "error") {
      return {
        label: "无需通知",
        className: "is-neutral",
      };
    }
    return {
      label: "通知未送达",
      className: "is-neutral",
    };
  }

  function eventHtml(event) {
    const delivery = deliveryState(event);
    const eventType = escapeHtml(event.type);
    const message = event.message || eventTypeLabel(event.type);
    return `
      <article
        class="log-entry log-entry--${eventType}"
        aria-label="${escapeHtml(
          `${eventTypeLabel(event.type)}，${formatDateTime(event.createdAt)}`,
        )}"
      >
        <span class="log-entry__icon">${icon(eventIcon(event.type))}</span>
        <div class="log-entry__body">
          <div class="log-entry__heading">
            <strong>${escapeHtml(eventTypeLabel(event.type))}</strong>
            <time datetime="${escapeHtml(event.createdAt)}">${escapeHtml(
              formatDateTime(event.createdAt),
            )}</time>
          </div>
          <p class="log-entry__message">${escapeHtml(message)}</p>
          <div class="log-entry__meta">
            <span class="log-delivery ${delivery.className}">${escapeHtml(
              delivery.label,
            )}</span>
            ${
              event.logFile
                ? `<code title="日志文件：${escapeHtml(
                    event.logFile,
                  )}">${escapeHtml(event.logFile)}</code>`
                : ""
            }
          </div>
          ${
            event.notificationError
              ? `<p class="log-entry__error">${escapeHtml(
                  event.notificationError,
                )}</p>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function systemLevelMeta(level) {
    return (
      {
        success: {
          label: "完成",
          className: "is-success",
          icon: "check",
        },
        warning: {
          label: "需注意",
          className: "is-pending",
          icon: "alert",
        },
        error: {
          label: "失败",
          className: "is-error",
          icon: "alert",
        },
        info: {
          label: "操作",
          className: "is-neutral",
          icon: "settings",
        },
      }[level] || {
        label: "操作",
        className: "is-neutral",
        icon: "settings",
      }
    );
  }

  function systemCategoryLabel(category) {
    return (
      {
        account: "账号",
        subscription: "追更",
        monitor: "检查",
        notification: "通知",
        settings: "设置",
        screenshot: "截图导入",
        system: "系统",
      }[category] || "系统"
    );
  }

  function systemLogHtml(entry) {
    const level = systemLevelMeta(entry.level);
    const category = systemCategoryLabel(entry.category);
    return `
      <article
        class="log-entry log-entry--system"
        aria-label="${escapeHtml(
          `${category}，${level.label}，${formatDateTime(entry.createdAt)}`,
        )}"
      >
        <span class="log-entry__icon log-entry__icon--${escapeHtml(
          entry.level || "info",
        )}">${icon(level.icon)}</span>
        <div class="log-entry__body">
          <div class="log-entry__heading">
            <strong>${escapeHtml(category)} · ${escapeHtml(level.label)}</strong>
            <time datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(
              formatDateTime(entry.createdAt),
            )}</time>
          </div>
          <p class="log-entry__message">${escapeHtml(
            entry.message || "系统已完成一项操作。",
          )}</p>
          <div class="log-entry__meta">
            <span class="log-delivery ${level.className}">${escapeHtml(
              level.label,
            )}</span>
            ${
              entry.action
                ? `<code title="动作标识：${escapeHtml(
                    entry.action,
                  )}">${escapeHtml(entry.action)}</code>`
                : ""
            }
            ${
              entry.logFile
                ? `<code title="日志文件：${escapeHtml(
                    entry.logFile,
                  )}">${escapeHtml(entry.logFile)}</code>`
                : ""
            }
          </div>
        </div>
      </article>
    `;
  }

  function recordHtml(record) {
    return state.view === "system"
      ? systemLogHtml(record)
      : eventHtml(record);
  }

  function emptyStateHtml() {
    const isSystem = state.view === "system";
    return `
      <div class="empty-state logs-empty">
        <span class="empty-state__icon">${icon("inbox")}</span>
        <h3>还没有${viewLabel()}记录</h3>
        <p>${
          isSystem
            ? "登录、同步、修改设置等操作会以易懂的文字记录在这里。"
            : "后续产生的更新、新季和检查异常会保存到这里。"
        }</p>
      </div>
    `;
  }

  function errorStateHtml(message) {
    return `
      <div class="empty-state logs-error">
        <span class="empty-state__icon">${icon("alert")}</span>
        <h3>${viewLabel()}加载失败</h3>
        <p>${escapeHtml(message || "请稍后刷新重试。")}</p>
      </div>
    `;
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", isError);
    elements.status.hidden = !message;
  }

  function updateSummary(page) {
    state.total = Number(page.total) || 0;
    elements.total.textContent = String(state.total);
    elements.fileCount.textContent = String(Number(page.fileCount) || 0);
    elements.newest.textContent = page.newestAt
      ? formatDateTime(page.newestAt)
      : "暂无记录";
    elements.range.textContent = state.total
      ? state.total > state.loadedCount
        ? `共 ${state.total} 条${viewLabel()}，显示最近 ${state.loadedCount} 条`
        : `共 ${state.total} 条${viewLabel()}`
      : "";
    const storage = page.storage || {};
    const retentionDays =
      Math.max(1, Number(storage.retentionDays) || 30);
    elements.storage.textContent = `${
      storage.timeZone === APP_TIME_ZONE ? "北京时间按天归档" : "按天归档"
    } · 单卷上限 ${formatBytes(storage.maxFileBytes)} · 仅保留最近 ${
      retentionDays
    } 天 · 当前 ${Number(page.fileCount) || 0} 个文件`;
  }

  function updateViewChrome() {
    const isSystem = state.view === "system";
    const activeTab = isSystem
      ? document.querySelector("#logs-tab-system")
      : document.querySelector("#logs-tab-events");
    for (const tab of elements.tabs) {
      const selected = tab.dataset.logView === state.view;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    elements.listTitle.textContent = viewLabel();
    elements.list.setAttribute("aria-labelledby", activeTab.id);
    elements.openFile.href = isSystem
      ? "/api/system-logs/file"
      : "/api/logs/file";
    elements.openFile.setAttribute(
      "aria-label",
      `在新标签页打开全部${viewLabel()}文件`,
    );
  }

  async function loadLogs({ reset = false } = {}) {
    if (state.loading) {
      state.controller?.abort();
    }

    const requestToken = ++state.requestToken;
    const controller = new AbortController();
    state.controller = controller;
    state.loading = true;
    elements.refresh.disabled = true;
    elements.list.setAttribute("aria-busy", "true");
    setStatus(`正在读取${viewLabel()}…`);
    if (reset) {
      state.total = 0;
      state.loadedCount = 0;
      state.seenRecordIds.clear();
      elements.list.innerHTML = "";
      elements.range.textContent = "";
    }

    const endpoint =
      state.view === "system" ? "/api/system-logs" : "/api/logs";

    try {
      const response = await fetch(
        `${endpoint}?offset=0&limit=${PAGE_SIZE}`,
        {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error?.message || `服务暂时无法读取${viewLabel()}。`,
        );
      }
      if (requestToken !== state.requestToken) {
        return;
      }

      const records = state.view === "system"
        ? payload.entries
        : payload.events;
      const freshRecords = (
        Array.isArray(records) ? records : []
      ).filter((record) => {
        const id = String(record.id || "");
        if (!id || state.seenRecordIds.has(id)) {
          return false;
        }
        state.seenRecordIds.add(id);
        return true;
      });
      state.loadedCount += freshRecords.length;

      if (reset && !freshRecords.length && !Number(payload.total)) {
        elements.list.innerHTML = emptyStateHtml();
      } else if (freshRecords.length) {
        elements.list.insertAdjacentHTML(
          "beforeend",
          freshRecords.map(recordHtml).join(""),
        );
      }

      updateSummary(payload);
      setStatus("");
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      const message =
        error?.message || `${viewLabel()}加载失败，请稍后重试。`;
      if (requestToken === state.requestToken && reset && !state.loadedCount) {
        elements.list.innerHTML = errorStateHtml(message);
      }
      if (requestToken === state.requestToken) {
        setStatus(message, true);
      }
    } finally {
      if (requestToken === state.requestToken) {
        state.loading = false;
        state.controller = null;
        elements.refresh.disabled = false;
        elements.list.setAttribute("aria-busy", "false");
      }
    }
  }

  function setView(view, { updateHash = true } = {}) {
    if (!VIEWS.has(view) || view === state.view) {
      updateViewChrome();
      return;
    }
    state.view = view;
    updateViewChrome();
    if (updateHash) {
      window.history.replaceState(null, "", `#${view}`);
    }
    void loadLogs({ reset: true });
  }

  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      setView(tab.dataset.logView);
    });
    tab.addEventListener("keydown", (event) => {
      const currentIndex = elements.tabs.indexOf(tab);
      let nextIndex = null;
      if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % elements.tabs.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex =
          (currentIndex - 1 + elements.tabs.length) %
          elements.tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = elements.tabs.length - 1;
      }
      if (nextIndex === null) {
        return;
      }
      event.preventDefault();
      const nextTab = elements.tabs[nextIndex];
      setView(nextTab.dataset.logView);
      nextTab.focus();
    });
  }

  elements.refresh.addEventListener("click", () => {
    void loadLogs({ reset: true });
  });
  window.addEventListener("hashchange", () => {
    const view =
      window.location.hash === "#system" ? "system" : "events";
    setView(view, { updateHash: false });
  });

  updateViewChrome();
  void loadLogs({ reset: true });
})();
