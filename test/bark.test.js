import assert from "node:assert/strict";
import test from "node:test";
import {
  BarkError,
  buildBarkRequest,
  maskBarkKey,
  normalizeBarkKey,
  sendBarkNotification,
  __test,
} from "../src/bark.js";

test("Bark key validation never accepts a full URL", () => {
  assert.throws(
    () => normalizeBarkKey("https://api.day.app/example"),
    (error) => error instanceof BarkError && error.code === "INVALID_BARK_KEY",
  );
  assert.equal(normalizeBarkKey("abc_DEF-123"), "abc_DEF-123");
  assert.equal(maskBarkKey("abcdefghijk"), "abc***ijk");
});

test("Bark request is fixed to api.day.app and encodes the key path", () => {
  const request = buildBarkRequest("abc_DEF-123", {
    title: "标题",
    body: "正文",
  });
  assert.equal(request.endpoint, "https://api.day.app/abc_DEF-123");
  assert.equal(request.payload.group, "短剧助手");
  assert.equal(request.payload.level, "active");
});

test("Bark title and body are length limited", () => {
  const request = buildBarkRequest("abc_DEF-123", {
    title: "标".repeat(100),
    body: "文".repeat(300),
  });
  assert.equal(request.payload.title.length, __test.MAX_TITLE_LENGTH);
  assert.equal(request.payload.body.length, __test.MAX_BODY_LENGTH);
  assert.ok(request.payload.title.endsWith("…"));
  assert.ok(request.payload.body.endsWith("…"));
});

test("sendBarkNotification posts JSON and parses Bark success", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return Response.json({ code: 200, message: "success" });
  };
  const result = await sendBarkNotification(
    "abc_DEF-123",
    { title: "测试", body: "通知正文" },
    { fetchImpl },
  );
  assert.equal(result.ok, true);
  assert.equal(captured.url, "https://api.day.app/abc_DEF-123");
  assert.equal(captured.options.method, "POST");
  assert.deepEqual(JSON.parse(captured.options.body).title, "测试");
});

test("Bark API errors are surfaced without leaking the key", async () => {
  const fetchImpl = async () =>
    Response.json({ code: 400, message: "invalid key" });
  await assert.rejects(
    sendBarkNotification(
      "abc_DEF-123",
      { title: "测试", body: "通知正文" },
      { fetchImpl },
    ),
    (error) =>
      error instanceof BarkError &&
      error.code === "BARK_API_ERROR" &&
      !error.message.includes("abc_DEF-123"),
  );
});
