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
  buildWeComAppRequest,
  buildWeComAppTokenRequest,
  buildWeComRequest,
  describeNotificationSettings,
  enabledNotificationChannels,
  normalizeNotificationSettings,
  normalizeProxyUrl,
  normalizeWeComAppAgentId,
  normalizeWeComAppCorpId,
  normalizeWeComAppSecret,
  normalizeWeComAppToUser,
  sendNotificationChannels,
  sendWeComAppNotification,
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
  wecomApp: {
    enabled: true,
    corpId: "ww1234567890abcdef",
    secret: "wecom-app_SECRET-123",
    agentId: "1000002",
    toUser: "UserID1|UserID2",
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
    if (url.startsWith("https://qyapi.weixin.qq.com/cgi-bin/gettoken")) {
      return Response.json({
        errcode: 0,
        errmsg: "ok",
        access_token: "wecom-app-access-token-123",
        expires_in: 7200,
      });
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
  assert.equal(described.enabledCount, 6);
  assert.equal(described.configuredCount, 6);
  const serialized = JSON.stringify(described);
  assert.equal(serialized.includes("abc_DEF-123"), false);
  assert.equal(serialized.includes("hongguo-test-topic"), false);
  assert.equal(serialized.includes("tk_abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(
    serialized.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"),
    false,
  );
  assert.equal(serialized.includes("wecom_KEY-123"), false);
  assert.equal(serialized.includes("ww1234567890abcdef"), false);
  assert.equal(serialized.includes("wecom-app_SECRET-123"), false);
  assert.equal(serialized.includes("wecom-app-access-token-123"), false);
  assert.equal(serialized.includes("ding-access_TOKEN-123"), false);
  assert.equal(serialized.includes("SEC0123456789+/abcdef"), false);
});

test("fresh notification settings have no visible notification items", () => {
  const settings = normalizeNotificationSettings();
  assert.deepEqual(settings.items, []);
});

test("legacy configured notification channels all migrate into items", () => {
  const settings = normalizeNotificationSettings(ALL_CHANNELS);
  assert.deepEqual(
    settings.items.map((item) => item.type),
    ["bark", "ntfy", "telegram", "wecom", "wecomApp", "dingtalk"],
  );
  assert.equal(settings.items.every((item) => item.enabled), true);
});

test("legacy channel settings merge into an existing empty item list", () => {
  const settings = normalizeNotificationSettings({
    items: [],
    bark: {
      enabled: true,
      key: "legacy_BARK-key",
    },
  });

  assert.deepEqual(settings.items, [
    {
      id: "legacy-bark",
      type: "bark",
      enabled: true,
      key: "legacy_BARK-key",
    },
  ]);
});

test("an equivalent item prevents a legacy channel from being duplicated", () => {
  const settings = normalizeNotificationSettings({
    items: [
      {
        id: "bark-existing",
        type: "bark",
        enabled: true,
        key: "legacy_BARK-key",
      },
    ],
    bark: {
      enabled: true,
      key: "legacy_BARK-key",
    },
  });

  assert.equal(settings.items.length, 1);
  assert.equal(settings.items[0].id, "bark-existing");
});

test("many notification items retain their order, ids, and blank secrets", () => {
  const items = Array.from({ length: 24 }, (_, index) => ({
    id: `bark-instance-${index + 1}`,
    type: "bark",
    enabled: false,
    key: `bark_KEY_${index + 1}`,
  }));
  const saved = applyNotificationSettingsPatch(normalizeNotificationSettings(), {
    items,
  });
  assert.equal(saved.items.length, 24);
  assert.deepEqual(
    saved.items.map((item) => item.id),
    items.map((item) => item.id),
  );

  const retained = saved.items
    .filter((item) => item.id !== "bark-instance-12")
    .map(({ id, type, enabled }) => ({ id, type, enabled }));
  const resaved = applyNotificationSettingsPatch(saved, {
    items: retained,
  });
  assert.equal(resaved.items.length, 23);
  assert.equal(
    resaved.items.some((item) => item.id === "bark-instance-12"),
    false,
  );
  assert.equal(
    resaved.items.find((item) => item.id === "bark-instance-23").key,
    "bark_KEY_23",
  );
});

test("notification item names persist, trim, clear, and keep item order", () => {
  const saved = applyNotificationSettingsPatch(
    normalizeNotificationSettings(),
    {
      items: [
        {
          id: "bark-work",
          type: "bark",
          name: "  工作手机  ",
          enabled: false,
        },
        {
          id: "ntfy-personal",
          type: "ntfy",
          name: "个人提醒",
          enabled: false,
        },
      ],
    },
  );

  assert.deepEqual(
    saved.items.map(({ id, name }) => ({ id, name })),
    [
      { id: "bark-work", name: "工作手机" },
      { id: "ntfy-personal", name: "个人提醒" },
    ],
  );

  const reordered = applyNotificationSettingsPatch(saved, {
    items: [
      {
        id: "ntfy-personal",
        type: "ntfy",
        name: "个人提醒",
        enabled: false,
      },
      {
        id: "bark-work",
        type: "bark",
        name: "",
        enabled: false,
      },
    ],
  });

  assert.deepEqual(
    reordered.items.map(({ id, name }) => ({ id, name })),
    [
      { id: "ntfy-personal", name: "个人提醒" },
      { id: "bark-work", name: undefined },
    ],
  );
});

test("an empty notification item list clears every saved notification", () => {
  const saved = applyNotificationSettingsPatch(normalizeNotificationSettings(), {
    items: [
      {
        id: "bark-first",
        type: "bark",
        enabled: true,
        key: "bark_KEY_first",
      },
    ],
  });
  const cleared = applyNotificationSettingsPatch(saved, { items: [] });
  assert.deepEqual(cleared.items, []);
  assert.equal(cleared.bark.enabled, false);
  assert.equal(cleared.bark.key, "");
  assert.deepEqual(normalizeNotificationSettings(cleared).items, []);
});

test("enabled notification type discovery is deduplicated", () => {
  const settings = normalizeNotificationSettings({
    items: [
      {
        id: "bark-first",
        type: "bark",
        enabled: true,
        key: "bark_KEY_first",
      },
      {
        id: "bark-second",
        type: "bark",
        enabled: true,
        key: "bark_KEY_second",
      },
      {
        id: "ntfy-first",
        type: "ntfy",
        enabled: true,
        topic: "notification-topic",
      },
    ],
  });
  assert.deepEqual(enabledNotificationChannels(settings), ["bark", "ntfy"]);
});

test("multiple enabled instances of one notification type send separately", async () => {
  const calls = [];
  const settings = normalizeNotificationSettings({
    items: [
      {
        id: "bark-first",
        type: "bark",
        enabled: true,
        key: "bark_KEY_first",
      },
      {
        id: "bark-second",
        type: "bark",
        enabled: true,
        key: "bark_KEY_second",
      },
    ],
  });
  const result = await sendNotificationChannels(
    settings,
    { title: "测试", body: "正文" },
    { fetchImpl: successfulFetch(calls) },
  );

  assert.equal(result.ok, true);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.results.map((item) => item.itemId),
    ["bark-first", "bark-second"],
  );
  assert.deepEqual(
    result.results.map((item) => item.label),
    ["Bark 1", "Bark 2"],
  );
  assert.equal(calls.length, 2);
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
      wecomApp: false,
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
    wecomApp: false,
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
    wecomApp: {
      enabled: true,
      corpId: "",
      secret: "",
      agentId: "",
      toUser: "",
    },
    dingtalk: { enabled: true, accessToken: "", secret: "" },
  });
  assert.equal(unchanged.bark.key, ALL_CHANNELS.bark.key);
  assert.equal(unchanged.ntfy.token, ALL_CHANNELS.ntfy.token);
  assert.equal(unchanged.telegram.botToken, ALL_CHANNELS.telegram.botToken);
  assert.equal(unchanged.wecom.key, ALL_CHANNELS.wecom.key);
  assert.equal(unchanged.wecomApp.corpId, ALL_CHANNELS.wecomApp.corpId);
  assert.equal(unchanged.wecomApp.secret, ALL_CHANNELS.wecomApp.secret);
  assert.equal(unchanged.wecomApp.agentId, ALL_CHANNELS.wecomApp.agentId);
  assert.equal(unchanged.wecomApp.toUser, ALL_CHANNELS.wecomApp.toUser);
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
    wecomApp: { clear: true },
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
  assert.deepEqual(cleared.wecomApp, {
    enabled: false,
    corpId: "",
    secret: "",
    agentId: "",
    toUser: "",
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
  assert.equal(ntfy.body, "测试\n正文");

  const telegram = buildTelegramRequest(ALL_CHANNELS.telegram, {
    title: "测试",
    body: "正文",
  });
  assert.equal(new URL(telegram.endpoint).origin, "https://api.telegram.org");
  assert.equal(telegram.payload.chat_id, "123456789");
  assert.equal(telegram.payload.text, "测试\n正文");

  const wecom = buildWeComRequest(ALL_CHANNELS.wecom, {
    title: "测试",
    body: "正文",
  });
  assert.equal(new URL(wecom.endpoint).origin, "https://qyapi.weixin.qq.com");
  assert.equal(wecom.payload.msgtype, "text");
  assert.equal(wecom.payload.text.content, "【短剧助手】\n测试\n正文");

  const wecomAppToken = buildWeComAppTokenRequest(ALL_CHANNELS.wecomApp);
  const wecomAppTokenUrl = new URL(wecomAppToken.endpoint);
  assert.equal(wecomAppTokenUrl.origin, "https://qyapi.weixin.qq.com");
  assert.equal(wecomAppTokenUrl.pathname, "/cgi-bin/gettoken");
  assert.equal(
    wecomAppTokenUrl.searchParams.get("corpid"),
    ALL_CHANNELS.wecomApp.corpId,
  );
  assert.equal(
    wecomAppTokenUrl.searchParams.get("corpsecret"),
    ALL_CHANNELS.wecomApp.secret,
  );

  const wecomApp = buildWeComAppRequest(
    ALL_CHANNELS.wecomApp,
    {
      title: "测试",
      body: "正文",
    },
    "wecom-app-access-token-123",
  );
  const wecomAppUrl = new URL(wecomApp.endpoint);
  assert.equal(wecomAppUrl.origin, "https://qyapi.weixin.qq.com");
  assert.equal(wecomAppUrl.pathname, "/cgi-bin/message/send");
  assert.equal(
    wecomAppUrl.searchParams.get("access_token"),
    "wecom-app-access-token-123",
  );
  assert.deepEqual(wecomApp.payload, {
    touser: "UserID1|UserID2",
    msgtype: "text",
    agentid: 1000002,
    text: {
      content: wecomApp.payload.text.content,
    },
    safe: 0,
  });
  assert.equal(
    wecomApp.payload.text.content,
    "【短剧助手】\n测试\n正文",
  );

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
  assert.equal(dingtalk.payload.text.content, "【短剧助手】\n测试\n正文");
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

test("enterprise app credentials and recipients reject unsafe values", () => {
  assert.throws(
    () => normalizeWeComAppCorpId("ww-invalid corp"),
    (error) => error.code === "INVALID_WECOM_APP_CORP_ID",
  );
  assert.throws(
    () => normalizeWeComAppSecret("invalid secret"),
    (error) => error.code === "INVALID_WECOM_APP_SECRET",
  );
  assert.throws(
    () => normalizeWeComAppAgentId("0"),
    (error) => error.code === "INVALID_WECOM_APP_AGENT_ID",
  );

  for (const invalidToUser of [
    "@someone",
    "@all|UserID1",
    Array.from({ length: 101 }, (_, index) => `user${index}`).join("|"),
  ]) {
    assert.throws(
      () => normalizeWeComAppToUser(invalidToUser),
      (error) => error.code === "INVALID_WECOM_APP_TO_USER",
    );
  }

  assert.equal(
    normalizeWeComAppToUser("UserID1, UserID2 UserID3"),
    "UserID1|UserID2|UserID3",
  );
  assert.equal(normalizeWeComAppToUser("@all"), "@all");

  const overlongStored = normalizeNotificationSettings({
    wecomApp: {
      ...ALL_CHANNELS.wecomApp,
      toUser: "A".repeat(1_025),
    },
  });
  assert.equal(overlongStored.wecomApp.toUser, "");
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
  assert.equal(result.total, 6);
  assert.equal(result.delivered, 6);
  assert.equal(result.failed, 0);
  assert.deepEqual(
    result.results.map((item) => item.channel),
    ["bark", "ntfy", "telegram", "wecom", "wecomApp", "dingtalk"],
  );
  assert.equal(calls.length, 7);
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
        wecomApp: true,
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
      call.url.startsWith("https://api.telegram.org/") ||
      call.url.includes("/cgi-bin/gettoken?") ||
      call.url.includes("/cgi-bin/message/send?");
    assert.equal(
      Object.hasOwn(call.options, "dispatcher"),
      proxied,
      call.url,
    );
    if (proxied) {
      assert.equal(call.options.dispatcher, dispatcher);
    }
  }
  assert.equal(
    calls.filter((call) => Object.hasOwn(call.options, "dispatcher")).length,
    4,
  );
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
  assert.equal(result.failed, 5);
  assert.match(summarizeNotificationDelivery(result), /已送达 Bark/);
  assert.match(summarizeNotificationDelivery(result), /ntfy/);
  assert.match(summarizeNotificationDelivery(result), /Telegram/);
  assert.match(summarizeNotificationDelivery(result), /企业微信/);
  assert.match(summarizeNotificationDelivery(result), /企业微信应用/);
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
  assert.equal(result.failed, 6);
  assert.equal(result.results.every((item) => item.ok === false), true);
  assert.match(summarizeNotificationDelivery(result), /发送失败/);
});

test("enterprise app delivery masks credentials in upstream errors", async () => {
  const config = normalizeNotificationSettings(ALL_CHANNELS).wecomApp;
  const accessToken = "wecom-app-secret-access-token";

  await assert.rejects(
    sendWeComAppNotification(
      config,
      { title: "测试", body: "正文" },
      {
        fetchImpl: async () =>
          Response.json(
            {
              errcode: 40001,
              errmsg: `bad ${config.corpId} ${config.secret} corpsecret=${config.secret}`,
            },
            { status: 400 },
          ),
      },
    ),
    (error) => {
      assert.equal(error.code, "WECOM_APP_TOKEN_HTTP_ERROR");
      assert.equal(error.message.includes(config.corpId), false);
      assert.equal(error.message.includes(config.secret), false);
      assert.match(error.message, /corpsecret=\*\*\*/);
      return true;
    },
  );

  let calls = 0;
  await assert.rejects(
    sendWeComAppNotification(
      config,
      { title: "测试", body: "正文" },
      {
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return Response.json({
              errcode: 0,
              access_token: accessToken,
              expires_in: 7200,
            });
          }
          return Response.json({
            errcode: 40003,
            errmsg: `bad ${config.corpId} ${config.secret} access_token=${accessToken}`,
          });
        },
      },
    ),
    (error) => {
      assert.equal(error.code, "WECOM_APP_HTTP_ERROR");
      assert.equal(error.message.includes(config.corpId), false);
      assert.equal(error.message.includes(config.secret), false);
      assert.equal(error.message.includes(accessToken), false);
      assert.match(error.message, /access_token=\*\*\*/);
      return true;
    },
  );
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
