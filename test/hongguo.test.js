import assert from "node:assert/strict";
import test from "node:test";
import {
  HongguoError,
  decodeHtmlEntities,
  extractBalancedJson,
  extractAnimationSeriesId,
  extractRecommendations,
  extractSeriesId,
  fetchAlbumSeriesInfo,
  fetchAlbumSeriesInfoBatch,
  fetchAlbumSeriesIds,
  fetchOfficialRanking,
  fetchOfficialRankings,
  fetchOfficialSeriesMeta,
  fetchSeriesProgressBatch,
  fetchSeriesDetail,
  isAllowedShareHost,
  parseOfficialSearchResults,
  parseOfficialRankingPage,
  parseOfficialRankings,
  parseOfficialSeriesMeta,
  parseSeriesDetailHtml,
  resolveOfficialRankingPath,
  resolveSharedSeries,
  searchOfficialSeries,
  __test,
} from "../src/hongguo.js";

function detailHtml(overrides = {}) {
  const series = {
    series_id: "7694653385668037657",
    series_name: "测试短剧",
    series_cover: "https://example.com/cover.jpg",
    series_intro: "简介",
    tags: ["喜剧"],
    episode_cnt: 12,
    accessible_episode_cnt: 4,
    series_status: 0,
    first_visible_time: 1_760_000_000,
    episode_right_text: "更新至12集",
    season_info: {
      series_group_id: "7698938199183215640",
    },
    series_episode_info: {
      episode_cnt: 12,
      episode_total_cnt: 24,
    },
    ...overrides,
  };
  const routerData = {
    loaderData: {
      detail_page: {
        isSuccess: true,
        seriesDetail: series,
      },
    },
  };
  return `<script>window._ROUTER_DATA = ${JSON.stringify(
    routerData,
  )};</script>`;
}

function seriesMetaPayload(overrides = {}) {
  const seriesId = "7694653385668037657";
  return {
    code: 0,
    data: {
      [seriesId]: {
        video_data: {
          series_id_str: seriesId,
          series_status: 0,
          episode_cnt: 55,
          episode_total_cnt: 55,
          episode_right_text: "更新至55集",
          update_info: {
            show_update_frequency: "每周二00:10更新10集",
            update_tag_text: "连载",
          },
          ...overrides,
        },
      },
    },
  };
}

test("extractSeriesId recognizes share text, IDs and official URLs", () => {
  assert.equal(extractSeriesId("7694653385668037657"), "7694653385668037657");
  assert.equal(
    extractSeriesId("https://hongguoduanju.com/detail?series_id=7694653385668037657"),
    "7694653385668037657",
  );
  assert.equal(
    extractSeriesId(
      "去看看《测试》 https://v.hongguoduanju.com/abc 复制此链接",
    ),
    null,
  );
  assert.equal(
    extractSeriesId("https%3A%2F%2Fhongguoduanju.com%2Fdetail%3Fseries_id%3D7694653385668037657"),
    "7694653385668037657",
  );
});

test("extractAnimationSeriesId only accepts video_id on animation share pages", () => {
  assert.equal(
    extractAnimationSeriesId(
      "https://novelquickapp.com/hongguo/ug/pages/video-animation-share?video_id=7645616042022014014&vid=7645617907740724286",
    ),
    "7645616042022014014",
  );
  assert.equal(
    extractAnimationSeriesId(
      "https://novelquickapp.com/other?video_id=7645616042022014014",
    ),
    null,
  );
  assert.equal(
    extractAnimationSeriesId(
      "https://novelquickapp.com/hongguo/ug/pages/video-animation-share?vid=7645616042022014014",
    ),
    null,
  );
});

test("host allowlist only matches exact host or subdomain", () => {
  assert.equal(isAllowedShareHost("v.hongguoduanju.com"), true);
  assert.equal(isAllowedShareHost("hongguoduanju.com"), true);
  assert.equal(isAllowedShareHost("evilhongguoduanju.com"), false);
  assert.equal(isAllowedShareHost("hongguoduanju.com.evil.test"), false);
});

test("balanced SSR extraction ignores braces inside JSON strings", () => {
  const value = {
    text: "这里包含 } { 和转义引号 \\\"",
    nested: { series_id: "12345678" },
  };
  const html = `<script>window._ROUTER_DATA = ${JSON.stringify(value)};</script>`;
  assert.deepEqual(extractBalancedJson(html, "_ROUTER_DATA"), value);
  assert.equal(decodeHtmlEntities("A &amp; B &quot;C&quot; &#22909;"), "A & B \"C\" 好");
});

test("parseSeriesDetailHtml normalizes group, status and episode fields", () => {
  const detail = parseSeriesDetailHtml(detailHtml());
  assert.equal(detail.seriesId, "7694653385668037657");
  assert.equal(detail.seriesGroupId, "7698938199183215640");
  assert.equal(detail.title, "测试短剧");
  assert.equal(detail.episodeCount, 12);
  assert.equal(detail.totalEpisodeCount, 24);
  assert.equal(detail.accessibleEpisodeCount, 4);
  assert.equal(detail.status, "updating");
  assert.equal(detail.rightText, "更新至12集");
});

test("parseOfficialSeriesMeta reads the official update schedule", () => {
  const meta = parseOfficialSeriesMeta(
    seriesMetaPayload(),
    "7694653385668037657",
  );

  assert.equal(meta.seriesId, "7694653385668037657");
  assert.equal(meta.status, "updating");
  assert.equal(meta.episodeCount, 55);
  assert.equal(meta.totalEpisodeCount, 55);
  assert.equal(meta.rightText, "更新至55集");
  assert.equal(meta.updateRule, "每周二00:10更新10集");
});

test("parseOfficialSeriesMeta reads a single video_data response", () => {
  const wrapped = seriesMetaPayload();
  const seriesId = "7694653385668037657";
  const meta = parseOfficialSeriesMeta(
    {
      code: wrapped.code,
      data: wrapped.data[seriesId].video_data,
    },
    seriesId,
  );

  assert.equal(meta.seriesId, seriesId);
  assert.equal(meta.status, "updating");
  assert.equal(meta.episodeCount, 55);
  assert.equal(meta.rightText, "更新至55集");
  assert.equal(meta.updateRule, "每周二00:10更新10集");
});

test("fetchOfficialSeriesMeta signs and parses the App detail request", async () => {
  const seriesId = "7694653385668037657";
  let requestedUrl;
  let requestedOptions;
  const meta = await fetchOfficialSeriesMeta(seriesId, {
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedOptions = options;
      return new Response(JSON.stringify(seriesMetaPayload()), {
        status: 200,
      });
    },
  });

  assert.match(
    requestedUrl,
    /^https:\/\/api5-normal-sinfonlinec\.fqnovel\.com\/novel\/player\/video_detail\/v1\/\?/,
  );
  assert.equal(requestedOptions.method, "POST");
  assert.equal(requestedOptions.credentials, "omit");
  assert.equal(requestedOptions.redirect, "error");
  assert.match(requestedOptions.body, /"series_id":"7694653385668037657"/);
  assert.match(requestedOptions.headers["x-gorgon"], /^[a-f0-9]+$/i);
  assert.equal(meta.updateRule, "每周二00:10更新10集");
});

test("fetchSeriesDetail merges App metadata without treating a full count as completed", async () => {
  const seriesId = "7694653385668037657";
  const result = await fetchSeriesDetail(seriesId, {
    fetchImpl: async (url) => {
      if (String(url).includes("video_detail/v1")) {
        return new Response(JSON.stringify(seriesMetaPayload()), {
          status: 200,
        });
      }
      return new Response(
        detailHtml({
          episode_cnt: 55,
          episode_right_text: "全55集",
          series_episode_info: {
            episode_cnt: 55,
            episode_total_cnt: 55,
          },
        }),
        { status: 200 },
      );
    },
  });

  assert.equal(result.detail.status, "updating");
  assert.equal(result.detail.rightText, "更新至55集");
  assert.equal(result.detail.updateRule, "每周二00:10更新10集");
  assert.equal(result.detail.updateRuleResolved, true);
});

test("extractRecommendations decodes nested recommendation JSON", () => {
  const payload = JSON.stringify([
    {
      series_id: "7694653385668037658",
      series_name: "推荐剧",
      series_cover: "https://example.com/next.jpg",
      episode_cnt: 20,
    },
  ]);
  const html = `<div data-fn-name="mergeLoaderData" data-fn-args="${payload
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")}"></div>`;
  assert.deepEqual(extractRecommendations(html), [
    {
      seriesId: "7694653385668037658",
      title: "推荐剧",
      coverUrl: "https://example.com/next.jpg",
      episodeCount: 20,
    },
  ]);
});

test("resolveSharedSeries follows an allowlisted short-link redirect", async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes("v.hongguoduanju.com")) {
      return new Response(null, {
        status: 302,
        headers: {
          location:
            "https://hongguoduanju.com/detail?series_id=7694653385668037657",
        },
      });
    }
    return new Response(detailHtml(), { status: 200 });
  };

  const result = await resolveSharedSeries(
    "分享你一个短剧 https://v.hongguoduanju.com/abc",
    { fetchImpl },
  );
  assert.equal(result.seriesId, "7694653385668037657");
  assert.equal(requested.length, 2);
});

test("resolveSharedSeries reads video_id after an animation share redirect", async () => {
  const requested = [];
  const videoUrl =
    "https://novelquickapp.com/hongguo/ug/pages/video-animation-share?video_id=7645616042022014014&vid=7645617907740724286";
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes("/s/animation-short-link")) {
      return new Response(null, {
        status: 302,
        headers: { location: videoUrl },
      });
    }
    return new Response("animation landing page", { status: 200 });
  };

  const result = await resolveSharedSeries(
    "漫剧分享 https://novelquickapp.com/s/animation-short-link",
    { fetchImpl },
  );
  assert.equal(result.seriesId, "7645616042022014014");
  assert.equal(result.sharedUrl, videoUrl);
  assert.equal(requested.length, 2);
});

test("resolveSharedSeries reads video_id from a direct animation share URL", async () => {
  let called = false;
  const result = await resolveSharedSeries(
    "https://novelquickapp.com/hongguo/ug/pages/video-animation-share?video_id=7645616042022014014&vid=7645617907740724286",
    {
      fetchImpl: async () => {
        called = true;
        return new Response("unexpected", { status: 200 });
      },
    },
  );

  assert.equal(result.seriesId, "7645616042022014014");
  assert.equal(called, false);
});

test("resolveSharedSeries does not treat arbitrary video_id values as series IDs", async () => {
  await assert.rejects(
    resolveSharedSeries(
      "https://novelquickapp.com/other?video_id=7645616042022014014",
      {
        fetchImpl: async () =>
          new Response(
            "https://novelquickapp.com/hongguo/ug/pages/video-animation-share?vid=7645617907740724286",
            { status: 200 },
          ),
      },
    ),
    (error) =>
      error instanceof HongguoError && error.code === "SERIES_ID_NOT_FOUND",
  );
});

test("resolveSharedSeries rejects non-official hosts before fetching", async () => {
  let called = false;
  await assert.rejects(
    resolveSharedSeries("https://example.com/detail?series_id=7694653385668037657", {
      fetchImpl: async () => {
        called = true;
      },
    }),
    (error) =>
      error instanceof HongguoError && error.code === "HOST_NOT_ALLOWED",
  );
  assert.equal(called, false);
});

test("404 responses become a readable upstream error", async () => {
  await assert.rejects(
    fetchSeriesDetail("7694653385668037657", {
      fetchImpl: async () => new Response("missing", { status: 404 }),
    }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "UPSTREAM_HTTP_ERROR" &&
      error.message.includes("不存在"),
  );
});

test("request timeout is aborted and returned as a 504", async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  await assert.rejects(
    __test.fetchWithSafeRedirects("https://hongguoduanju.com/detail", {
      fetchImpl,
      timeoutMs: 5,
    }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "REQUEST_TIMEOUT" &&
      error.statusCode === 504,
  );
});

test("fetchAlbumSeriesIds uses exact string IDs and skips subscription shells", async () => {
  const seriesId = "7645616042022014014";
  const firstId = "7621200213801176126";
  const latestPublishedId = "7690163276214176792";
  const upcomingId = "7691518344146455576";
  let requestedUrl;
  let requestedOptions;

  const fetchImpl = async (url, options) => {
    requestedUrl = String(url);
    requestedOptions = options;
    const body = `{"code":0,"data":{"${seriesId}":{"album_info":{"album_id":7624475539960499262,"album_serial_count":14,"album_series_item":[{"is_subscribe_shell":false,"item_id":"${firstId}"},{"is_subscribe_shell":false,"item_id":"${firstId}"},{"is_subscribe_shell":false,"item_id":"${latestPublishedId}"},{"is_subscribe_shell":true,"item_id":"${upcomingId}","season_index":4,"series_cover":"https://example.com/upcoming.jpg"}]}}}}`;
    return new Response(body, { status: 200 });
  };

  const ids = await fetchAlbumSeriesIds(seriesId, { fetchImpl });
  assert.deepEqual(ids, [firstId, latestPublishedId]);
  assert.equal(
    requestedUrl,
    "https://api5-normal-sinfonlineb.fqnovel.com/reading/distribution/book_pack_fields/inner_feed_detail/v1/",
  );
  assert.match(requestedOptions.body, new RegExp(`"req_ids":\\[${seriesId}\\]`));
  assert.equal(requestedOptions.credentials, "omit");
  assert.equal(requestedOptions.redirect, "error");
});

test("album discovery keeps official placeholder season details", async () => {
  const seriesId = "7645616042022014014";
  const firstId = "7621200213801176126";
  const upcomingId = "7691518344146455576";

  const album = await fetchAlbumSeriesInfo(seriesId, {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            [seriesId]: {
              album_info: {
                album_serial_count: 2,
                album_series_item: [
                  {
                    is_subscribe_shell: false,
                    item_id: firstId,
                  },
                  {
                    is_subscribe_shell: true,
                    item_id: upcomingId,
                    season_index: 2,
                    series_cover: "https://example.com/upcoming.jpg",
                  },
                ],
              },
            },
          },
        }),
        { status: 200 },
      ),
  });

  assert.deepEqual(album.unpublishedSeasons, [
    {
      seriesId: upcomingId,
      seasonIndex: 2,
      coverUrl: "https://example.com/upcoming.jpg",
    },
  ]);
});

test("fetchAlbumSeriesIds turns upstream API errors into a readable error", async () => {
  await assert.rejects(
    fetchAlbumSeriesIds("7645616042022014014", {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 200001,
            message: "有字段不支持pack album_id_str",
          }),
          { status: 200 },
        ),
    }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "ALBUM_API_ERROR" &&
      error.message.includes("album_id_str"),
  );
});

test("fetchAlbumSeriesIds marks missing album_info as retryable", async () => {
  await assert.rejects(
    fetchAlbumSeriesIds("7645616042022014014", {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              "7645616042022014014": {},
            },
          }),
          { status: 200 },
        ),
    }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "ALBUM_DATA_UNAVAILABLE" &&
      error.statusCode === 502 &&
      /稍后会自动重试/.test(error.message),
  );
});

test("fetchAlbumSeriesInfoBatch requests all series once and isolates missing albums", async () => {
  const firstId = "7645616042022014014";
  const secondId = "7690163276214176792";
  const firstSeasonId = "7621200213801176126";
  let requestBody;

  const results = await fetchAlbumSeriesInfoBatch(
    [firstId, secondId, firstId],
    {
      fetchImpl: async (_url, options) => {
        requestBody = options.body;
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              [firstId]: {
                album_info: {
                  album_serial_count: 1,
                  album_series_item: [
                    {
                      is_subscribe_shell: false,
                      item_id: firstSeasonId,
                    },
                  ],
                },
              },
              [secondId]: {},
            },
          }),
          { status: 200 },
        );
      },
    },
  );

  assert.match(
    requestBody,
    new RegExp(`"req_ids":\\[${firstId},${secondId}\\]`),
  );
  assert.deepEqual(
    results.get(firstId).album.publishedSeriesIds,
    [firstSeasonId],
  );
  assert.equal(results.get(firstId).error, null);
  assert.equal(results.get(secondId).album, null);
  assert.equal(
    results.get(secondId).error.code,
    "ALBUM_DATA_UNAVAILABLE",
  );
});

test("fetchSeriesProgressBatch returns episode and status snapshots in one request", async () => {
  const firstId = "7645616042022014014";
  const secondId = "7690163276214176792";
  let requestBody;

  const results = await fetchSeriesProgressBatch([firstId, secondId], {
    fetchImpl: async (_url, options) => {
      requestBody = options.body;
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            [firstId]: {
              base_info: {
                episode_cnt: 24,
                series_status: 0,
              },
            },
            [secondId]: {
              base_info: {
                episode_cnt: 80,
                series_status: 1,
              },
            },
          },
        }),
        { status: 200 },
      );
    },
  });

  assert.match(
    requestBody,
    new RegExp(`"req_ids":\\[${firstId},${secondId}\\]`),
  );
  assert.match(requestBody, /"episode_cnt","series_status"/);
  assert.deepEqual(results.get(firstId), {
    episodeCount: 24,
    status: "updating",
    error: null,
  });
  assert.deepEqual(results.get(secondId), {
    episodeCount: 80,
    status: "completed",
    error: null,
  });
});

test("fetchSeriesProgressBatch marks a missing snapshot for detail fallback", async () => {
  const seriesId = "7645616042022014014";
  const results = await fetchSeriesProgressBatch([seriesId], {
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            [seriesId]: {},
          },
        }),
        { status: 200 },
      ),
  });

  assert.equal(results.get(seriesId).episodeCount, null);
  assert.equal(
    results.get(seriesId).error.code,
    "SERIES_PROGRESS_UNAVAILABLE",
  );
});

test("parseOfficialSearchResults normalizes entries and removes duplicate IDs", () => {
  const results = parseOfficialSearchResults({
    searchList: [
      {
        video_data: {
          series_id: "7694653385668037657",
          series_title: "  测试短剧  ",
          episode_cnt: 12,
          series_status: 0,
          series_cover: "https://example.com/cover.jpg",
        },
      },
      {
        name: "重复标题",
        video_data: {
          series_id: "7694653385668037657",
          series_title: "重复条目",
          episode_cnt: 99,
        },
      },
      {
        video_data: {
          series_id: "not-an-id",
          series_title: "无效条目",
        },
      },
      {
        video_data: {
          series_id: "7694653385668037658",
          series_title: "另一部短剧",
          episode_cnt: "24",
          series_status: 1,
        },
      },
    ],
  });

  assert.deepEqual(results, [
    {
      seriesId: "7694653385668037657",
      title: "测试短剧",
      episodeCount: 12,
      status: "updating",
      coverUrl: "https://example.com/cover.jpg",
    },
    {
      seriesId: "7694653385668037658",
      title: "另一部短剧",
      episodeCount: 24,
      status: "completed",
      coverUrl: "",
    },
  ]);
});

test("searchOfficialSeries calls the public API without credentials", async () => {
  let requestedUrl;
  let requestedOptions;
  const response = await searchOfficialSeries("测试 短剧", {
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return new Response(
        JSON.stringify({
          searchList: [
            {
              video_data: {
                series_id: "7694653385668037657",
                series_title: "测试短剧",
                episode_cnt: 12,
                series_status: 0,
              },
            },
          ],
        }),
        { status: 200 },
      );
    },
  });

  assert.equal(new URL(String(requestedUrl)).searchParams.get("query"), "测试 短剧");
  assert.equal(new URL(String(requestedUrl)).pathname, "/api/search/result/");
  assert.equal(requestedOptions.method, "GET");
  assert.equal(requestedOptions.redirect, "error");
  assert.equal(requestedOptions.credentials, "omit");
  assert.equal(requestedOptions.cache, "no-store");
  assert.equal(response[0].title, "测试短剧");
});

test("searchOfficialSeries rejects overlong queries before fetching", async () => {
  let called = false;
  await assert.rejects(
    searchOfficialSeries("剧".repeat(31), {
      fetchImpl: async () => {
        called = true;
      },
    }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "SEARCH_QUERY_TOO_LONG",
  );
  assert.equal(called, false);
});

test("searchOfficialSeries returns a 504 when the request times out", async () => {
  const fetchImpl = (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });

  await assert.rejects(
    searchOfficialSeries("测试短剧", {
      fetchImpl,
      timeoutMs: 5,
    }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "SEARCH_REQUEST_TIMEOUT" &&
      error.statusCode === 504,
  );
});

test("parseOfficialRankings keeps supported groups, deduplicates and normalizes fields", () => {
  const groups = parseOfficialRankings({
    loaderData: {
      page: {
        homeSections: [
          {
            tab_type: "all",
            video_list: [
              {
                series_id: "7694653385668037657",
                series_title: "不应展示",
              },
            ],
          },
          {
            tab_type: "human",
            video_list: [
              {
                series_id: "7694653385668037657",
                series_title: "  真人  短剧 ",
                series_cover: "https://example.com/cover.jpg",
                episode_cnt: "63",
                episode_right_text: "全 63 集",
                series_status: 1,
                rank: "1",
                category_list: [
                  { name: "家庭" },
                  { name: " 婚姻经营 " },
                ],
              },
              {
                series_id: "7694653385668037657",
                series_title: "重复记录",
              },
              {
                series_id: "invalid",
                series_title: "无效记录",
              },
            ],
          },
          {
            tab_type: "comic",
            video_list: [
              {
                series_id: "7694653385668037658",
                series_title: "漫剧",
                series_status: 0,
                rank: 2,
              },
            ],
          },
        ],
      },
    },
  });

  assert.deepEqual(Object.keys(groups), ["human", "comic", "ai"]);
  assert.equal(groups.human.length, 1);
  assert.equal(groups.human[0].title, "真人 短剧");
  assert.equal(groups.human[0].episodeCount, 63);
  assert.equal(groups.human[0].status, "completed");
  assert.deepEqual(groups.human[0].categories, ["家庭", "婚姻经营"]);
  assert.equal(
    groups.human[0].detailUrl,
    "https://hongguoduanju.com/detail?series_id=7694653385668037657",
  );
  assert.equal(groups.comic[0].status, "updating");
  assert.equal(groups.ai.length, 0);
});

test("parseOfficialRankings rejects an unexpected homepage payload", () => {
  assert.throws(
    () => parseOfficialRankings({ loaderData: {} }),
    (error) =>
      error instanceof HongguoError &&
      error.code === "RANKINGS_DATA_INVALID",
  );
});

test("fetchOfficialRankings reads the official homepage router data", async () => {
  const routerData = {
    loaderData: {
      page: {
        homeSections: [
          {
            tab_type: "ai",
            video_list: [
              {
                series_id: "7699513062054710296",
                series_title: "nova：新星",
                episode_cnt: 60,
                series_status: 0,
                rank: 1,
              },
            ],
          },
        ],
      },
    },
  };
  let requestedUrl;
  const groups = await fetchOfficialRankings({
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(
        `<script>window._ROUTER_DATA = ${JSON.stringify(routerData)};</script>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    },
  });

  assert.equal(requestedUrl, "https://hongguoduanju.com/");
  assert.equal(groups.ai[0].title, "nova：新星");
});

test("official ranking paths preserve availability and official category names", () => {
  assert.equal(resolveOfficialRankingPath("human", "hot"), "/rank/hot-real-drama");
  assert.equal(
    resolveOfficialRankingPath("comic", "new"),
    "/rank/new-comic-drama",
  );
  assert.equal(
    resolveOfficialRankingPath("all", "prestige"),
    "/rank/prestige-drama",
  );
  assert.throws(
    () => resolveOfficialRankingPath("comic", "prestige"),
    (error) =>
      error instanceof HongguoError &&
      error.code === "RANKING_COMBINATION_UNAVAILABLE" &&
      error.statusCode === 404,
  );
});

test("parseOfficialRankingPage normalizes official ranking cards", () => {
  const page = parseOfficialRankingPage({
    loaderData: {
      rank_layout: null,
      "rank_hot-real-drama/page": {
        pageNum: 1,
        canonicalUrl: "https://hongguoduanju.com/rank/hot-real-drama",
        updatedText: "11月15日已更新·按热度排序",
        content: {
          rankList: [
            {
              seriesId: "7694653385668037657",
              rank: 1,
              title: "  测试  真人剧 ",
              cover: "https://example.com/cover.jpg",
              href: "/detail?series_id=7694653385668037657",
              episodeCount: 63,
              openEpisodeCount: 3,
              primaryMetricText: "8752万热度",
              tags: ["真人剧", "家庭", "演员甲"],
              statusTags: ["新剧"],
            },
            {
              seriesId: "7694653385668037657",
              rank: 2,
              title: "重复记录",
            },
            {
              seriesId: "invalid",
              rank: 3,
              title: "无效记录",
            },
          ],
          pagination: {
            totalPages: 5,
          },
        },
      },
    },
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.updatedText, "11月15日已更新·按热度排序");
  assert.equal(page.totalPages, 5);
  assert.equal(page.items[0].title, "测试 真人剧");
  assert.equal(page.items[0].rightText, "共 63 集");
  assert.equal(page.items[0].metricText, "8752万热度");
  assert.deepEqual(page.items[0].categories, ["家庭", "演员甲", "新剧"]);
  assert.deepEqual(page.items[0].statusTags, ["新剧"]);
  assert.equal(
    page.items[0].detailUrl,
    "https://hongguoduanju.com/detail?series_id=7694653385668037657",
  );
});

test("fetchOfficialRanking reads three official pages and caps the result at 50", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    requestedUrls.push(parsed.href);
    const pageNum = Number(parsed.searchParams.get("page") || 1);
    const rankList = Array.from({ length: 20 }, (_, index) => {
      const rank = (pageNum - 1) * 20 + index + 1;
      return {
        seriesId: `7694653385668${String(rank).padStart(5, "0")}`,
        rank,
        title: `第 ${rank} 部短剧`,
        episodeCount: 50 + rank,
        tags: ["漫剧", "剧情"],
      };
    });
    const routerData = {
      loaderData: {
        "rank_hot-comic-drama/page": {
          pageNum,
          canonicalUrl: `https://hongguoduanju.com/rank/hot-comic-drama?page=${pageNum}`,
          updatedText: "11月15日已更新·按热度排序",
          content: {
            rankList,
            pagination: { totalPages: 5 },
          },
        },
      },
    };
    return new Response(
      `<script>window._ROUTER_DATA = ${JSON.stringify(routerData)};</script>`,
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    );
  };

  const result = await fetchOfficialRanking({
    category: "comic",
    type: "hot",
    limit: 50,
    fetchImpl,
  });

  assert.deepEqual(requestedUrls, [
    "https://hongguoduanju.com/rank/hot-comic-drama",
    "https://hongguoduanju.com/rank/hot-comic-drama?page=2",
    "https://hongguoduanju.com/rank/hot-comic-drama?page=3",
  ]);
  assert.equal(result.items.length, 50);
  assert.equal(result.items[0].rank, 1);
  assert.equal(result.items[49].rank, 50);
  assert.equal(result.category, "comic");
  assert.equal(result.type, "hot");
});
