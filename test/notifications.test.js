import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  NotificationError,
  applyNotificationSettingsPatch,
  applyProxySettingsPatch,
  buildDingTalkRequest,
  buildNtfyRequest,
  buildTelegramRequest,
  buildWeComRequest,
  describeNotificationSettings,
  normalizeNotificationSettings,
  normalizeProxyUrl,
  sendNotificationChannels,
  summarizeNotificationDelivery,
  __test,
} from "../src/notifications.js";

const ALL_CHANNELS = {
  bark: {
    enabled: true,
    key: "abc_DEF-123",
  },
  ntfy: {
    enabled: true,
    topic: "hongguo-test-topic",
    token: "tk_abcdefghijklmnopqrstuvwxyz",
  },
  telegram: {
    enabled: true,
    botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcd",
    chatId: "123456789",
  },
  wecom: {
    enabled: true,
    key: "wecom_KEY-123",
  },
  dingtalk: {
    enabled: true,
    accessToken: "ding-access_TOKEN-123",
    secret: "SEC0123456789+/abcdef",
  },
};

function successfulFetch(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.day.app/")) {
      return Response.json({ code: 200, message: "success" });
    }
    if (url.startsWith("https://ntfy.sh/")) {
      return Response.json({ id: "ntfy-message" });
    }
    if (url.startsWith("https://api.telegram.org/")) {
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    if (url.startsWith("https://qyapi.weixin.qq.com/")) {
      return Response.json({ errcode: 0, errmsg: "ok" });
    }
    if (url.startsWith("https://oapi.dingtalk.com/")) {
      return Response.json({ errcode: 0, errmsg: "ok" });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
}

test("notification settings migrate a legacy Bark key and never expose secrets", () => {
  const migrated = normalizeNotificationSettings(undefined, "legacy_BARK-key");
  assert.deepEqual(migrated.bark, {
    enabled: true,
    key: "legacy_BARK-key",
  });

  const described = describeNotificationSettings(ALL_CHANNELS);
  assert.equal(described.enabledCount, 5);
  assert.equal(described.configuredCount, 5);
  const serialized = JSON.stringify(described);
  assert.equal(serialized.includes("abc_DEF-123"), false);
  assert.equal(serialized.includes("hongguo-test-topic"), false);
  assert.equal(serialized.includes("tk_abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(
    serialized.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"),
    false,
  );
  assert.equal(serialized.includes("wecom_KEY-123"), false);
  assert.equal(serialized.includes("ding-access_TOKEN-123"), false);
  assert.equal(serialized.includes("SEC0123456789+/abcdef"), false);
});

test("notification proxy accepts HTTP(S) origins and masks credentials", () => {
  assert.equal(
    normalizeProxyUrl(" http://127.0.0.1:7890 "),
    "http://127.0.0.1:7890/",
  );
  assert.equal(
    normalizeProxyUrl("https://proxy-user:proxy-pass@proxy.example.com"),
    "https://proxy-user:proxy-pass@proxy.example.com/",
  );

  for (const invalidUrl of [
    "socks5://127.0.0.1:1080",
    "http://127.0.0.1:7890/proxy",
    "http://127.0.0.1:7890/?mode=global",
    "http://127.0.0.1:7890/#proxy",
    "not-a-url",
  ]) {
    assert.throws(
      () => normalizeProxyUrl(invalidUrl),
      (error) =>
        error instanceof NotificationError &&
        error.code === "INVALID_NOTIFICATION_PROXY" &&
        error.statusCode === 400,
    );
  }

  const settings = normalizeNotificationSettings({
    ...ALL_CHANNELS,
    proxy: {
      enabled: true,
      url: "http://proxy-user:proxy-pass@127.0.0.1:7890",
      channels: {
        bark: true,
        telegram: true,
      },
    },
  });
  const described = describeNotificationSettings(settings);
  assert.deepEqual(described.proxy, {
    enabled: true,
    configured: true,
    urlHint: "http://***@127.0.0.1:7890",
    channels: {
      bark: true,
      ntfy: false,
      telegram: true,
      wecom: false,
      dingtalk: false,
    },
  });
  const serialized = JSON.stringify(described);
  assert.equal(serialized.includes("proxy-user"), false);
  assert.equal(serialized.includes("proxy-pass"), false);
});

test("notification proxy patch requires a URL and selected channel", () => {
  const empty = normalizeNotificationSettings().proxy;
  assert.throws(
    () =>
      applyProxySettingsPatch(empty, {
        enabled: true,
        channels: { bark: true },
      }),
    (error) =>
      error instanceof NotificationError &&
      error.code === "INVALID_NOTIFICATION_PROXY",
  );
  assert.throws(
    () =>
      applyProxySettingsPatch(empty, {
        enabled: true,
        url: "http://127.0.0.1:7890",
      }),
    (error) =>
      error instanceof NotificationError &&
      error.code === "INCOMPLETE_NOTIFICATION_PROXY",
  );

  const configured = applyProxySettingsPatch(empty, {
    url: "http://127.0.0.1:7890",
    channels: { bark: true },
  });
  const enabled = applyProxySettingsPatch(configured, {
    enabled: true,
    url: "",
    channels: { telegram: true },
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.url, "http://127.0.0.1:7890/");
  assert.deepEqual(enabled.channels, {
    bark: true,
    ntfy: false,
    telegram: true,
    wecom: false,
    dingtalk: false,
  });

  assert.deepEqual(
    applyProxySettingsPatch(enabled, { clear: true }),
    normalizeNotificationSettings().proxy,
  );
});

test("notification patches preserve blank secrets and clearing disables a channel", () => {
  const unchanged = applyNotificationSettingsPatch(ALL_CHANNELS, {
    bark: { enabled: true, key: "" },
    ntfy: { enabled: true, token: "" },
    telegram: { enabled: true, botToken: "", chatId: "" },
    wecom: { enabled: true, key: "" },
    dingtalk: { enabled: true, accessToken: "", secret: "" },
  });
  assert.equal(unchanged.bark.key, ALL_CHANNELS.bark.key);
  assert.equal(unchanged.ntfy.token, ALL_CHANNELS.ntfy.token);
  assert.equal(unchanged.telegram.botToken, ALL_CHANNELS.telegram.botToken);
  assert.equal(unchanged.wecom.key, ALL_CHANNELS.wecom.key);
  assert.equal(
    unchanged.dingtalk.accessToken,
    ALL_CHANNELS.dingtalk.accessToken,
  );
  assert.equal(unchanged.dingtalk.secret, ALL_CHANNELS.dingtalk.secret);

  const cleared = applyNotificationSettingsPatch(ALL_CHANNELS, {
    bark: { clear: true, enabled: true },
    ntfy: { clear: true },
    telegram: { clear: true },
    wecom: { clear: true },
    dingtalk: { clear: true },
  });
  assert.deepEqual(cleared.bark, { enabled: false, key: "" });
  assert.deepEqual(cleared.ntfy, {
    enabled: false,
    topic: "",
    token: "",
  });
  assert.deepEqual(cleared.telegram, {
    enabled: false,
    botToken: "",
    chatId: "",
  });
  assert.deepEqual(cleared.wecom, {
    enabled: false,
    key: "",
  });
  assert.deepEqual(cleared.dingtalk, {
    enabled: false,
    accessToken: "",
    secret: "",
  });
});

test("notification requests stay on their fixed API origins", () => {
  const ntfy = buildNtfyRequest(ALL_CHANNELS.ntfy, {
    title: "测试",
    body: "正文",
  });
  assert.equal(new URL(ntfy.endpoint).origin, "https://ntfy.sh");
  assert.equal(
    ntfy.headers.authorization,
    "Bearer tk_abcdefghijklmnopqrstuvwxyz",
  );

  const telegram = buildTelegramRequest(ALL_CHANNELS.telegram, {
    title: "测试",
    body: "正文",
  });
  assert.equal(new URL(telegram.endpoint).origin, "https://api.telegram.org");
  assert.equal(telegram.payload.chat_id, "123456789");

  const wecom = buildWeComRequest(ALL_CHANNELS.wecom, {
    title: "测试",
    body: "正文",
  });
  assert.equal(new URL(wecom.endpoint).origin, "https://qyapi.weixin.qq.com");
  assert.equal(wecom.payload.msgtype, "text");
  assert.match(wecom.payload.text.content, /【红果追更】/);

  const timestamp = 1_700_000_000_000;
  const dingtalk = buildDingTalkRequest(
    ALL_CHANNELS.dingtalk,
    {
      title: "测试",
      body: "正文",
    },
    { timestamp },
  );
  const dingtalkUrl = new URL(dingtalk.endpoint);
  assert.equal(dingtalkUrl.origin, "https://oapi.dingtalk.com");
  assert.equal(
    dingtalkUrl.searchParams.get("access_token"),
    ALL_CHANNELS.dingtalk.accessToken,
  );
  assert.equal(dingtalkUrl.searchParams.get("timestamp"), String(timestamp));
  assert.equal(
    dingtalkUrl.searchParams.get("sign"),
    createHmac("sha256", ALL_CHANNELS.dingtalk.secret)
      .update(`${timestamp}\n${ALL_CHANNELS.dingtalk.secret}`)
      .digest("base64"),
  );
});

test("robot webhook text is safely limited to 2048 UTF-8 bytes", () => {
  const request = buildWeComRequest(ALL_CHANNELS.wecom, {
    title: "红果更新提醒",
    body: "万妖图录传".repeat(300),
  });
  const content = request.payload.text.content;
  assert.equal(
    Buffer.byteLength(content, "utf8") <= __test.MAX_WECOM_TEXT_BYTES,
    true,
  );
  assert.equal(content.includes("�"), false);
});

test("robot keys reject full webhook URLs", () => {
  assert.throws(
    () =>
      buildWeComRequest(
        { key: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc" },
        { title: "测试", body: "正文" },
      ),
    (error) => error.code === "INVALID_WECOM_KEY",
  );
  assert.throws(
    () =>
      buildDingTalkRequest(
        {
          accessToken:
            "https://oapi.dingtalk.com/robot/send?access_token=abc",
        },
        { title: "测试", body: "正文" },
      ),
    (error) => error.code === "INVALID_DINGTALK_ACCESS_TOKEN",
  );
});

test("all enabled notification channels are delivered in parallel", async () => {
  const calls = [];
  const result = await sendNotificationChannels(
    ALL_CHANNELS,
    { title: "测试", body: "正文" },
    { fetchImpl: successfulFetch(calls) },
  );

  assert.equal(result.ok, true);
  assert.equal(result.total, 5);
  assert.equal(result.delivered, 5);
  assert.equal(result.failed, 0);
  assert.deepEqual(
    result.results.map((item) => item.channel),
    ["bark", "ntfy", "telegram", "wecom", "dingtalk"],
  );
  assert.equal(calls.length, 5);
});

test("notification proxy is injected only into selected channels", async () => {
  const calls = [];
  const dispatcher = {
    closed: false,
    async close() {
      this.closed = true;
    },
  };
  const createdFor = [];
  const settings = {
    ...ALL_CHANNELS,
    proxy: {
      enabled: true,
      url: "http://proxy-user:proxy-pass@127.0.0.1:7890",
      channels: {
        bark: true,
        telegram: true,
      },
    },
  };

  const result = await sendNotificationChannels(
    settings,
    { title: "测试", body: "正文" },
    {
      fetchImpl: successfulFetch(calls),
      createProxyDispatcher(url) {
        createdFor.push(url);
        return dispatcher;
      },
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(createdFor, [
    "http://proxy-user:proxy-pass@127.0.0.1:7890/",
  ]);
  assert.equal(dispatcher.closed, true);
  for (const call of calls) {
    const proxied =
      call.url.startsWith("https://api.day.app/") ||
      call.url.startsWith("https://api.telegram.org/");
    assert.equal(
      Object.hasOwn(call.options, "dispatcher"),
      proxied,
      call.url,
    );
    if (proxied) {
      assert.equal(call.options.dispatcher, dispatcher);
    }
  }
});

test("a partial channel failure does not block successful channels", async () => {
  const result = await sendNotificationChannels(
    ALL_CHANNELS,
    { title: "测试", body: "正文" },
    {
      fetchImpl: async (url) => {
        if (url.startsWith("https://api.day.app/")) {
          return Response.json({ code: 200, message: "success" });
        }
        if (url.startsWith("https://ntfy.sh/")) {
          return new Response("unavailable", { status: 503 });
        }
        return Response.json(
          { ok: false, description: "chat not found" },
          { status: 400 },
        );
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.delivered, 1);
  assert.equal(result.failed, 4);
  assert.match(summarizeNotificationDelivery(result), /已送达 Bark/);
  assert.match(summarizeNotificationDelivery(result), /ntfy/);
  assert.match(summarizeNotificationDelivery(result), /Telegram/);
  assert.match(summarizeNotificationDelivery(result), /企业微信/);
  assert.match(summarizeNotificationDelivery(result), /钉钉/);
});

test("all channel failures return structured results without throwing", async () => {
  const result = await sendNotificationChannels(
    ALL_CHANNELS,
    { title: "测试", body: "正文" },
    {
      fetchImpl: async () => {
        throw new Error("network down");
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.delivered, 0);
  assert.equal(result.failed, 5);
  assert.equal(result.results.every((item) => item.ok === false), true);
  assert.match(summarizeNotificationDelivery(result), /发送失败/);
});

test("sending without an enabled channel is rejected", async () => {
  await assert.rejects(
    sendNotificationChannels(
      normalizeNotificationSettings(),
      { title: "测试", body: "正文" },
    ),
    (error) =>
      error instanceof NotificationError &&
      error.code === "NO_NOTIFICATION_CHANNEL" &&
      error.statusCode === 400,
  );
});
