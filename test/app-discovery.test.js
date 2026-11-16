import assert from "node:assert/strict";
import test from "node:test";
import {
  AppDiscoveryService,
  __test,
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
} from "../src/app-discovery.js";

function discoveryPayload({
  items = [],
  groups = null,
  hasMore = false,
  nextOffset = 0,
  sessionId = "",
} = {}) {
  return {
    code: 0,
    data: {
      selector_rows:
        groups === null
          ? [
              {
                type: "genre",
                items: [
                  {
                    selector_item_id: "short_play",
                    show_name: "真人剧",
                  },
                  {
                    selector_item_id: "comic_series",
                    show_name: "漫剧",
                  },
                ],
              },
              {
                type: "category_dim_role",
                items: [
                  {
                    selector_item_id: "cate_36",
                    show_name: "重生",
                  },
                ],
              },
            ]
          : groups,
      video_data: items,
      has_more: hasMore,
      next_offset: nextOffset,
      session_id: sessionId,
    },
  };
}

function rawItem(seriesId, overrides = {}) {
  return {
    series_id: seriesId,
    title: `作品 ${seriesId}`,
    cover: `https://example.com/${seriesId}.jpg`,
    video_desc: "简介",
    episode_cnt: 20,
    category_schema: JSON.stringify([
      { name: "剧情" },
      { name: "逆袭" },
    ]),
    ...overrides,
  };
}

function createService(responses, overrides = {}) {
  const calls = [];
  const queue = [...responses];
  const service = new AppDiscoveryService({
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      const next = queue.shift();
      if (next instanceof Error) {
        throw next;
      }
      return new Response(JSON.stringify(next.body), {
        status: next.status || 200,
        headers: { "content-type": "application/json" },
      });
    },
    signer: ({ body }) => ({
      query: "version_code=73532&signature=test",
      headers: {
        "x-test-body": body,
      },
    }),
    identity: {
      versionName: "7.1.8",
      deviceId: "device-test",
    },
    pairs: [["key", "value"]],
    userAgent: () => "test-agent",
    now: () => Date.parse("2026-11-15T08:00:00.000Z"),
    ...overrides,
  });
  return { service, calls };
}

test("AppDiscoveryService sends the official first-page filters and signature", async () => {
  const { service, calls } = createService([
    {
      body: discoveryPayload({
        items: [rawItem("7694653385668037657")],
      }),
    },
  ]);

  const result = await service.getDiscovery({
    selection: {
      genre: "short_play",
      category_dim_role: "cate_36",
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].input,
    `${__test.DISCOVERY_ORIGIN}${__test.DISCOVERY_PATH}?version_code=73532&signature=test`,
  );
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["user-agent"], "test-agent");
  assert.equal(
    calls[0].init.headers["x-test-body"],
    calls[0].init.body,
  );

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.offset, 0);
  assert.equal(body.limit, 24);
  assert.equal(body.need_selector_panel, true);
  assert.equal(body.req_type, "default");
  assert.equal(body.client_req_type, 3);
  assert.equal(body.session_id, "");
  assert.deepEqual(body.select_items.genre, ["short_play"]);
  assert.deepEqual(body.select_items.category_dim_role, ["cate_36"]);
  assert.deepEqual(body.select_items.category_dim_theme, []);
  assert.equal(body.req_scene, "default");

  assert.equal(result.ok, true);
  assert.equal(result.fetchedAt, "2026-11-15T08:00:00.000Z");
  assert.equal(result.items[0].seriesId, "7694653385668037657");
  assert.equal(result.items[0].episodeCount, 20);
  assert.deepEqual(result.items[0].tags, ["剧情", "逆袭"]);
  assert.equal(result.groups[0].type, "genre");
  assert.equal(result.groups[1].label, "设定");
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
});

test("discovery covers replace signed HEIC URLs with browser-safe JPEG URLs", () => {
  const coverUrl =
    "https://p3-reading-sign.fqnovelpic.com/novel-pic/6e92f1530a5949623015e5539022f1b1~tplv-81nmtwyey9-superreso-aifit:400:0.heic?lk3s=test&x-signature=test";
  const item = __test.normalizeDiscoveryItem(
    rawItem("7694653385668037657", { cover: coverUrl }),
  );

  assert.equal(
    item.coverUrl,
    "https://p3-novel.byteimg.com/novel-pic/6e92f1530a5949623015e5539022f1b1~tplv-shrink:400:0.image",
  );
  assert.equal(
    __test.renderableCoverUrl(
      "https://p3-reading-sign.fqnovelpic.com.evil.example/novel-pic/6e92f1530a5949623015e5539022f1b1~tplv-test.heic",
    ),
    "https://p3-reading-sign.fqnovelpic.com.evil.example/novel-pic/6e92f1530a5949623015e5539022f1b1~tplv-test.heic",
  );
  assert.equal(
    __test.renderableCoverUrl(
      "http://p3-reading-sign.fqnovelpic.com/novel-pic/6e92f1530a5949623015e5539022f1b1~tplv-test.heic",
    ),
    "",
  );
});

test("AppDiscoveryService carries the server cursor into only-content requests", async () => {
  const { service, calls } = createService([
    {
      body: discoveryPayload({
        items: [rawItem("7694653385668037657")],
        hasMore: true,
        nextOffset: 24,
        sessionId: "session-test",
      }),
    },
    {
      body: discoveryPayload({
        items: [rawItem("7694653385668037658")],
        groups: [],
      }),
    },
  ]);

  const first = await service.getDiscovery({
    selection: { genre: "comic_series" },
  });
  assert.ok(first.nextCursor);
  assert.deepEqual(decodeDiscoveryCursor(first.nextCursor), {
    offset: 24,
    page: 2,
    session: "session-test",
  });

  const second = await service.getDiscovery({
    selection: { genre: "comic_series" },
    cursor: first.nextCursor,
  });

  const body = JSON.parse(calls[1].init.body);
  assert.equal(body.offset, 24);
  assert.equal(body.need_selector_panel, false);
  assert.equal(body.req_type, "only_content");
  assert.equal(body.session_id, "session-test");
  assert.equal(body.req_scene, "comic_series");
  assert.deepEqual(body.select_items.genre, ["comic_series"]);
  assert.equal(second.items[0].seriesId, "7694653385668037658");
});

test("AppDiscoveryService rejects invalid filters and overlong cursors before fetching", async () => {
  const { service, calls } = createService([]);

  await assert.rejects(
    service.getDiscovery({ selection: { unknown: "value" } }),
    (error) => error.code === "INVALID_DISCOVERY_SELECTION",
  );
  await assert.rejects(
    service.getDiscovery({ selection: { genre: "../bad" } }),
    (error) => error.code === "INVALID_DISCOVERY_SELECTION",
  );
  await assert.rejects(
    service.getDiscovery({ cursor: "a".repeat(9000) }),
    (error) => error.code === "INVALID_DISCOVERY_CURSOR",
  );
  assert.equal(calls.length, 0);
});

test("AppDiscoveryService deduplicates malformed and non-HTTPS cover items", async () => {
  const { service } = createService([
    {
      body: discoveryPayload({
        items: [
          rawItem("7694653385668037657", {
            cover: "http://insecure.example/cover.jpg",
          }),
          rawItem("7694653385668037657", {
            cover: "https://example.com/second.jpg",
          }),
          rawItem("bad-id"),
          rawItem("7694653385668037658", {
            title: "",
          }),
        ],
      }),
    },
  ]);

  const result = await service.getDiscovery();
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].seriesId, "7694653385668037657");
  assert.equal(result.items[0].coverUrl, "");
});

test("AppDiscoveryService reports upstream and malformed payload failures", async () => {
  const upstream = createService([
    {
      status: 429,
      body: { code: 0, data: {} },
    },
  ]).service;
  await assert.rejects(
    upstream.getDiscovery(),
    (error) =>
      error.code === "DISCOVERY_RATE_LIMITED" &&
      error.statusCode === 429,
  );

  const malformed = createService([
    {
      body: {
        code: 0,
        data: {
          selector_rows: [
            {
              type: "genre",
              items: [],
            },
          ],
        },
      },
    },
  ]).service;
  await assert.rejects(
    malformed.getDiscovery(),
    (error) =>
      error.code === "DISCOVERY_DATA_INVALID" &&
      error.statusCode === 502,
  );
});

test("AppDiscoveryService rejects invalid continuation metadata", async () => {
  const { service } = createService([
    {
      body: discoveryPayload({
        items: [rawItem("7694653385668037657")],
        hasMore: true,
        nextOffset: 0,
        sessionId: "",
      }),
    },
  ]);

  await assert.rejects(
    service.getDiscovery(),
    (error) =>
      error.code === "DISCOVERY_CURSOR_INVALID" &&
      error.statusCode === 502,
  );
});

test("discovery cursor round-trips without exposing the upstream session", () => {
  const cursor = encodeDiscoveryCursor({
    offset: 96,
    page: 5,
    session: "upstream-session",
  });
  assert.doesNotMatch(cursor, /upstream-session/);
  assert.deepEqual(decodeDiscoveryCursor(cursor), {
    offset: 96,
    page: 5,
    session: "upstream-session",
  });
});
