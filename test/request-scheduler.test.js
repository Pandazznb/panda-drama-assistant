import assert from "node:assert/strict";
import test from "node:test";
import {
  UpstreamRequestScheduler,
  retryAfterMilliseconds,
} from "../src/request-scheduler.js";

function schedulerOptions(overrides = {}) {
  return {
    minIntervalMs: 0,
    retryBaseMs: 1_000,
    retryMaxMs: 60_000,
    random: () => 0,
    sleep: async () => {},
    ...overrides,
  };
}

test("retryAfterMilliseconds supports seconds and HTTP dates", () => {
  const now = Date.parse("2026-11-02T00:00:00.000Z");
  assert.equal(
    retryAfterMilliseconds(
      new Response(null, { headers: { "retry-after": "3" } }),
      now,
    ),
    3_000,
  );
  assert.equal(
    retryAfterMilliseconds(
      new Response(null, {
        headers: {
          "retry-after": "Mon, 02 Nov 2026 00:00:05 GMT",
        },
      }),
      now,
    ),
    5_000,
  );
});

test("HTTP 429 honors Retry-After and recovers without leaking query secrets", async () => {
  const delays = [];
  const logs = [];
  let calls = 0;
  const scheduler = new UpstreamRequestScheduler(
    schedulerOptions({
      maxRetries: 2,
      sleep: async (delayMs) => delays.push(delayMs),
      logger: async (entry) => logs.push(entry),
    }),
  );

  const result = await scheduler.fetch(
    "https://api.example.com/reading/path?token=top-secret",
    {},
    {
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? new Response("busy", {
              status: 429,
              headers: { "retry-after": "2" },
            })
          : new Response('{"ok":true}', { status: 200 });
      },
      readBody: (response) => response.text(),
      label: "测试接口",
    },
  );

  assert.equal(result.response.status, 200);
  assert.equal(result.body, '{"ok":true}');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [2_000]);
  assert.deepEqual(
    logs.map((entry) => entry.action),
    ["upstream.request.retry", "upstream.request.recovered"],
  );
  assert.equal(JSON.stringify(logs).includes("top-secret"), false);
  assert.equal(logs[0].metadata.path, "/reading/path");
  assert.equal(logs[0].metadata.statusCode, 429);
});

test("5xx responses stop after three retries while ordinary 4xx is not retried", async () => {
  const serverDelays = [];
  let serverErrorCalls = 0;
  const serverErrorScheduler = new UpstreamRequestScheduler(
    schedulerOptions({
      maxRetries: 3,
      sleep: async (delayMs) => serverDelays.push(delayMs),
    }),
  );
  const unavailable = await serverErrorScheduler.fetch(
    "https://api.example.com/unavailable",
    {},
    {
      fetchImpl: async () => {
        serverErrorCalls += 1;
        return new Response("unavailable", { status: 503 });
      },
    },
  );

  assert.equal(unavailable.response.status, 503);
  assert.equal(serverErrorCalls, 4);
  assert.deepEqual(serverDelays, [1_000, 2_000, 4_000]);

  let badRequestCalls = 0;
  const badRequestScheduler = new UpstreamRequestScheduler(
    schedulerOptions({ maxRetries: 3 }),
  );
  const badRequest = await badRequestScheduler.fetch(
    "https://api.example.com/bad-request",
    {},
    {
      fetchImpl: async () => {
        badRequestCalls += 1;
        return new Response("bad request", { status: 400 });
      },
    },
  );

  assert.equal(badRequest.response.status, 400);
  assert.equal(badRequestCalls, 1);
});

test("network failures are retried and return the recovered response", async () => {
  const delays = [];
  let calls = 0;
  const scheduler = new UpstreamRequestScheduler(
    schedulerOptions({
      maxRetries: 2,
      sleep: async (delayMs) => delays.push(delayMs),
    }),
  );

  const result = await scheduler.fetch(
    "https://api.example.com/retry-network",
    {},
    {
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError("network disconnected");
        }
        return new Response("ok", { status: 200 });
      },
      readBody: (response) => response.text(),
    },
  );

  assert.equal(result.body, "ok");
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1_000]);
});

test("response body reading remains inside the request timeout", async () => {
  const scheduler = new UpstreamRequestScheduler(
    schedulerOptions({ maxRetries: 0 }),
  );

  await assert.rejects(
    scheduler.fetch(
      "https://api.example.com/slow-body",
      {},
      {
        timeoutMs: 20,
        fetchImpl: async () =>
          new Response(
            new ReadableStream({
              start() {},
            }),
            { status: 200 },
          ),
        readBody: (_response, { signal }) =>
          new Promise((resolve, reject) => {
            if (signal.aborted) {
              reject(signal.reason);
              return;
            }
            signal.addEventListener(
              "abort",
              () => reject(signal.reason),
              { once: true },
            );
          }),
      },
    ),
    (error) => error.code === "UPSTREAM_TIMEOUT",
  );
});

test("the concurrency slot is held until the response body is consumed", async () => {
  const scheduler = new UpstreamRequestScheduler(
    schedulerOptions({ maxConcurrency: 1 }),
  );
  let fetchCalls = 0;
  let releaseBody;
  let signalBodyStarted;
  const bodyStarted = new Promise((resolve) => {
    signalBodyStarted = resolve;
  });
  const bodyGate = new Promise((resolve) => {
    releaseBody = resolve;
  });
  const readBody = async (response) => {
    signalBodyStarted();
    await bodyGate;
    return response.text();
  };
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(`body-${fetchCalls}`, { status: 200 });
  };

  const first = scheduler.fetch(
    "https://api.example.com/first",
    {},
    { fetchImpl, readBody },
  );
  await bodyStarted;
  const second = scheduler.fetch(
    "https://api.example.com/second",
    {},
    { fetchImpl, readBody },
  );

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fetchCalls, 1);
  releaseBody();
  const results = await Promise.all([first, second]);
  assert.equal(results[0].body, "body-1");
  assert.equal(results[1].body, "body-2");
  assert.equal(fetchCalls, 2);
});

test("configured maximum concurrency is never exceeded", async () => {
  const scheduler = new UpstreamRequestScheduler(
    schedulerOptions({ maxConcurrency: 2 }),
  );
  let active = 0;
  let maxActive = 0;
  const readBody = async (response) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return response.text();
  };

  await Promise.all(
    ["one", "two", "three", "four", "five"].map((path) =>
      scheduler.fetch(
        `https://api.example.com/${path}`,
        {},
        {
          fetchImpl: async () => new Response(path, { status: 200 }),
          readBody,
        },
      ),
    ),
  );

  assert.equal(maxActive, 2);
});

test("request starts are spaced by the global minimum interval", async () => {
  const starts = [];
  const scheduler = new UpstreamRequestScheduler(
    schedulerOptions({
      maxConcurrency: 2,
      minIntervalMs: 30,
    }),
  );
  const fetchImpl = async () => {
    starts.push(Date.now());
    return new Response("ok", { status: 200 });
  };

  await Promise.all(
    ["one", "two", "three"].map((path) =>
      scheduler.fetch(
        `https://api.example.com/${path}`,
        {},
        {
          fetchImpl,
          readBody: (response) => response.text(),
        },
      ),
    ),
  );

  assert.equal(starts.length, 3);
  for (let index = 1; index < starts.length; index += 1) {
    assert.ok(
      starts[index] - starts[index - 1] >= 20,
      `request interval was ${starts[index] - starts[index - 1]}ms`,
    );
  }
});
