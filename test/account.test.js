import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AccountCookieJar,
  AccountService,
  AccountSessionVault,
  mergeCookieHeaders,
  mixPassportValue,
  normalizeSmsLoginNumber,
  parseFavoritesPayload,
  parseHistoryPayload,
  parseProfilePayload,
  parseReservationsPayload,
} from "../src/account.js";

const SERIES_ID = "7694653385668037657";
const PROFILE_ID = "1234567890123456789";

function assertAccountError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.name, "AccountError");
    assert.equal(error.code, code);
    return true;
  });
}

test("account cookie jar observes domain, path, secure and expiry rules", () => {
  let now = 1_700_000_000_000;
  const jar = new AccountCookieJar({ now: () => now });
  const requestUrl =
    "https://hongguoduanju.com/passport/web/get_qrcode/";

  jar.setCookie(
    "sessionid=secret-session; Domain=.hongguoduanju.com; " +
      "Path=/passport; Secure; Max-Age=60",
    requestUrl,
  );
  jar.setCookie("csrf=token; Path=/; Max-Age=60", requestUrl);

  assert.equal(
    jar.headerFor(
      "https://sub.hongguoduanju.com/passport/web/check_qrconnect/",
    ),
    "sessionid=secret-session",
  );
  assert.equal(jar.get(requestUrl, "sessionid"), "secret-session");
  assert.equal(
    jar.headerFor(
      "http://hongguoduanju.com/passport/web/check_qrconnect/",
    ),
    "csrf=token",
  );
  assert.equal(
    jar.headerFor("https://hongguoduanju.com/passport-other/check"),
    "csrf=token",
  );
  assert.equal(
    jar.headerFor("https://hongguoduanju.com.evil.example/passport/check"),
    "",
  );

  now += 61_000;
  assert.equal(jar.headerFor(requestUrl), "");
});

test("account cookie jar replaces and deletes matching cookies", () => {
  const jar = new AccountCookieJar({
    now: () => 1_700_000_000_000,
  });
  const requestUrl = "https://hongguoduanju.com/passport/login/";

  jar.setCookie(
    "sessionid=first; Domain=hongguoduanju.com; Path=/passport; Max-Age=60",
    requestUrl,
  );
  jar.setCookie(
    "sessionid=second; Domain=.hongguoduanju.com; Path=/passport; Max-Age=60",
    requestUrl,
  );
  assert.equal(jar.headerFor(requestUrl), "sessionid=second");

  jar.setCookie(
    "sessionid=; Domain=hongguoduanju.com; Path=/passport; Max-Age=0",
    requestUrl,
  );
  assert.equal(jar.headerFor(requestUrl), "");
});

test("mergeCookieHeaders keeps the latest value for each cookie", () => {
  assert.equal(
    mergeCookieHeaders(
      "sessionid=old; csrf=one",
      [["sessionid", "new"], ["device_id", "42"]],
      "csrf=two",
    ),
    "sessionid=new; csrf=two; device_id=42",
  );
});

test("SMS login normalizes mobile numbers for the app passport", () => {
  assert.equal(mixPassportValue("24"), "3731");
  assert.equal(
    normalizeSmsLoginNumber("+86", "138 0013 8000"),
    "13800138000",
  );
  assert.equal(
    normalizeSmsLoginNumber("852", "6123-4567"),
    "+852 61234567",
  );
  assert.equal(
    normalizeSmsLoginNumber("852", "06123 4567"),
    "+852 61234567",
  );
  assertAccountError(
    () => normalizeSmsLoginNumber("86", "1380013800"),
    "ACCOUNT_SMS_MOBILE_INVALID",
  );
  assertAccountError(
    () => normalizeSmsLoginNumber("0", "13800138000"),
    "ACCOUNT_SMS_COUNTRY_CODE_INVALID",
  );
});

test("account payload parsers preserve 19-digit series IDs as strings", () => {
  const profile = parseProfilePayload({
    data: {
      biz_user_id: PROFILE_ID,
      user_name: "测试用户",
    },
  });
  assert.equal(profile.id, PROFILE_ID);

  const favorites = parseFavoritesPayload({
    data: {
      video_shelf_info: [
        {
          series_title: "收藏短剧",
          series_cover_url: "https://example.com/cover.jpg",
          episode_cnt: 24,
          collect_time: 1_700_000_000,
          video_data: {
            series_id: SERIES_ID,
            video_desc: "收藏简介",
          },
        },
      ],
    },
  });
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].seriesId, SERIES_ID);
  assert.equal(favorites[0].episodeCount, 24);

  const history = parseHistoryPayload(
    {
      data: {
        video_data: [
          {
            series_id: SERIES_ID,
            vid_index: 7,
            last_watch_time: 1_700_000_100,
          },
        ],
      },
    },
    {
      data: [
        {
          book_id: SERIES_ID,
          book_name: "历史短剧",
          episode_count: 30,
        },
      ],
    },
  );
  assert.equal(history[0].seriesId, SERIES_ID);
  assert.equal(history[0].title, "历史短剧");
  assert.equal(history[0].episodeLabel, "看到第 7 集");

  const reservations = parseReservationsPayload(
    {
      data: {
        subscribe_items: [
          {
            series_title: "预约短剧",
            schedule_publish_time: 1_700_000_200,
            subscribe_data: {
              series_id: SERIES_ID,
              episode_cnt: 12,
            },
          },
        ],
      },
    },
    { online: true },
  );
  assert.equal(reservations[0].seriesId, SERIES_ID);
  assert.equal(reservations[0].importable, true);
});

test("account reservation parser reads online video details", () => {
  const reservations = parseReservationsPayload(
    {
      data: {
        subscribe_items: [
          {
            item_id: "7300000000000000001",
            is_online: true,
            schedule_publish_time: 1_700_000_300,
            subscribe_data: {
              series_id: SERIES_ID,
              title: "已上线预约短剧",
              cover: "https://example.com/online-cover.jpg",
              video_desc: "已上线预约简介",
              episode_cnt: 18,
            },
          },
        ],
        has_more: false,
        next_offset: 0,
      },
    },
    { online: true },
  );
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].seriesId, SERIES_ID);
  assert.equal(reservations[0].title, "已上线预约短剧");
  assert.equal(
    reservations[0].coverUrl,
    "https://example.com/online-cover.jpg",
  );
  assert.equal(reservations[0].episodeCount, 18);
  assert.equal(reservations[0].summary, "已上线预约简介");
});

test("account payload parsers deduplicate by official series", () => {
  const favorites = parseFavoritesPayload({
    data: {
      video_shelf_info: [
        {
          series_title: "旧标题",
          collect_time: 1_700_000_000,
          video_data: { series_id: SERIES_ID },
        },
        {
          series_title: "新标题",
          collect_time: 1_700_000_100,
          video_data: { series_id: SERIES_ID },
        },
      ],
    },
  });
  assert.equal(favorites.length, 1);
  assert.equal(favorites[0].title, "旧标题");

  const history = parseHistoryPayload({
    data: {
      video_data: [
        {
          series_id: SERIES_ID,
          vid_index: 1,
          last_watch_time: 1_700_000_000,
        },
        {
          series_id: SERIES_ID,
          vid_index: 8,
          last_watch_time: 1_700_000_100,
        },
      ],
    },
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].progressEpisode, 1);
});

test("upcoming reservations without a series ID remain non-importable", () => {
  const upcoming = parseReservationsPayload(
    {
      data: {
        subscribe_items: [
          {
            item_id: "7300000000000000001",
            item_name: "待上线短剧",
            expected_rec_text: "预计下周上线",
          },
        ],
      },
    },
    { online: false },
  );

  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].seriesId, null);
  assert.equal(upcoming[0].importable, false);
  assert.match(upcoming[0].note, /暂时不能加入追更/);
});

test("account session vault encrypts credentials and rejects tampering", async (t) => {
  const dataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "drama-account-vault-"),
  );
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

  const vault = new AccountSessionVault({ dataDir });
  await vault.initialize();
  const credentials = {
    version: 1,
    cookieHeader: "sessionid=super-secret; device_id=secret-device",
    deviceId: "7100000000000011",
    installId: "7100000000000012",
    identity: {
      cdid: "123e4567-e89b-12d3-a456-426614174000",
      openudid: "openid",
      clientudid: "clientid",
      oaid: "",
      reqId: "request-id",
    },
    profile: {
      id: PROFILE_ID,
      name: "测试用户",
    },
    savedAt: "2026-10-31T08:00:00.000Z",
  };

  await vault.save(credentials);
  const loaded = await vault.load();
  assert.deepEqual(loaded, credentials);

  const sessionBytes = await fs.readFile(vault.sessionPath);
  assert.equal(
    sessionBytes.includes(Buffer.from("super-secret")),
    false,
  );
  assert.equal(
    sessionBytes.includes(Buffer.from("7100000000000011")),
    false,
  );
  for (const filePath of [vault.sessionPath, vault.keyPath]) {
    const stat = await fs.stat(filePath);
    assert.equal(stat.mode & 0o777, 0o600);
  }

  sessionBytes[sessionBytes.length - 1] ^= 0xff;
  await fs.writeFile(vault.sessionPath, sessionBytes);
  await assert.rejects(
    () => vault.load(),
    (error) => {
      assert.equal(error.code, "ACCOUNT_SESSION_INVALID");
      return true;
    },
  );
});

test("expired QR sessions stop returning image data", async () => {
  const now = 1_700_000_000_000;
  const service = new AccountService({
    now: () => now,
    vault: {},
  });
  service.loginSessions.set("expired-login", {
    id: "expired-login",
    status: "pending",
    token: "secret-token",
    qrBuffer: Buffer.from("fake-png"),
    expiresAt: now - 1,
    error: "",
    pollPromise: null,
    jar: null,
  });

  assertAccountError(
    () => service.getLoginQr("expired-login"),
    "ACCOUNT_QR_EXPIRED",
  );
  const login = await service.pollLogin("expired-login");
  assert.equal(login.status, "expired");
  assert.equal(service.loginSessions.get("expired-login").token, "");
});

function smsReply(payload, cookies = []) {
  return { payload, cookies };
}

function smsReplyAt(replies, index) {
  if (!Array.isArray(replies)) {
    return replies;
  }
  return replies[Math.min(index, replies.length - 1)];
}

function smsLoginService({
  now = () => 1_700_000_000_000,
  sendReplies = smsReply({
    data: { retry_time: 60 },
    message: "success",
  }),
  loginReplies = smsReply(
    { data: {}, message: "success" },
    ["sessionid=sms-session-secret; Path=/; Secure; Max-Age=300"],
  ),
  verifyReplies = smsReply({
    data: { passport_mfa_retry_tag: "mock-retry-tag" },
    message: "success",
  }),
  backgroundCompletesImmediately = true,
} = {}) {
  const requests = [];
  let sendIndex = 0;
  let loginIndex = 0;
  let verifyIndex = 0;
  let registrationCount = 0;
  const responseForReply = (reply) => {
    const headers = new Headers({
      "content-type": "application/json",
    });
    for (const cookie of reply.cookies || []) {
      headers.append("set-cookie", cookie);
    }
    return new Response(JSON.stringify(reply.payload), {
      status: 200,
      headers,
    });
  };
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    const body = String(options.body || "");
    requests.push({
      url: target,
      method: options.method || "GET",
      headers: new Headers(options.headers || {}),
      body,
      form: body ? new URLSearchParams(body) : null,
    });
    if (target.includes("/passport/mobile/send_code/v1/")) {
      return responseForReply(smsReplyAt(sendReplies, sendIndex++));
    }
    if (target.includes("/passport/mobile/sms_login/")) {
      return responseForReply(smsReplyAt(loginReplies, loginIndex++));
    }
    if (target.includes("/passport/upsms/verify/")) {
      return responseForReply(smsReplyAt(verifyReplies, verifyIndex++));
    }
    throw new Error(`Unexpected request: ${target}`);
  };
  const service = new AccountService({
    now,
    vault: {},
    fetchImpl,
  });
  service.registerDevice = async () => {
    registrationCount += 1;
    return {
      deviceId: "7100000000000011",
      installId: "7100000000000012",
      identity: {
        cdid: "123e4567-e89b-12d3-a456-426614174000",
        openudid: "openid",
        clientudid: "clientid",
        oaid: "",
        reqId: "request-id",
      },
      cookies: {
        install_id: "7100000000000012",
        device_id: "7100000000000011",
        passport_csrf_token_default: "csrf-secret",
      },
    };
  };
  service.completeLoginInBackground = async (session) => {
    if (!backgroundCompletesImmediately) {
      return new Promise(() => {});
    }
    session.status = "succeeded";
    session.completedAt = now();
    session.jar = null;
    session.completionPromise = null;
  };
  return {
    service,
    requests,
    registrationCount: () => registrationCount,
    sendRequests: () =>
      requests.filter((request) =>
        request.url.includes("/passport/mobile/send_code/v1/"),
      ),
    loginRequests: () =>
      requests.filter((request) =>
        request.url.includes("/passport/mobile/sms_login/"),
      ),
    verifyRequests: () =>
      requests.filter((request) =>
        request.url.includes("/passport/upsms/verify/"),
      ),
  };
}

test("SMS login uses the app passport and reuses the registered device", async () => {
  const { service, requests, registrationCount } = smsLoginService({
    backgroundCompletesImmediately: false,
  });
  const session = await service.createSmsLogin({
    countryCode: "86",
    mobile: "138 0013 8000",
  });
  assert.equal(session.status, "pending_code");
  assert.equal(session.maskedMobile, "*******8000");
  assert.equal(
    JSON.stringify(session).includes("13800138000"),
    false,
  );
  assert.equal(
    JSON.stringify(session).includes("csrf-secret"),
    false,
  );
  assert.equal(registrationCount(), 1);

  const sent = await service.sendSmsCode(session.loginId);
  assert.equal(sent.status, "pending_verify");
  assert.equal(sent.retryAfterSeconds, 60);
  const sendRequest = requests[0];
  assert.equal(sendRequest.method, "GET");
  const sendUrl = new URL(sendRequest.url);
  assert.match(sendUrl.pathname, /\/passport\/mobile\/send_code\/v1\/$/);
  assert.equal(sendUrl.searchParams.get("mobile"), "13800138000");
  assert.equal(sendUrl.searchParams.get("type"), "24");
  assert.match(
    sendRequest.headers.get("cookie") || "",
    /device_id=7100000000000011/,
  );
  assert.match(
    sendRequest.headers.get("cookie") || "",
    /passport_csrf_token_default=csrf-secret/,
  );

  const verified = await service.verifySmsCode(
    session.loginId,
    "123456",
  );
  assert.equal(verified.status, "profile_loading");
  const loginRequest = requests[1];
  assert.equal(loginRequest.method, "POST");
  assert.match(loginRequest.url, /\/passport\/mobile\/sms_login\//);
  assert.equal(loginRequest.form.get("account_sdk_source"), "app");
  assert.equal(
    loginRequest.form.get("passport_support_flow"),
    "captcha,verify",
  );
  assert.equal(loginRequest.form.get("mix_mode"), "1");
  assert.equal(loginRequest.form.get("mobile"), "13800138000");
  assert.equal(loginRequest.form.get("code"), "123456");
  assert.equal(loginRequest.form.has("type"), false);
  assert.equal(loginRequest.form.has("mobile_ticket"), false);
  assert.equal(registrationCount(), 1);

  const status = service.pollSmsLogin(session.loginId);
  assert.equal(status.status, "profile_loading");
  assert.doesNotMatch(
    JSON.stringify(status),
    /13800138000|123456|sms-session-secret|csrf-secret/i,
  );
});

test("SMS login allows resend after cooldown and resets code attempts", async () => {
  let now = 1_700_000_000_000;
  const { service, sendRequests } = smsLoginService({ now: () => now });
  const session = await service.createSmsLogin({
    countryCode: "86",
    mobile: "13800138000",
  });
  await service.sendSmsCode(session.loginId);
  await assert.rejects(
    () => service.sendSmsCode(session.loginId),
    (error) => {
      assert.equal(error.code, "ACCOUNT_SMS_CODE_RATE_LIMITED");
      assert.equal(error.retryAfterSeconds, 60);
      return true;
    },
  );
  now += 60_000;
  const resent = await service.sendSmsCode(session.loginId);
  assert.equal(resent.retryAfterSeconds, 60);
  assert.equal(sendRequests().length, 2);
});

test("SMS login rejects invalid codes, locks after five attempts and cancels", async () => {
  const { service, loginRequests, verifyRequests } = smsLoginService({
    loginReplies: smsReply({
      data: { description: "验证码错误" },
      message: "error",
    }),
  });
  const session = await service.createSmsLogin({
    countryCode: "86",
    mobile: "13800138000",
  });
  await service.sendSmsCode(session.loginId);
  await assert.rejects(
    () => service.verifySmsCode(session.loginId, "12ab"),
    (error) => {
      assert.equal(error.code, "ACCOUNT_SMS_CODE_INVALID_FORMAT");
      return true;
    },
  );
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await assert.rejects(
      () => service.verifySmsCode(session.loginId, "123456"),
      (error) => {
        assert.equal(error.code, "ACCOUNT_SMS_CODE_INVALID");
        return true;
      },
    );
  }
  await assert.rejects(
    () => service.verifySmsCode(session.loginId, "123456"),
    (error) => {
      assert.equal(error.code, "ACCOUNT_SMS_CODE_ATTEMPTS_EXCEEDED");
      return true;
    },
  );
  assert.equal(
    service.pollSmsLogin(session.loginId).status,
    "failed",
  );
  assert.equal(loginRequests().length, 5);
  assert.equal(verifyRequests().length, 0);
  const failedSession = service.smsLoginSessions.get(session.loginId);
  assert.equal(failedSession.mobile, "");
  assert.equal(failedSession.mobileTicket, "");
  assert.equal(failedSession.registration, null);
  assert.equal(failedSession.jar, null);

  const canceled = await service.cancelSmsLogin(session.loginId);
  assert.deepEqual(canceled, { canceled: true });
  assert.equal(
    service.pollSmsLogin(session.loginId).status,
    "expired",
  );
});

test("SMS login reports official security verification as a fallback", async () => {
  const { service } = smsLoginService({
    sendReplies: smsReply({
      data: {
        verify_center_decision_conf: "{\"decision\":\"verify\"}",
      },
    }),
  });
  const session = await service.createSmsLogin({
    countryCode: "86",
    mobile: "13800138000",
  });
  await assert.rejects(
    () => service.sendSmsCode(session.loginId),
    (error) => {
      assert.equal(error.code, "ACCOUNT_SMS_VERIFICATION_REQUIRED");
      assert.match(error.message, /扫码登录/);
      return true;
    },
  );
});

test("SMS login completes official MFA and retries with the MFA tag", async () => {
  const mfaFields = {
    encrypt_uid: "encrypted-user",
    sms_code_key: "sms-key",
    verify_ticket: "verify-ticket",
    verify_scene: "sms_login",
    verify_reason: "ato",
    copywriting_key: "sms_login",
    ies_safety_diversion_tag: "mfa",
    new_authn_sdk_version: "1.1.31",
    new_authn_sdk_log_id: "auth-log-id",
    request_tag_from: "h5",
    biz_params: { source: "sms" },
    event_params: { event: "verify" },
  };
  const { service, loginRequests, verifyRequests, registrationCount } =
    smsLoginService({
      backgroundCompletesImmediately: false,
      loginReplies: [
        smsReply({
          data: {
            upsms_verify: JSON.stringify(mfaFields),
          },
          message: "success",
        }),
        smsReply(
          { data: {}, message: "success" },
          ["sessionid=mfa-session-secret; Path=/; Secure; Max-Age=300"],
        ),
      ],
      verifyReplies: smsReply({
        data: { passport_mfa_retry_tag: "mfa-retry-tag" },
        message: "success",
      }),
    });
  const session = await service.createSmsLogin({
    countryCode: "86",
    mobile: "13800138000",
  });
  await service.sendSmsCode(session.loginId);
  const verified = await service.verifySmsCode(session.loginId, "123456");

  assert.equal(verified.status, "profile_loading");
  assert.equal(loginRequests().length, 2);
  assert.equal(verifyRequests().length, 1);
  assert.equal(registrationCount(), 1);

  const verifyRequest = verifyRequests()[0];
  assert.equal(verifyRequest.method, "POST");
  assert.equal(verifyRequest.form.get("encrypt_uid"), "encrypted-user");
  assert.equal(verifyRequest.form.get("sms_code_key"), "sms-key");
  assert.equal(verifyRequest.form.get("verify_ticket"), "verify-ticket");
  assert.equal(verifyRequest.form.get("verify_scene"), "sms_login");
  assert.equal(verifyRequest.form.get("verify_reason"), "ato");
  assert.equal(verifyRequest.form.get("copywriting_key"), "sms_login");
  assert.equal(
    verifyRequest.form.get("ies_safety_diversion_tag"),
    "mfa",
  );
  assert.equal(verifyRequest.form.get("new_verify_flow"), "");
  assert.equal(
    verifyRequest.form.get("new_authn_sdk_version"),
    "1.1.31",
  );
  assert.equal(
    verifyRequest.form.get("new_authn_sdk_verify_reason"),
    "ato",
  );
  assert.equal(
    verifyRequest.form.get("new_authn_sdk_verify_scene"),
    "sms_login",
  );
  assert.equal(verifyRequest.form.get("request_tag_from"), "h5");
  assert.equal(
    verifyRequest.form.get("new_authn_sdk_log_id"),
    "auth-log-id",
  );
  assert.deepEqual(
    JSON.parse(verifyRequest.form.get("biz_params")),
    { source: "sms" },
  );
  assert.deepEqual(
    JSON.parse(verifyRequest.form.get("event_params")),
    { event: "verify" },
  );

  const retryRequest = loginRequests()[1];
  assert.equal(
    retryRequest.form.get("passport_mfa_retry_tag"),
    "mfa-retry-tag",
  );
  assert.doesNotMatch(
    JSON.stringify(service.pollSmsLogin(session.loginId)),
    /encrypted-user|sms-key|verify-ticket|auth-log-id|mfa-retry-tag|mfa-session-secret/i,
  );
});

test("SMS login offers QR fallback for an MFA challenge it cannot complete", async () => {
  const { service, verifyRequests } = smsLoginService({
    loginReplies: smsReply({
      data: {
        upsms_verify: JSON.stringify({
          verify_scene: "sms_login",
        }),
      },
      message: "success",
    }),
  });
  const session = await service.createSmsLogin({
    countryCode: "86",
    mobile: "13800138000",
  });
  await service.sendSmsCode(session.loginId);
  await assert.rejects(
    () => service.verifySmsCode(session.loginId, "123456"),
    (error) => {
      assert.equal(error.code, "ACCOUNT_SMS_VERIFICATION_REQUIRED");
      assert.match(error.message, /扫码登录/);
      return true;
    },
  );
  assert.equal(verifyRequests().length, 0);
});

test("account login treats official QR expiry as a millisecond duration", async () => {
  const now = 1_793_000_000_000;
  const qrBytes = Buffer.from(
    "test QR image payload that is longer than thirty-two bytes",
  );
  const service = new AccountService({
    now: () => now,
    vault: {},
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          data: {
            token: "login-token",
            qrcode: qrBytes.toString("base64"),
            expire_time: 1_771_801_371,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
  });

  const login = await service.createLogin();
  assert.equal(
    login.expiresAt,
    new Date(now + 10 * 60_000).toISOString(),
  );
  assert.deepEqual(
    service.getLoginQr(login.loginId),
    qrBytes,
  );
});

test("public account status omits credentials and private identity", () => {
  const service = new AccountService({ vault: {} });
  service.credentials = {
    cookieHeader: "sessionid=super-secret",
    deviceId: "private-device-id",
    installId: "private-install-id",
    identity: {
      cdid: "private-cdid",
      openudid: "private-openudid",
      clientudid: "private-clientudid",
      oaid: "private-oaid",
      reqId: "private-request-id",
    },
    profile: {
      id: PROFILE_ID,
      name: "测试用户",
    },
    savedAt: "2026-10-31T08:00:00.000Z",
  };
  service.snapshot = {
    profile: {
      id: PROFILE_ID,
      name: "测试用户",
    },
    fetchedAt: "2026-10-31T08:01:00.000Z",
    categories: {
      favorites: {
        key: "favorites",
        status: "ok",
        items: [{ seriesId: SERIES_ID, title: "收藏短剧" }],
        count: 1,
        fetchedAt: "2026-10-31T08:01:00.000Z",
      },
    },
  };

  const status = service.status();
  assert.equal(status.profile.name, "测试用户");
  assert.equal(status.profile.id, undefined);
  assert.equal(status.snapshot.profile.id, undefined);
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(
    serialized,
    /super-secret|private-device|private-install|private-cdid|private-request|signature/i,
  );
  assert.equal(
    status.snapshot.categories.favorites.items[0].seriesId,
    SERIES_ID,
  );
});
