import assert from "node:assert/strict";
import test from "node:test";
import {
  HongguoError,
  decodeHtmlEntities,
  extractBalancedJson,
  extractAnimationSeriesId,
  extractRecommendations,
  extractSeriesId,
  fetchAlbumSeriesIds,
  fetchSeriesDetail,
  isAllowedShareHost,
  parseOfficialSearchResults,
  parseSeriesDetailHtml,
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
    const body = `{"code":0,"data":{"${seriesId}":{"album_info":{"album_id":7624475539960499262,"album_serial_count":14,"album_series_item":[{"is_subscribe_shell":false,"item_id":"${firstId}"},{"is_subscribe_shell":false,"item_id":"${firstId}"},{"is_subscribe_shell":false,"item_id":"${latestPublishedId}"},{"is_subscribe_shell":true,"item_id":"${upcomingId}"}]}}}}`;
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
