(() => {
  const WIDE_LAYOUT_QUERY = "(min-width: 901px)";
  const headerActions = document.querySelector(".app-header__actions");
  const mainContent = document.querySelector("#main-content");

  if (!headerActions || !mainContent) {
    return;
  }

  const controls = document.createElement("div");
  controls.className = "scroll-controls scroll-controls--floating";
  controls.id = "scroll-controls";
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", "页面滚动导航");
  controls.hidden = true;
  controls.innerHTML = `
    <button
      class="scroll-controls__button"
      id="scroll-to-top"
      type="button"
      aria-label="回到最上"
      aria-controls="main-content"
      title="回到最上"
      disabled
    >
      <svg
        class="icon scroll-controls__icon scroll-controls__icon--up"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6"></path>
      </svg>
    </button>
    <button
      class="scroll-controls__button"
      id="scroll-to-bottom"
      type="button"
      aria-label="回到最下"
      aria-controls="main-content"
      title="回到最下"
    >
      <svg
        class="icon scroll-controls__icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6"></path>
      </svg>
    </button>
  `;

  const topButton = controls.querySelector("#scroll-to-top");
  const bottomButton = controls.querySelector("#scroll-to-bottom");
  const wideLayout = window.matchMedia(WIDE_LAYOUT_QUERY);
  let updateFrame = null;
  let resizeObserver = null;

  function placeControls() {
    if (wideLayout.matches) {
      document.body.append(controls);
      return;
    }
    headerActions.prepend(controls);
  }

  function update() {
    updateFrame = null;
    const scroller = document.scrollingElement || document.documentElement;
    const maxScrollTop = Math.max(
      0,
      scroller.scrollHeight - window.innerHeight,
    );
    const scrollTop = Math.max(0, scroller.scrollTop);
    const isScrollable = maxScrollTop > 8;

    controls.hidden = !isScrollable;
    if (!isScrollable) {
      return;
    }

    topButton.disabled = scrollTop <= 2;
    bottomButton.disabled = scrollTop >= maxScrollTop - 2;
  }

  function scheduleUpdate() {
    if (updateFrame !== null) {
      return;
    }
    updateFrame = window.requestAnimationFrame(update);
  }

  function scrollToPosition(position) {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: position,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  topButton.addEventListener("click", () => {
    scrollToPosition(0);
  });

  bottomButton.addEventListener("click", () => {
    const scroller = document.scrollingElement || document.documentElement;
    scrollToPosition(scroller.scrollHeight);
  });

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("load", scheduleUpdate, { once: true });
  document.addEventListener("scroll-controls:update", scheduleUpdate);

  if (typeof wideLayout.addEventListener === "function") {
    wideLayout.addEventListener("change", () => {
      placeControls();
      scheduleUpdate();
    });
  } else {
    wideLayout.addListener(() => {
      placeControls();
      scheduleUpdate();
    });
  }

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(document.body);
    resizeObserver.observe(mainContent);
  }

  document.fonts?.ready.then(scheduleUpdate);
  placeControls();
  scheduleUpdate();
})();
