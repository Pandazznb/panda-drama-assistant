(() => {
  const STORAGE_KEY = "hongguo-theme";
  const THEME_CHOICES = new Set(["auto", "light", "dark"]);
  const THEME_SEQUENCE = ["auto", "light", "dark"];
  const THEME_META = {
    auto: {
      label: "自动",
      description: "自动（跟随系统）",
      icon: "#icon-auto",
      next: "白天",
    },
    light: {
      label: "白天",
      description: "白天",
      icon: "#icon-sun",
      next: "黑夜",
    },
    dark: {
      label: "黑夜",
      description: "黑夜",
      icon: "#icon-moon",
      next: "自动",
    },
  };
  const THEME_COLORS = {
    light: "#f7f8fa",
    dark: "#0f1216",
  };
  const root = document.documentElement;
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = readPreference();
  let transitionFrame = 0;

  function readPreference() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return THEME_CHOICES.has(stored) ? stored : "auto";
    } catch {
      return "auto";
    }
  }

  function resolvedTheme() {
    if (preference === "auto") {
      return systemTheme.matches ? "dark" : "light";
    }
    return preference;
  }

  function updateThemeColor(theme) {
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", THEME_COLORS[theme]);
  }

  function updateControls() {
    const meta = THEME_META[preference];
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.dataset.themePreference = preference;
      button.setAttribute(
        "aria-label",
        `当前主题：${meta.description}。点击切换为${meta.next}主题`,
      );
      button.title = `当前：${meta.description}，点击切换为${meta.next}`;
      button
        .querySelector("[data-theme-icon]")
        ?.setAttribute("href", meta.icon);
      const label = button.querySelector("[data-theme-label]");
      if (label) {
        label.textContent = meta.label;
      }
    }
  }

  function suppressThemeTransitions() {
    window.cancelAnimationFrame(transitionFrame);
    root.classList.add("theme-transition-suppressed");
    transitionFrame = window.requestAnimationFrame(() => {
      transitionFrame = window.requestAnimationFrame(() => {
        root.classList.remove("theme-transition-suppressed");
      });
    });
  }

  function applyTheme({ suppressTransitions = false } = {}) {
    const theme = resolvedTheme();
    if (suppressTransitions) {
      suppressThemeTransitions();
    }
    root.dataset.theme = theme;
    root.dataset.themePreference = preference;
    root.style.colorScheme = theme;
    updateThemeColor(theme);
    updateControls();
  }

  function setPreference(nextPreference, { persist = true } = {}) {
    if (!THEME_CHOICES.has(nextPreference)) {
      return;
    }
    preference = nextPreference;
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        // The selected theme still applies for the current page.
      }
    }
    applyTheme({ suppressTransitions: true });
  }

  function initializeControls() {
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.addEventListener("click", () => {
        const currentIndex = THEME_SEQUENCE.indexOf(preference);
        const nextPreference =
          THEME_SEQUENCE[(currentIndex + 1) % THEME_SEQUENCE.length];
        clearTimeout(button.themeMotionTimer);
        button.classList.remove("is-theme-changing");
        void button.offsetWidth;
        button.classList.add("is-theme-changing");
        setPreference(nextPreference);
        button.themeMotionTimer = window.setTimeout(() => {
          button.classList.remove("is-theme-changing");
        }, 380);
      });
    }
    updateControls();
  }

  applyTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeControls, {
      once: true,
    });
  } else {
    initializeControls();
  }

  const handleSystemThemeChange = () => {
    if (preference === "auto") {
      applyTheme({ suppressTransitions: true });
    }
  };
  if (typeof systemTheme.addEventListener === "function") {
    systemTheme.addEventListener("change", handleSystemThemeChange);
  } else {
    systemTheme.addListener(handleSystemThemeChange);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && THEME_CHOICES.has(event.newValue)) {
      setPreference(event.newValue, { persist: false });
    }
  });
})();
