import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AccessAuthService } from "../src/access-auth.js";
import { JsonStateStore } from "../src/store.js";

const BASE_PASSWORD = "correct-horse";

function createMemoryStore(initialCredentials = null) {
  let credentials = initialCredentials
    ? structuredClone(initialCredentials)
    : null;
  const sessions = new Map();
  return {
    async getAccessAuth() {
      return credentials ? structuredClone(credentials) : null;
    },
    async setAccessAuth(nextCredentials) {
      credentials = structuredClone(nextCredentials);
    },
    async getAccessSession(tokenHash) {
      const session = sessions.get(tokenHash);
      return session ? structuredClone(session) : null;
    },
    async setAccessSession(session) {
      sessions.set(session.tokenHash, structuredClone(session));
    },
    async deleteAccessSession(tokenHash) {
      sessions.delete(tokenHash);
    },
    async clearAccessSessions() {
      sessions.clear();
    },
    async purgeExpiredAccessSessions(now) {
      let removed = 0;
      for (const [tokenHash, session] of sessions) {
        if (session.expiresAt <= now) {
          sessions.delete(tokenHash);
          removed += 1;
        }
      }
      return removed;
    },
  };
}

function createRequest(cookie = "") {
  const headers = {
    "x-forwarded-proto": "https",
  };
  if (cookie) {
    headers.cookie = cookie.split(";")[0];
  }
  return {
    headers,
    socket: {
      remoteAddress: "127.0.0.1",
    },
  };
}

async function configure(
  service,
  {
    account = "owner",
    username = "owner",
  } = {},
) {
  return service.updateCredentials({
    request: createRequest(),
    account,
    username,
    currentPassword: "",
    newPassword: BASE_PASSWORD,
  });
}

test("access authentication stays open until credentials are configured", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
  });
  const request = createRequest();

  const authorization = await service.requireAuthentication(request);
  assert.equal(authorization.configured, false);
  assert.equal(authorization.authenticated, true);
  assert.deepEqual(await service.status(request), {
    configured: false,
    authenticated: true,
    account: "",
    username: "",
    updatedAt: null,
  });
});

test("login account and display username are stored and used independently", async () => {
  const store = createMemoryStore();
  const service = new AccessAuthService({ store });
  const setup = await configure(service, {
    account: "owner-login",
    username: "owner-display",
  });

  assert.equal(setup.account, "owner-login");
  assert.equal(setup.username, "owner-display");
  assert.equal(setup.credentials.configured, true);
  assert.equal(setup.credentials.account, "owner-login");
  assert.equal(setup.credentials.username, "owner-display");
  assert.match(setup.cookie, /HttpOnly/);
  assert.match(setup.cookie, /SameSite=Lax/);
  assert.match(setup.cookie, /Secure/);

  const stored = await store.getAccessAuth();
  assert.equal(stored.version, 2);
  assert.equal(stored.account, "owner-login");
  assert.equal(stored.username, "owner-display");
  assert.notEqual(stored.passwordHash, BASE_PASSWORD);
  assert.equal(stored.passwordHash.includes(BASE_PASSWORD), false);

  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        account: "owner-display",
        password: BASE_PASSWORD,
      }),
    (error) =>
      error.statusCode === 401 &&
      error.code === "ACCESS_LOGIN_INVALID",
  );

  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        account: "owner-login",
        password: "wrong-password",
      }),
    (error) =>
      error.statusCode === 401 &&
      error.code === "ACCESS_LOGIN_INVALID",
  );

  const login = await service.login({
    request: createRequest(),
    account: "owner-login",
    password: BASE_PASSWORD,
  });
  assert.equal(login.account, "owner-login");
  assert.equal(login.username, "owner-display");
  const authenticatedRequest = createRequest(login.cookie);
  const authorization =
    await service.requireAuthentication(authenticatedRequest);
  assert.equal(authorization.configured, true);
  assert.equal(authorization.authenticated, true);
  assert.equal(authorization.account, "owner-login");
  assert.equal(authorization.username, "owner-display");
});

test("legacy username-only credentials remain usable as a login account", async () => {
  const store = createMemoryStore();
  const service = new AccessAuthService({ store });
  await configure(service, {
    account: "legacy-owner",
    username: "legacy-owner",
  });
  const stored = await store.getAccessAuth();
  delete stored.account;
  stored.version = 1;
  await store.setAccessAuth(stored);

  const restartedService = new AccessAuthService({ store });
  const login = await restartedService.login({
    request: createRequest(),
    account: "legacy-owner",
    password: BASE_PASSWORD,
  });
  assert.equal(login.account, "legacy-owner");
  assert.equal(login.username, "legacy-owner");

  const status = await restartedService.status(createRequest(login.cookie));
  assert.equal(status.account, "legacy-owner");
  assert.equal(status.username, "legacy-owner");
});

test("an access session remains valid after the auth service restarts", async () => {
  const store = createMemoryStore();
  const firstService = new AccessAuthService({ store });
  const setup = await configure(firstService);

  const restartedService = new AccessAuthService({ store });
  const authorization = await restartedService.requireAuthentication(
    createRequest(setup.cookie),
  );

  assert.equal(authorization.configured, true);
  assert.equal(authorization.authenticated, true);
  assert.equal(authorization.account, "owner");
  assert.equal(authorization.username, "owner");
});

test("an access session survives closing and reopening SQLite", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-auth-session-"),
  );
  const stateFile = path.join(directory, "state.json");
  const firstStore = new JsonStateStore(stateFile);
  let setup;
  try {
    await firstStore.init();
    const firstService = new AccessAuthService({ store: firstStore });
    setup = await configure(firstService);
  } finally {
    await firstStore.close();
  }

  const restartedStore = new JsonStateStore(stateFile);
  try {
    await restartedStore.init();
    const restartedService = new AccessAuthService({
      store: restartedStore,
    });
    const authorization = await restartedService.requireAuthentication(
      createRequest(setup.cookie),
    );

    assert.equal(authorization.configured, true);
    assert.equal(authorization.authenticated, true);
    assert.equal(authorization.account, "owner");
    assert.equal(authorization.username, "owner");
    assert.equal(
      restartedStore.db
        .prepare("SELECT COUNT(*) AS count FROM access_sessions")
        .get().count,
      1,
    );
    const rawSessionId = setup.cookie
      .slice(0, setup.cookie.indexOf(";"))
      .split("=")[1];
    assert.equal(
      restartedStore.db
        .prepare(
          "SELECT COUNT(*) AS count FROM access_sessions WHERE token_hash = ?",
        )
        .get(rawSessionId).count,
      0,
    );
  } finally {
    await restartedStore.close();
  }
});

test("changing only the display username keeps the current session valid", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
  });
  const setup = await configure(service, {
    account: "owner-login",
    username: "owner-display",
  });
  const oldRequest = createRequest(setup.cookie);
  assert.equal(
    await service.authenticatedSessionId(oldRequest),
    setup.sessionId,
  );

  const updated = await service.updateCredentials({
    request: oldRequest,
    account: "owner-login",
    username: "new-display",
    currentPassword: BASE_PASSWORD,
    newPassword: "",
  });

  assert.equal(updated.accountChanged, false);
  assert.equal(updated.usernameChanged, true);
  assert.equal(updated.passwordChanged, false);
  assert.equal(updated.cookie, "");
  assert.equal(
    await service.authenticatedSessionId(oldRequest),
    setup.sessionId,
  );
  assert.equal(updated.credentials.account, "owner-login");
  assert.equal(updated.credentials.username, "new-display");

  const status = await service.status(oldRequest);
  assert.equal(status.authenticated, true);
  assert.equal(status.account, "owner-login");
  assert.equal(status.username, "new-display");
});

test("changing the login account invalidates the previous session", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
  });
  const setup = await configure(service, {
    account: "owner-login",
    username: "owner-display",
  });
  const oldRequest = createRequest(setup.cookie);

  const updated = await service.updateCredentials({
    request: oldRequest,
    account: "next-login",
    username: "owner-display",
    currentPassword: BASE_PASSWORD,
    newPassword: "",
  });

  assert.equal(updated.accountChanged, true);
  assert.equal(updated.usernameChanged, false);
  assert.equal(updated.passwordChanged, false);
  assert.equal(await service.authenticatedSessionId(oldRequest), "");
  assert.equal(
    await service.authenticatedSessionId(createRequest(updated.cookie)),
    updated.sessionId,
  );

  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        account: "owner-login",
        password: BASE_PASSWORD,
      }),
    (error) => error.statusCode === 401,
  );
  const login = await service.login({
    request: createRequest(),
    account: "next-login",
    password: BASE_PASSWORD,
  });
  assert.equal(login.username, "owner-display");
});

test("changing the password invalidates the previous session", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
  });
  const setup = await configure(service, {
    account: "owner-login",
    username: "owner-display",
  });
  const oldRequest = createRequest(setup.cookie);

  const updated = await service.updateCredentials({
    request: oldRequest,
    account: "owner-login",
    username: "owner-display",
    currentPassword: BASE_PASSWORD,
    newPassword: "next-password",
  });

  assert.equal(updated.accountChanged, false);
  assert.equal(updated.usernameChanged, false);
  assert.equal(updated.passwordChanged, true);
  assert.equal(await service.authenticatedSessionId(oldRequest), "");
  assert.equal(
    await service.authenticatedSessionId(createRequest(updated.cookie)),
    updated.sessionId,
  );
});

test("credential changes require the current password", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
  });
  const setup = await configure(service);
  const request = createRequest(setup.cookie);

  await assert.rejects(
    () =>
      service.updateCredentials({
        request,
        account: "owner",
        username: "owner",
        currentPassword: "",
        newPassword: "",
      }),
    (error) =>
      error.statusCode === 400 &&
      error.code === "ACCESS_CURRENT_PASSWORD_REQUIRED",
  );
  await assert.rejects(
    () =>
      service.updateCredentials({
        request,
        account: "owner",
        username: "owner",
        currentPassword: "wrong-password",
        newPassword: "",
      }),
    (error) =>
      error.statusCode === 403 &&
      error.code === "ACCESS_CURRENT_PASSWORD_INVALID",
  );
});

test("repeated access login failures are rate limited", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
    maxLoginFailures: 5,
    loginWindowMs: 60_000,
  });
  await configure(service);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () =>
        service.login({
          request: createRequest(),
          account: "owner",
          password: "wrong-password",
        }),
      (error) => error.statusCode === 401,
    );
  }
  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        account: "owner",
        password: BASE_PASSWORD,
      }),
    (error) =>
      error.statusCode === 429 &&
      error.code === "ACCESS_LOGIN_RATE_LIMITED" &&
      error.retryAfterSeconds > 0,
  );
});
