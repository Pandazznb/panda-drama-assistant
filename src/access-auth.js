import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const ACCESS_SESSION_COOKIE = "panda_access_session";

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_LOGIN_FAILURES = 5;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const IDENTIFIER_MIN_LENGTH = 3;
const IDENTIFIER_MAX_LENGTH = 64;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PARAMETERS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
});
const DUMMY_SALT = "panda-drama-assistant-access-auth-dummy";

function accessError(statusCode, code, message, retryAfterSeconds = 0) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (retryAfterSeconds > 0) {
    error.retryAfterSeconds = retryAfterSeconds;
  }
  return error;
}

function normalizeIdentifier(value, { label, code }) {
  const identifier = String(value ?? "").trim();
  if (
    identifier.length < IDENTIFIER_MIN_LENGTH ||
    identifier.length > IDENTIFIER_MAX_LENGTH ||
    /\s/.test(identifier)
  ) {
    throw accessError(
      400,
      code,
      `${label}需为 ${IDENTIFIER_MIN_LENGTH}-${IDENTIFIER_MAX_LENGTH} 个字符，且不能包含空格。`,
    );
  }
  return identifier;
}

function normalizeAccount(value) {
  return normalizeIdentifier(value, {
    label: "登录账号",
    code: "INVALID_ACCESS_ACCOUNT",
  });
}

function normalizeUsername(value) {
  return normalizeIdentifier(value, {
    label: "名称",
    code: "INVALID_ACCESS_USERNAME",
  });
}

function normalizeCredentials(credentials) {
  if (!credentials) {
    return null;
  }
  const legacyUsername = String(credentials.username || "").trim();
  const account = String(credentials.account || legacyUsername).trim();
  const username = String(credentials.username || account).trim();
  return {
    ...credentials,
    version: 2,
    account,
    username,
  };
}

function normalizePassword(value, { required = true, label = "新密码" } = {}) {
  const password = String(value ?? "");
  if (!password && !required) {
    return "";
  }
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw accessError(
      400,
      "INVALID_ACCESS_PASSWORD",
      `${label}需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 个字符。`,
    );
  }
  return password;
}

function parseCookies(headerValue) {
  const cookies = new Map();
  for (const part of String(headerValue || "").split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function requestIsHttps(request) {
  if (request?.socket?.encrypted) {
    return true;
  }
  return String(request?.headers?.["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase() === "https";
}

function cookieString(request, value, maxAgeSeconds) {
  return [
    `${ACCESS_SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.trunc(maxAgeSeconds))}`,
    requestIsHttps(request) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function passwordKey(username) {
  return createHash("sha256")
    .update(String(username || "").trim().toLowerCase())
    .digest("hex");
}

function sessionTokenHash(sessionId) {
  return createHash("sha256")
    .update(String(sessionId || ""))
    .digest("hex");
}

async function hashPassword(password) {
  const salt = randomBytes(24).toString("base64url");
  const derived = await scrypt(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
    SCRYPT_PARAMETERS,
  );
  return {
    salt,
    passwordHash: Buffer.from(derived).toString("base64url"),
    parameters: {
      N: SCRYPT_PARAMETERS.N,
      r: SCRYPT_PARAMETERS.r,
      p: SCRYPT_PARAMETERS.p,
      keyLength: SCRYPT_KEY_LENGTH,
    },
  };
}

async function verifyPassword(password, credentials) {
  try {
    const expected = Buffer.from(
      String(credentials?.passwordHash || ""),
      "base64url",
    );
    const keyLength = expected.length || SCRYPT_KEY_LENGTH;
    const parameters = credentials?.parameters || {};
    const derived = await scrypt(
      String(password || ""),
      String(credentials?.salt || DUMMY_SALT),
      keyLength,
      {
        N: Number(parameters.N) || SCRYPT_PARAMETERS.N,
        r: Number(parameters.r) || SCRYPT_PARAMETERS.r,
        p: Number(parameters.p) || SCRYPT_PARAMETERS.p,
        maxmem: SCRYPT_PARAMETERS.maxmem,
      },
    );
    const actual = Buffer.from(derived);
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function consumeDummyVerification(password) {
  try {
    await scrypt(
      String(password || ""),
      DUMMY_SALT,
      SCRYPT_KEY_LENGTH,
      SCRYPT_PARAMETERS,
    );
  } catch {
    // The login still fails with the same public error.
  }
}

function credentialSummary(credentials) {
  if (!credentials) {
    return {
      configured: false,
      account: "",
      username: "",
      updatedAt: null,
    };
  }
  return {
    configured: true,
    account: credentials.account,
    username: credentials.username,
    updatedAt: credentials.updatedAt || null,
  };
}

export class AccessAuthService {
  constructor({
    store,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    loginWindowMs = DEFAULT_LOGIN_WINDOW_MS,
    maxLoginFailures = DEFAULT_MAX_LOGIN_FAILURES,
    now = () => Date.now(),
  } = {}) {
    if (!store) {
      throw new TypeError("AccessAuthService 需要状态存储。");
    }
    this.store = store;
    this.sessionTtlMs = Math.max(60_000, Number(sessionTtlMs) || 0);
    this.loginWindowMs = Math.max(60_000, Number(loginWindowMs) || 0);
    this.maxLoginFailures = Math.max(
      1,
      Math.trunc(Number(maxLoginFailures) || 0),
    );
    this.now = now;
    this.loginFailures = new Map();
  }

  async credentials() {
    return normalizeCredentials(await this.store.getAccessAuth());
  }

  sessionIdFromRequest(request) {
    return parseCookies(request?.headers?.cookie).get(
      ACCESS_SESSION_COOKIE,
    );
  }

  async authenticatedSessionId(request) {
    const sessionId = this.sessionIdFromRequest(request);
    if (!sessionId) {
      return "";
    }
    const tokenHash = sessionTokenHash(sessionId);
    const session = await this.store.getAccessSession(tokenHash);
    if (!session) {
      return "";
    }
    if (session.expiresAt <= this.now()) {
      await this.store.deleteAccessSession(tokenHash);
      return "";
    }
    return sessionId;
  }

  async status(request) {
    const credentials = await this.credentials();
    const authenticated =
      !credentials ||
      Boolean(await this.authenticatedSessionId(request));
    return {
      configured: Boolean(credentials),
      authenticated,
      account: authenticated ? credentials?.account || "" : "",
      username: authenticated ? credentials?.username || "" : "",
      updatedAt: authenticated ? credentials?.updatedAt || null : null,
    };
  }

  async authorization(request) {
    const credentials = await this.credentials();
    return {
      configured: Boolean(credentials),
      authenticated:
        !credentials ||
        Boolean(await this.authenticatedSessionId(request)),
      account: credentials?.account || "",
      username: credentials?.username || "",
    };
  }

  async requireAuthentication(request) {
    const authorization = await this.authorization(request);
    if (authorization.configured && !authorization.authenticated) {
      throw accessError(
        401,
        "ACCESS_AUTH_REQUIRED",
        "请先登录短剧助手。",
      );
    }
    return authorization;
  }

  clientKey(request) {
    return String(
      request?.socket?.remoteAddress || request?.connection?.remoteAddress || "unknown",
    );
  }

  rateLimitKeys(request, username) {
    return [
      `ip:${this.clientKey(request)}`,
      `account:${passwordKey(username)}`,
    ];
  }

  loginRateLimit(keys) {
    const now = this.now();
    let retryAfterSeconds = 0;
    for (const key of keys) {
      const entry = this.loginFailures.get(key);
      if (!entry) {
        continue;
      }
      if (entry.resetAt <= now) {
        this.loginFailures.delete(key);
        continue;
      }
      if (entry.count >= this.maxLoginFailures) {
        retryAfterSeconds = Math.max(
          retryAfterSeconds,
          Math.ceil((entry.resetAt - now) / 1000),
        );
      }
    }
    if (retryAfterSeconds > 0) {
      throw accessError(
        429,
        "ACCESS_LOGIN_RATE_LIMITED",
        `登录尝试过于频繁，请在 ${retryAfterSeconds} 秒后重试。`,
        retryAfterSeconds,
      );
    }
  }

  recordLoginFailure(keys) {
    const now = this.now();
    for (const key of keys) {
      const existing = this.loginFailures.get(key);
      if (!existing || existing.resetAt <= now) {
        this.loginFailures.set(key, {
          count: 1,
          resetAt: now + this.loginWindowMs,
        });
      } else {
        existing.count += 1;
      }
    }
  }

  clearLoginFailures(keys) {
    for (const key of keys) {
      this.loginFailures.delete(key);
    }
  }

  async createSession(request) {
    const sessionId = randomBytes(32).toString("base64url");
    const now = this.now();
    await this.store.purgeExpiredAccessSessions(now);
    await this.store.setAccessSession({
      tokenHash: sessionTokenHash(sessionId),
      expiresAt: now + this.sessionTtlMs,
      createdAt: new Date(now).toISOString(),
    });
    return {
      sessionId,
      cookie: cookieString(
        request,
        sessionId,
        Math.ceil(this.sessionTtlMs / 1000),
      ),
    };
  }

  async login({ request, account, username, password }) {
    const credentials = await this.credentials();
    if (!credentials) {
      throw accessError(
        409,
        "ACCESS_AUTH_NOT_CONFIGURED",
        "尚未设置应用登录账号和密码。",
      );
    }

    const normalizedAccount = String(account ?? username ?? "").trim();
    const keys = this.rateLimitKeys(request, normalizedAccount);
    this.loginRateLimit(keys);

    const passwordValue = String(password ?? "");
    const accountMatches = normalizedAccount === credentials.account;
    const passwordMatches = accountMatches
      ? await verifyPassword(passwordValue, credentials)
      : await consumeDummyVerification(passwordValue).then(() => false);

    if (!accountMatches || !passwordMatches) {
      this.recordLoginFailure(keys);
      throw accessError(
        401,
        "ACCESS_LOGIN_INVALID",
        "账号或密码不正确。",
      );
    }

    this.clearLoginFailures(keys);
    return {
      ...(await this.createSession(request)),
      account: credentials.account,
      username: credentials.username,
    };
  }

  async logout(request) {
    const sessionId = this.sessionIdFromRequest(request);
    if (sessionId) {
      await this.store.deleteAccessSession(sessionTokenHash(sessionId));
    }
    return cookieString(request, "", 0);
  }

  async updateCredentials({
    request,
    account,
    username,
    currentPassword,
    newPassword,
  }) {
    const credentials = await this.credentials();
    const nextAccount = normalizeAccount(account ?? username);
    const nextUsername = normalizeUsername(username ?? account);
    const nextPassword = normalizePassword(newPassword, {
      required: !credentials,
    });

    if (credentials) {
      const currentPasswordValue = String(currentPassword ?? "");
      if (!currentPasswordValue) {
        throw accessError(
          400,
          "ACCESS_CURRENT_PASSWORD_REQUIRED",
          "修改登录信息前请输入当前密码。",
        );
      }
      if (!(await verifyPassword(currentPasswordValue, credentials))) {
        throw accessError(
          403,
          "ACCESS_CURRENT_PASSWORD_INVALID",
          "当前密码不正确。",
        );
      }
    }

    const passwordData = nextPassword
      ? await hashPassword(nextPassword)
      : {
          salt: credentials.salt,
          passwordHash: credentials.passwordHash,
          parameters: credentials.parameters,
        };
    const nextCredentials = {
      version: 2,
      account: nextAccount,
      username: nextUsername,
      salt: passwordData.salt,
      passwordHash: passwordData.passwordHash,
      parameters: passwordData.parameters,
      updatedAt: new Date(this.now()).toISOString(),
    };

    await this.store.setAccessAuth(nextCredentials);
    const accountChanged = nextAccount !== credentials?.account;
    const passwordChanged = Boolean(nextPassword);
    const securityChanged = accountChanged || passwordChanged;
    if (securityChanged) {
      await this.store.clearAccessSessions();
    }
    return {
      ...(securityChanged
        ? await this.createSession(request)
        : { sessionId: "", cookie: "" }),
      account: nextCredentials.account,
      username: nextCredentials.username,
      credentials: credentialSummary(nextCredentials),
      accountChanged,
      usernameChanged: nextUsername !== credentials?.username,
      passwordChanged,
    };
  }
}
