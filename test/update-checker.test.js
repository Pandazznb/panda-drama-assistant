import assert from "node:assert/strict";
import test from "node:test";
import {
  compareVersions,
  UpdateChecker,
} from "../src/update-checker.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

test("compareVersions handles v prefixes and missing patch versions", () => {
  assert.equal(compareVersions("1.14.0", "1.14"), 0);
  assert.equal(compareVersions("v1.15.0", "1.14.9"), 1);
  assert.equal(compareVersions("1.13.9", "1.14.0"), -1);
  assert.equal(compareVersions("2.0.0-beta.1", "2.0.0"), 0);
});

test("UpdateChecker reports an available GitHub release", async () => {
  const checker = new UpdateChecker({
    currentVersion: "1.14.0",
    timeoutMs: 5_000,
    now: () => Date.parse("2026-11-28T00:00:00.000Z"),
    fetchImpl: async () =>
      jsonResponse({
        tag_name: "v1.15.0",
        html_url:
          "https://github.com/Pandazznb/panda-drama-assistant/releases/tag/v1.15.0",
        published_at: "2026-11-27T12:00:00.000Z",
      }),
  });

  const result = await checker.check();
  assert.equal(result.available, true);
  assert.equal(result.latestVersion, "1.15.0");
  assert.equal(result.currentVersion, "1.14.0");
  assert.equal(result.message, "发现新版本 1.15.0。");
  assert.equal(result.checkedAt, "2026-11-28T00:00:00.000Z");
});

test("UpdateChecker reports when the installed version is current", async () => {
  const checker = new UpdateChecker({
    currentVersion: "1.15.0",
    fetchImpl: async () =>
      jsonResponse({
        tag_name: "v1.15.0",
        html_url: "https://example.com/release",
      }),
  });

  const result = await checker.check();
  assert.equal(result.available, false);
  assert.equal(result.message, "当前已是最新版本。");
});

test("UpdateChecker handles a repository with no published release", async () => {
  const checker = new UpdateChecker({
    currentVersion: "1.14.0",
    releasesUrl: "https://example.com/releases",
    fetchImpl: async () => jsonResponse({}, 404),
  });

  const result = await checker.check();
  assert.equal(result.available, false);
  assert.equal(result.latestVersion, "1.14.0");
  assert.equal(result.releaseUrl, "https://example.com/releases");
  assert.equal(result.message, "GitHub 上暂时没有正式版本。");
});

test("UpdateChecker maps HTTP failures and aborts to public errors", async () => {
  const httpChecker = new UpdateChecker({
    fetchImpl: async () => jsonResponse({}, 503),
  });
  await assert.rejects(
    () => httpChecker.check(),
    (error) =>
      error.code === "UPDATE_CHECK_FAILED" &&
      error.statusCode === 502,
  );

  const abortChecker = new UpdateChecker({
    fetchImpl: async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    },
  });
  await assert.rejects(
    () => abortChecker.check(),
    (error) =>
      error.code === "UPDATE_CHECK_TIMEOUT" &&
      error.statusCode === 502,
  );
});

test("UpdateChecker rejects malformed release responses", async () => {
  const invalidJsonChecker = new UpdateChecker({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("invalid json");
      },
    }),
  });
  await assert.rejects(
    () => invalidJsonChecker.check(),
    (error) => error.code === "UPDATE_RESPONSE_INVALID",
  );

  const missingVersionChecker = new UpdateChecker({
    fetchImpl: async () => jsonResponse({ name: "latest" }),
  });
  await assert.rejects(
    () => missingVersionChecker.check(),
    (error) => error.code === "UPDATE_VERSION_MISSING",
  );
});
