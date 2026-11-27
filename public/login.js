const LOGIN_STATUS_TIMEOUT_MS = 12_000;
const LOGIN_REQUEST_TIMEOUT_MS = 20_000;

const elements = {
  status: document.querySelector("#login-page-status"),
  form: document.querySelector("#login-form"),
  account: document.querySelector("#login-account"),
  password: document.querySelector("#login-password"),
  passwordToggle: document.querySelector("#login-password-toggle"),
  passwordIcons: [
    ...document.querySelectorAll("[data-password-icon]"),
  ],
  accountError: document.querySelector("#login-account-error"),
  passwordError: document.querySelector("#login-password-error"),
  formAlert: document.querySelector("#login-form-alert"),
  submit: document.querySelector("#login-submit"),
  submitLabel: document.querySelector("[data-login-submit-label]"),
  unavailable: document.querySelector("#login-unavailable"),
  retry: document.querySelector("#login-retry"),
};

let countdownTimer = null;
let submitting = false;

function safeNextPath(value) {
  const candidate = String(value || "").trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return "/";
  }

  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

const nextPath = safeNextPath(
  new URLSearchParams(window.location.search).get("next"),
);

function setStatus(message, state = "") {
  elements.status.textContent = message;
  elements.status.dataset.state = state;
}

function setFormVisible(visible) {
  elements.form.hidden = !visible;
  elements.unavailable.hidden = true;
  elements.retry.hidden = true;
}

function setRetryVisible(visible) {
  elements.retry.hidden = !visible;
}

function setSubmitBusy(busy, label = "登录") {
  submitting = busy;
  elements.submit.disabled = busy;
  elements.submit.setAttribute("aria-busy", String(busy));
  elements.submitLabel.textContent = busy ? "正在登录…" : label;
}

function setFormAlert(message = "") {
  elements.formAlert.textContent = message;
  elements.formAlert.hidden = !message;
}

function setFieldInvalid(input, errorElement, message = "") {
  const invalid = Boolean(message);
  errorElement.textContent = message;
  errorElement.hidden = !invalid;
  errorElement.classList.toggle("is-visible", invalid);
  if (invalid) {
    input.setAttribute("aria-invalid", "true");
  } else {
    input.removeAttribute("aria-invalid");
  }
}

function clearErrors() {
  setFieldInvalid(
    elements.account,
    elements.accountError,
  );
  setFieldInvalid(
    elements.password,
    elements.passwordError,
  );
  setFormAlert();
}

function setPasswordVisibility(visible) {
  elements.password.type = visible ? "text" : "password";
  elements.passwordToggle.setAttribute("aria-pressed", String(visible));
  elements.passwordToggle.setAttribute(
    "aria-label",
    visible ? "隐藏登录密码" : "显示登录密码",
  );
  for (const icon of elements.passwordIcons) {
    icon.hidden = icon.dataset.passwordIcon !== (visible ? "hide" : "show");
  }
}

function focusAfterPaint(element) {
  window.requestAnimationFrame(() => {
    element.focus();
  });
}

function requestError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

async function requestJson(path, options = {}) {
  const { timeoutMs = LOGIN_REQUEST_TIMEOUT_MS, ...requestOptions } = options;
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(path, {
      ...requestOptions,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(requestOptions.body ? { "content-type": "application/json" } : {}),
        ...requestOptions.headers,
      },
    });
    const responseText = await response.text();
    let payload = {};
    if (responseText) {
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw requestError("服务器返回了无法识别的响应，请稍后重试。", {
          code: "LOGIN_RESPONSE_INVALID",
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      throw requestError(
        payload?.error?.message ||
          `登录请求失败（HTTP ${response.status}）。`,
        {
          code: payload?.error?.code || "LOGIN_REQUEST_FAILED",
          status: response.status,
          retryAfterSeconds:
            payload?.error?.retryAfterSeconds ??
            Number(response.headers.get("retry-after")) ??
            null,
        },
      );
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw requestError("登录请求超时，请检查网络后重试。", {
        code: "LOGIN_REQUEST_TIMEOUT",
      });
    }
    if (
      error instanceof TypeError &&
      !error.code
    ) {
      throw requestError("无法连接短剧助手，请检查网络后重试。", {
        code: "LOGIN_NETWORK_ERROR",
      });
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function stopLoginCountdown() {
  if (countdownTimer !== null) {
    window.clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function startLoginCountdown(seconds) {
  stopLoginCountdown();
  const duration = Math.max(1, Math.trunc(Number(seconds) || 0));
  const deadline = Date.now() + duration * 1000;

  const update = () => {
    const remaining = Math.max(
      0,
      Math.ceil((deadline - Date.now()) / 1000),
    );
    if (remaining <= 0) {
      stopLoginCountdown();
      elements.submit.disabled = submitting;
      setSubmitBusy(false);
      setFormAlert("现在可以重新尝试登录。");
      return;
    }
    elements.submit.disabled = true;
    elements.submitLabel.textContent = `请等待 ${remaining} 秒`;
  };

  update();
  countdownTimer = window.setInterval(update, 1_000);
}

function handleLoginError(error) {
  if (error?.status === 401) {
    const message = "账号或密码不正确。";
    setFieldInvalid(
      elements.account,
      elements.accountError,
      message,
    );
    setFieldInvalid(
      elements.password,
      elements.passwordError,
      message,
    );
    setFormAlert(message);
    focusAfterPaint(elements.account);
    return false;
  }

  if (error?.status === 429) {
    const seconds = Math.max(
      1,
      Math.trunc(Number(error.retryAfterSeconds) || 60),
    );
    setFormAlert(
      `登录尝试过于频繁，请在 ${seconds} 秒后重试。`,
    );
    startLoginCountdown(seconds);
    return true;
  }

  setFormAlert(error?.message || "登录失败，请稍后重试。");
  return false;
}

async function loadLoginStatus() {
  stopLoginCountdown();
  clearErrors();
  setFormVisible(false);
  setRetryVisible(false);
  setStatus("正在确认登录保护状态…");
  setSubmitBusy(false);

  try {
    const status = await requestJson("/api/access/status", {
      timeoutMs: LOGIN_STATUS_TIMEOUT_MS,
    });
    if (!status.configured) {
      setStatus("当前未启用应用登录保护。", "success");
      elements.unavailable.hidden = false;
      return;
    }
    if (status.authenticated) {
      setStatus("已登录，正在进入短剧助手…", "success");
      window.location.replace(nextPath);
      return;
    }

    setStatus("登录保护已启用，请输入应用账号和密码。");
    setFormVisible(true);
    if (window.matchMedia("(pointer: fine)").matches) {
      focusAfterPaint(elements.account);
    }
  } catch (error) {
    setStatus(
      error?.message || "暂时无法读取登录保护状态，请稍后重试。",
      "error",
    );
    setRetryVisible(true);
  }
}

elements.passwordToggle.addEventListener("click", () => {
  setPasswordVisibility(elements.password.type === "password");
  elements.password.focus();
});

elements.account.addEventListener("input", () => {
  setFieldInvalid(elements.account, elements.accountError);
  setFormAlert();
});

elements.password.addEventListener("input", () => {
  setFieldInvalid(elements.password, elements.passwordError);
  setFormAlert();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting || elements.submit.disabled) {
    return;
  }

  clearErrors();
  setPasswordVisibility(false);
  const account = elements.account.value.trim();
  const password = elements.password.value;
  let firstInvalidInput = null;

  if (!account) {
    setFieldInvalid(
      elements.account,
      elements.accountError,
      "请输入登录账号。",
    );
    firstInvalidInput ||= elements.account;
  }
  if (!password) {
    setFieldInvalid(
      elements.password,
      elements.passwordError,
      "请输入登录密码。",
    );
    firstInvalidInput ||= elements.password;
  }
  if (firstInvalidInput) {
    focusAfterPaint(firstInvalidInput);
    return;
  }

  setSubmitBusy(true);
  let rateLimited = false;
  try {
    await requestJson("/api/access/login", {
      method: "POST",
      body: JSON.stringify({ account, password }),
    });
    setStatus("登录成功，正在进入短剧助手…", "success");
    elements.form.hidden = true;
    window.location.replace(nextPath);
  } catch (error) {
    rateLimited = handleLoginError(error);
  } finally {
    if (!rateLimited) {
      setSubmitBusy(false);
    }
  }
});

elements.retry.addEventListener("click", () => {
  void loadLoginStatus();
});

void loadLoginStatus();
