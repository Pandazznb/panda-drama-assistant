import assert from "node:assert/strict";
import test from "node:test";
import { AccessAuthService } from "../src/access-auth.js";

const BASE_PASSWORD = "correct-horse";

function createMemoryStore(initialCredentials = null) {
  let credentials = initialCredentials
    ? structuredClone(initialCredentials)
    : null;
  return {
    async getAccessAuth() {
      return credentials ? structuredClone(credentials) : null;
    },
    async setAccessAuth(nextCredentials) {
      credentials = structuredClone(nextCredentials);
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

async function configure(service) {
  return service.updateCredentials({
    request: createRequest(),
    username: "owner",
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
    username: "",
    updatedAt: null,
  });
});

test("access credentials are hashed and a login creates a protected session", async () => {
  const store = createMemoryStore();
  const service = new AccessAuthService({ store });
  const setup = await configure(service);

  assert.equal(setup.username, "owner");
  assert.equal(setup.credentials.configured, true);
  assert.equal(setup.credentials.username, "owner");
  assert.match(setup.cookie, /HttpOnly/);
  assert.match(setup.cookie, /SameSite=Lax/);
  assert.match(setup.cookie, /Secure/);

  const stored = await store.getAccessAuth();
  assert.equal(stored.username, "owner");
  assert.notEqual(stored.passwordHash, BASE_PASSWORD);
  assert.equal(stored.passwordHash.includes(BASE_PASSWORD), false);

  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        username: "owner",
        password: "wrong-password",
      }),
    (error) =>
      error.statusCode === 401 &&
      error.code === "ACCESS_LOGIN_INVALID",
  );

  const login = await service.login({
    request: createRequest(),
    username: "owner",
    password: BASE_PASSWORD,
  });
  const authenticatedRequest = createRequest(login.cookie);
  const authorization =
    await service.requireAuthentication(authenticatedRequest);
  assert.equal(authorization.configured, true);
  assert.equal(authorization.authenticated, true);
  assert.equal(authorization.username, "owner");
});

test("changing access credentials invalidates existing sessions", async () => {
  const service = new AccessAuthService({
    store: createMemoryStore(),
  });
  const setup = await configure(service);
  const oldRequest = createRequest(setup.cookie);
  assert.ok(service.authenticatedSessionId(oldRequest));

  const updated = await service.updateCredentials({
    request: oldRequest,
    username: "new-owner",
    currentPassword: BASE_PASSWORD,
    newPassword: "next-password",
  });

  assert.equal(service.authenticatedSessionId(oldRequest), "");
  assert.equal(
    service.authenticatedSessionId(createRequest(updated.cookie)),
    updated.sessionId,
  );
  assert.equal(updated.credentials.username, "new-owner");
  assert.equal(updated.passwordChanged, true);

  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        username: "new-owner",
        password: BASE_PASSWORD,
      }),
    (error) => error.statusCode === 401,
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
          username: "owner",
          password: "wrong-password",
        }),
      (error) => error.statusCode === 401,
    );
  }
  await assert.rejects(
    () =>
      service.login({
        request: createRequest(),
        username: "owner",
        password: BASE_PASSWORD,
      }),
    (error) =>
      error.statusCode === 429 &&
      error.code === "ACCESS_LOGIN_RATE_LIMITED" &&
      error.retryAfterSeconds > 0,
  );
});
