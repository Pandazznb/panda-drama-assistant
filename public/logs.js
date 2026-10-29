(() => {
  const APP_TIME_ZONE = "Asia/Shanghai";
  const PAGE_SIZE = 200;
  const elements = {
    total: document.querySelector("#logs-total"),
    fileCount: document.querySelector("#logs-file-count"),
    newest: document.querySelector("#logs-newest"),
    storage: document.querySelector("#logs-storage"),
    refresh: document.querySelector("#logs-refresh"),
    status: document.querySelector("#logs-status"),
    list: document.querySelector("#logs-list"),
    range: document.querySelector("#logs-range"),
    loadMore: document.querySelector("#logs-load-more"),
  };
  const state = {
    loading: false,
    offset: 0,
    nextOffset: null,
    total: 0,
    loadedCount: 0,
    hasMore: false,
    seenEventIds: new Set(),
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

  function emptyStateHtml() {
    return `
      <div class="empty-state logs-empty">
        <span class="empty-state__icon">${icon("inbox")}</span>
        <h3>还没有动态记录</h3>
        <p>后续产生的更新、新季和检查异常会保存到这里。</p>
      </div>
    `;
  }

  function errorStateHtml(message) {
    return `
      <div class="empty-state logs-error">
        <span class="empty-state__icon">${icon("alert")}</span>
        <h3>日志加载失败</h3>
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
      ? `已显示 ${state.loadedCount} / ${state.total} 条`
      : "";
    elements.loadMore.hidden = !state.hasMore;
    elements.loadMore.disabled = state.loading;
    const storage = page.storage || {};
    elements.storage.textContent = `${
      storage.timeZone === APP_TIME_ZONE ? "北京时间按天归档" : "按天归档"
    } · 单卷上限 ${formatBytes(storage.maxFileBytes)} · 当前 ${
      Number(page.fileCount) || 0
    } 个文件`;
  }

  async function loadLogs({ reset = false } = {}) {
    if (state.loading) {
      return;
    }

    state.loading = true;
    elements.refresh.disabled = true;
    elements.loadMore.disabled = true;
    elements.list.setAttribute("aria-busy", "true");
    setStatus(reset ? "正在读取日志…" : "正在加载更多…");
    if (reset) {
      state.offset = 0;
      state.nextOffset = null;
      state.total = 0;
      state.loadedCount = 0;
      state.hasMore = false;
      state.seenEventIds.clear();
      elements.list.innerHTML = "";
      elements.range.textContent = "";
      elements.loadMore.hidden = true;
    }

    const offset = reset
      ? 0
      : state.nextOffset ?? state.loadedCount;

    try {
      const response = await fetch(
        `/api/logs?offset=${encodeURIComponent(offset)}&limit=${PAGE_SIZE}`,
        {
          headers: { accept: "application/json" },
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error?.message || "服务暂时无法读取日志。",
        );
      }

      const events = Array.isArray(payload.events) ? payload.events : [];
      const freshEvents = events.filter((event) => {
        const id = String(event.id || "");
        if (!id || state.seenEventIds.has(id)) {
          return false;
        }
        state.seenEventIds.add(id);
        return true;
      });
      state.loadedCount += freshEvents.length;
      state.offset = offset;
      const nextOffset = Number(payload.nextOffset);
      state.nextOffset = Number.isFinite(nextOffset)
        ? nextOffset
        : null;
      state.hasMore =
        Boolean(payload.hasMore) && state.nextOffset !== null;

      if (reset && !freshEvents.length && !state.total) {
        elements.list.innerHTML = emptyStateHtml();
      } else if (freshEvents.length) {
        elements.list.insertAdjacentHTML(
          "beforeend",
          freshEvents.map(eventHtml).join(""),
        );
      }

      updateSummary(payload);
      setStatus("");
    } catch (error) {
      const message =
        error?.message || "日志加载失败，请稍后重试。";
      if (reset && !state.loadedCount) {
        elements.list.innerHTML = errorStateHtml(message);
      }
      setStatus(message, true);
    } finally {
      state.loading = false;
      elements.refresh.disabled = false;
      elements.loadMore.disabled = false;
      elements.list.setAttribute("aria-busy", "false");
    }
  }

  elements.refresh.addEventListener("click", () => {
    loadLogs({ reset: true });
  });
  elements.loadMore.addEventListener("click", () => {
    loadLogs();
  });

  loadLogs({ reset: true });
})();
