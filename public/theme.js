(() => {
  const STORAGE_KEY = "hongguo-theme";
  const THEME_CHOICES = new Set(["auto", "light", "dark"]);
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
    for (const button of document.querySelectorAll("[data-theme-choice]")) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeChoice === preference),
      );
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
    const switcher = document.querySelector(".theme-switcher");
    if (!switcher) {
      return;
    }
    switcher.addEventListener("click", (event) => {
      const button = event.target.closest("[data-theme-choice]");
      if (button) {
        setPreference(button.dataset.themeChoice);
      }
    });
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
