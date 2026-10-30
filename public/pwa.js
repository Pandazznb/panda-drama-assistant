(() => {
  const installButtons = Array.from(
    document.querySelectorAll("[data-pwa-install]"),
  );
  const displayMode = window.matchMedia("(display-mode: standalone)");
  let deferredInstallPrompt = null;

  function isStandalone() {
    return displayMode.matches || window.navigator.standalone === true;
  }

  function setInstallButtonsVisible(visible) {
    for (const button of installButtons) {
      button.hidden = !visible || isStandalone();
    }
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch((error) => {
        console.warn("Service Worker 注册失败。", error);
      });
  }

  for (const button of installButtons) {
    button.addEventListener("click", async () => {
      if (!deferredInstallPrompt) {
        return;
      }

      const installPrompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      setInstallButtonsVisible(false);
      button.setAttribute("aria-busy", "true");

      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
      } catch (error) {
        console.warn("无法打开应用安装提示。", error);
      } finally {
        button.removeAttribute("aria-busy");
      }
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallButtonsVisible(true);
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setInstallButtonsVisible(false);
  });

  const updateDisplayMode = () => {
    if (isStandalone()) {
      setInstallButtonsVisible(false);
    } else if (deferredInstallPrompt) {
      setInstallButtonsVisible(true);
    }
  };
  if (typeof displayMode.addEventListener === "function") {
    displayMode.addEventListener("change", updateDisplayMode);
  } else {
    displayMode.addListener(updateDisplayMode);
  }

  setInstallButtonsVisible(Boolean(deferredInstallPrompt));
  if (document.readyState === "complete") {
    registerServiceWorker();
  } else {
    window.addEventListener("load", registerServiceWorker, { once: true });
  }
})();
