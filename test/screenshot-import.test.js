import assert from "node:assert/strict";
import test from "node:test";
import {
  ScreenshotImportError,
  ScreenshotImportService,
  parseScreenshotOcr,
  validateScreenshotImage,
  __test,
} from "../src/screenshot-import.js";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function makePng(width = 600, height = 200) {
  const buffer = Buffer.alloc(24);
  PNG_SIGNATURE.copy(buffer, 0);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function word(text, x0, x1, y0, y1, confidence = 90) {
  return {
    text,
    confidence,
    bbox: { x0, y0, x1, y1 },
  };
}

function line(words, confidence = 90) {
  return {
    text: words.map((item) => item.text).join(" "),
    confidence,
    bbox: {
      x0: Math.min(...words.map((item) => item.bbox.x0)),
      y0: Math.min(...words.map((item) => item.bbox.y0)),
      x1: Math.max(...words.map((item) => item.bbox.x1)),
      y1: Math.max(...words.map((item) => item.bbox.y1)),
    },
    words,
  };
}

function detailResponse(
  seriesId,
  {
    title = "测试短剧",
    seriesGroupId = null,
    episodeCount = 20,
    status = "completed",
    firstVisibleTime = null,
  } = {},
) {
  return {
    detail: {
      seriesId: String(seriesId),
      seriesGroupId,
      title,
      coverUrl: "",
      intro: "",
      tags: [],
      firstVisibleTime,
      episodeCount,
      totalEpisodeCount: episodeCount,
      accessibleEpisodeCount: episodeCount,
      status,
      rightText: "",
      detailUrl: "",
    },
  };
}

function makeScreenshotBlocks() {
  return [
    line([
      word("收藏", 20, 90, 2, 18, 94),
      word("全部", 270, 330, 2, 18, 94),
      word("漫剧", 470, 530, 2, 18, 94),
    ]),
    line([
      word("测试短剧", 20, 180, 20, 40, 91),
      word("苏忆穿书第一季", 210, 390, 20, 40, 88),
      word("从零开始AI视频教程", 410, 580, 20, 40, 86),
    ]),
    line([
      word("1集/20集", 65, 135, 52, 72, 92),
      word("5集/30集", 265, 335, 52, 72, 92),
      word("3集/40集", 465, 535, 52, 72, 92),
    ]),
    line([
      word("测试短剧", 22, 182, 100, 120, 90),
      word("苏忆穿书第一季", 212, 392, 100, 120, 89),
      word("从零开始AI视频教程", 412, 582, 100, 120, 87),
    ]),
    line([
      word("1集/20集", 66, 136, 132, 152, 91),
      word("5集/30集", 266, 336, 132, 152, 91),
      word("3集/40集", 466, 536, 132, 152, 91),
    ]),
  ];
}

function makeRealisticScreenshotBlocks() {
  const firstRowTitle = line([
    word("萌", 23, 39, 765, 782, 36),
    word("宝", 49, 68, 765, 782, 92),
    word("小", 73, 89, 765, 782, 92),
    word("熊", 88, 106, 760, 790, 84),
    word("未", 105, 115, 765, 782, 83),
    word("日", 124, 131, 765, 782, 96),
    word("超市", 135, 188, 765, 782, 5),
    word("苏", 214, 226, 765, 782, 91),
    word("忆", 232, 245, 765, 782, 92),
    word("穿", 251, 273, 765, 782, 92),
    word("书", 272, 289, 760, 790, 93),
    word("第", 289, 301, 765, 782, 96),
    word("一", 307, 319, 772, 774, 93),
    word("季", 324, 337, 765, 782, 92),
    word("流氓", 394, 440, 760, 792, 46),
    word("帝", 440, 460, 764, 782, 88),
    word("师", 470, 473, 778, 783, 92),
    word("，", 476, 492, 760, 792, 92),
    word("吾", 492, 505, 765, 782, 8),
    word("乃", 514, 534, 765, 782, 37),
    word("皇", 545, 548, 778, 780, 92),
    word("…", 551, 560, 778, 780, 87),
  ]);
  const firstRowProgress = line([
    word("68", 23, 40, 797, 809, 93),
    word("集", 45, 56, 796, 810, 90),
    word("/172", 59, 89, 796, 811, 92),
    word("集", 94, 104, 796, 811, 89),
    word("1", 209, 213, 798, 809, 93),
    word("集", 219, 229, 797, 810, 92),
    word("/154", 233, 262, 796, 810, 92),
    word("集", 267, 278, 796, 810, 91),
    word("172", 394, 486, 796, 811, 91),
    word("集", 422, 438, 792, 818, 92),
    word("/253", 437, 475, 796, 811, 92),
    word("集", 474, 490, 792, 818, 90),
  ]);
  const secondRowTitle = line([
    word("谁", 22, 40, 1099, 1117, 92),
    word("说", 49, 59, 1099, 1116, 92),
    word("纳", 66, 77, 1099, 1116, 75),
    word("绑", 83, 96, 1099, 1116, 73),
    word("不", 103, 125, 1099, 1116, 0),
    word("能", 124, 141, 1095, 1126, 93),
    word("当", 140, 151, 1099, 1116, 93),
    word("状元", 161, 199, 1095, 1126, 74),
    word("”", 208, 214, 1099, 1115, 63),
    word("诸", 214, 226, 1099, 1116, 88),
    word("天", 233, 244, 1100, 1116, 96),
    word("拍卖", 246, 307, 1099, 1117, 93),
    word("行", 297, 313, 1095, 1126, 92),
    word("，", 312, 328, 1095, 1126, 90),
    word("我", 320, 374, 1099, 1116, 86),
    word("好", 347, 359, 1095, 1126, 92),
    word(".…，", 359, 385, 1095, 1126, 50),
    word("不", 397, 411, 1100, 1116, 93),
    word("死", 419, 430, 1100, 1116, 91),
    word("帝", 438, 448, 1099, 1116, 93),
    word("师", 455, 467, 1099, 1116, 91),
    word("第", 475, 486, 1099, 1116, 96),
    word("一", 494, 505, 1106, 1108, 93),
    word("季", 510, 523, 1099, 1116, 93),
  ]);
  const secondRowProgress = line([
    word("14", 23, 37, 1132, 1143, 93),
    word("集", 43, 53, 1130, 1145, 88),
    word("/788", 56, 89, 1130, 1145, 92),
    word("集", 93, 104, 1130, 1145, 91),
    word("3", 209, 217, 1132, 1144, 93),
    word("集", 222, 232, 1131, 1145, 89),
    word("/110", 234, 263, 1131, 1145, 91),
    word("集", 269, 278, 1131, 1144, 92),
    word("65", 394, 477, 1130, 1145, 92),
    word("集", 417, 431, 1126, 1153, 90),
    word("/180", 430, 466, 1130, 1145, 92),
    word("集", 465, 482, 1126, 1153, 90),
  ]);

  return [
    firstRowTitle,
    firstRowProgress,
    secondRowTitle,
    secondRowProgress,
  ];
}

test("screenshot validation detects the actual image type and dimensions", () => {
  const metadata = validateScreenshotImage(makePng(589, 1280), "image/png");
  assert.deepEqual(metadata, {
    mimeType: "image/png",
    format: "png",
    bytes: 24,
    width: 589,
    height: 1280,
  });

  assert.throws(
    () => validateScreenshotImage(makePng(), "image/jpeg"),
    (error) =>
      error instanceof ScreenshotImportError &&
      error.code === "UNSUPPORTED_IMAGE_TYPE" &&
      error.statusCode === 415,
  );
  assert.throws(
    () => validateScreenshotImage(Buffer.from("GIF89a unsupported")),
    (error) =>
      error instanceof ScreenshotImportError &&
      error.code === "UNSUPPORTED_IMAGE_TYPE",
  );
  assert.throws(
    () => validateScreenshotImage(makePng(12_001, 100)),
    (error) =>
      error instanceof ScreenshotImportError &&
      error.code === "IMAGE_DIMENSIONS_TOO_LARGE",
  );
});

test("screenshot validation enforces the upload size limit", () => {
  assert.throws(
    () =>
      validateScreenshotImage(
        Buffer.alloc(__test.MAX_IMAGE_BYTES + 1),
        "image/png",
      ),
    (error) =>
      error instanceof ScreenshotImportError &&
      error.code === "IMAGE_TOO_LARGE" &&
      error.statusCode === 413,
  );
});

test("OCR parsing joins title words by grid column and removes duplicates", () => {
  const items = parseScreenshotOcr(
    [{ paragraphs: [{ lines: makeScreenshotBlocks() }] }],
    { imageWidth: 600 },
  );

  assert.deepEqual(
    items.map((item) => ({
      title: item.title,
      progress: item.progress?.label || null,
      tutorialLike: item.tutorialLike,
    })),
    [
      {
        title: "测试短剧",
        progress: "1集/20集",
        tutorialLike: false,
      },
      {
        title: "苏忆穿书第一季",
        progress: "5集/30集",
        tutorialLike: false,
      },
      {
        title: "从零开始AI视频教程",
        progress: "3集/40集",
        tutorialLike: true,
      },
    ],
  );
});

test("OCR parsing keeps cross-column title words in their card columns", () => {
  const items = parseScreenshotOcr(
    [{ paragraphs: [{ lines: makeRealisticScreenshotBlocks() }] }],
    { imageWidth: 589 },
  );

  assert.deepEqual(
    items.map((item) => ({
      title: item.title,
      progress: item.progress?.label || null,
    })),
    [
      { title: "萌宝小熊未日超市", progress: "68集/172集" },
      { title: "苏忆穿书第一季", progress: "1集/154集" },
      { title: "流氓帝师吾乃皇", progress: "172集/253集" },
      { title: "谁说纳绑不能当状元", progress: "14集/788集" },
      { title: "诸天拍卖行我好", progress: "3集/110集" },
      { title: "不死帝师第一季", progress: "65集/180集" },
    ],
  );
});

test("OCR analysis prefers an exact episode total over a shorter unrelated title", async (t) => {
  const worker = {
    async setParameters() {},
    async recognize() {
      return {
        data: {
          blocks: [
            line([word("诸天拍卖行我好", 22, 188, 1099, 1117, 91)]),
            line([
              word("3", 23, 37, 1132, 1143, 93),
              word("集", 43, 53, 1130, 1145, 88),
              word("/110", 56, 89, 1130, 1145, 92),
              word("集", 93, 104, 1130, 1145, 91),
            ]),
          ],
          text: "诸天拍卖行我好",
        },
      };
    },
    async terminate() {},
  };
  const service = new ScreenshotImportService({
    createOcrWorker: async () => worker,
    fetchDetail: async (seriesId) => detailResponse(seriesId),
    searchSeries: async () => [
      {
        seriesId: "7694217414245895230",
        title: "诸天拍卖行",
        episodeCount: 227,
        status: "completed",
        coverUrl: "",
      },
      {
        seriesId: "7676777933448432702",
        title: "诸天拍卖行，我好物倾销万域",
        episodeCount: 110,
        status: "completed",
        coverUrl: "",
      },
    ],
  });
  t.after(() => service.stop());

  const result = await service.analyze(makePng(200, 200), "image/png");
  assert.equal(result.items[0].candidates[0].seriesId, "7676777933448432702");
  assert.equal(result.items[0].suggestedSeriesId, "7676777933448432702");
});

test("OCR analysis ranks candidates and leaves tutorials unselected", async (t) => {
  const workerCalls = [];
  const worker = {
    async setParameters(parameters) {
      workerCalls.push({ type: "parameters", parameters });
    },
    async recognize() {
      workerCalls.push({ type: "recognize" });
      return {
        data: {
          blocks: [{ paragraphs: [{ lines: makeScreenshotBlocks() }] }],
          text: "测试短剧 苏忆穿书第一季 从零开始AI视频教程",
        },
      };
    },
    async terminate() {
      workerCalls.push({ type: "terminate" });
    },
  };
  const candidateMap = {
    测试短剧: [
      {
        seriesId: "7694653385668037650",
        title: "完全不同的剧",
        episodeCount: 12,
        status: "completed",
        coverUrl: "",
      },
      {
        seriesId: "7694653385668037657",
        title: "测试短剧",
        episodeCount: 20,
        status: "completed",
        coverUrl: "",
      },
    ],
    苏忆穿书第一季: [
      {
        seriesId: "7694653385668037658",
        title: "苏忆穿书第一季",
        episodeCount: 154,
        status: "updating",
        coverUrl: "",
      },
    ],
    从零开始AI视频教程: [
      {
        seriesId: "7694653385668037659",
        title: "从零开始AI视频教程",
        episodeCount: 8,
        status: "completed",
        coverUrl: "",
      },
    ],
  };
  const service = new ScreenshotImportService({
    createOcrWorker: async () => worker,
    fetchDetail: async (seriesId) => detailResponse(seriesId),
    searchSeries: async (query) => candidateMap[query] || [],
  });
  t.after(() => service.stop());

  const result = await service.analyze(makePng(), "image/png");
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].suggestedSeriesId, "7694653385668037657");
  assert.equal(result.items[1].suggestedSeriesId, "7694653385668037658");
  assert.equal(result.items[2].suggestedSeriesId, null);
  assert.match(result.items[2].selectionReason, /教程/);
  assert.equal(workerCalls[0].type, "parameters");
  assert.equal(workerCalls[1].type, "recognize");

  await service.terminateWorker();
  assert.equal(workerCalls.at(-1).type, "terminate");
});

test("series searches are globally limited, cached and retried once", async (t) => {
  let active = 0;
  let maxActive = 0;
  const calls = new Map();
  const service = new ScreenshotImportService({
    searchRetryDelayMs: 0,
    fetchDetail: async (seriesId) => detailResponse(seriesId),
    searchSeries: async (query) => {
      calls.set(query, (calls.get(query) || 0) + 1);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      if (query === "重试测试" && calls.get(query) === 1) {
        const error = new Error("temporary upstream failure");
        error.code = "SEARCH_UPSTREAM_HTTP_ERROR";
        error.statusCode = 502;
        throw error;
      }
      return [];
    },
  });
  t.after(() => service.stop());

  await Promise.all(
    ["并发测试一", "并发测试二", "并发测试三", "重试测试"].map((query) =>
      service.search(query),
    ),
  );
  assert.equal(maxActive, 2);
  assert.equal(calls.get("重试测试"), 2);

  await service.search("重试测试");
  assert.equal(calls.get("重试测试"), 2);
});

test("screenshot analysis rejects a fourth concurrent OCR request", async (t) => {
  let resolveRecognition;
  const service = new ScreenshotImportService({
    fetchDetail: async (seriesId) => detailResponse(seriesId),
    searchSeries: async () => [],
  });
  const recognition = new Promise((resolve) => {
    resolveRecognition = resolve;
  });
  service.recognize = () =>
    recognition;
  t.after(() => service.stop());

  const first = service.analyze(makePng(), "image/png");
  const second = service.analyze(makePng(), "image/png");
  const third = service.analyze(makePng(), "image/png");
  await assert.rejects(
    service.analyze(makePng(), "image/png"),
    (error) =>
      error instanceof ScreenshotImportError &&
      error.code === "OCR_BUSY" &&
      error.statusCode === 429,
  );

  resolveRecognition({
    blocks: makeScreenshotBlocks(),
    text: "测试短剧",
  });
  const results = await Promise.all([first, second, third]);
  assert.deepEqual(
    results.map((result) => result.items.length),
    [3, 3, 3],
  );
});

test("screenshot analysis merges different seasons from one official series", async (t) => {
  const groupId = "7698938199183215700";
  const firstSeasonId = "7694653385668037657";
  const secondSeasonId = "7694653385668037658";
  const worker = {
    async setParameters() {},
    async recognize() {
      return {
        data: {
          blocks: [
            line([
              word("万妖图录传第一季", 20, 180, 20, 40, 92),
              word("万妖图录传第二季", 220, 380, 20, 40, 92),
            ]),
            line([
              word("1集/12集", 55, 145, 60, 80, 92),
              word("2集/14集", 255, 345, 60, 80, 92),
            ]),
          ],
          text: "万妖图录传第一季 万妖图录传第二季",
        },
      };
    },
    async terminate() {},
  };
  const candidates = {
    万妖图录传第一季: [
      {
        seriesId: firstSeasonId,
        title: "万妖图录传第一季",
        episodeCount: 12,
        status: "completed",
        coverUrl: "",
      },
    ],
    万妖图录传第二季: [
      {
        seriesId: secondSeasonId,
        title: "万妖图录传第二季",
        episodeCount: 14,
        status: "updating",
        coverUrl: "",
      },
    ],
  };
  const service = new ScreenshotImportService({
    createOcrWorker: async () => worker,
    fetchDetail: async (seriesId) =>
      detailResponse(seriesId, {
        title:
          seriesId === firstSeasonId
            ? "万妖图录传第一季"
            : "万妖图录传第二季",
        seriesGroupId: groupId,
        episodeCount: seriesId === firstSeasonId ? 12 : 14,
        firstVisibleTime:
          seriesId === firstSeasonId
            ? "2026-01-01T00:00:00.000Z"
            : "2026-10-01T00:00:00.000Z",
      }),
    searchSeries: async (query) => candidates[query] || [],
  });
  t.after(() => service.stop());

  const result = await service.analyze(makePng(400, 200), "image/png");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].seriesGroupId, groupId);
  assert.equal(result.items[0].suggestedSeriesId, secondSeasonId);
  assert.deepEqual(
    result.items[0].candidates.map((candidate) => candidate.seriesId).sort(),
    [firstSeasonId, secondSeasonId].sort(),
  );
});

test("series import deduplicates the same group and checks the latest season once", async () => {
  const groupId = "7698938199183215701";
  const firstSeasonId = "7694653385668037661";
  const secondSeasonId = "7694653385668037662";
  const details = new Map([
    [
      firstSeasonId,
      detailResponse(firstSeasonId, {
        title: "测试短剧第一季",
        seriesGroupId: groupId,
        episodeCount: 10,
        firstVisibleTime: "2026-01-01T00:00:00.000Z",
      }).detail,
    ],
    [
      secondSeasonId,
      detailResponse(secondSeasonId, {
        title: "测试短剧第二季",
        seriesGroupId: groupId,
        episodeCount: 12,
        firstVisibleTime: "2026-10-01T00:00:00.000Z",
      }).detail,
    ],
  ]);
  const service = new ScreenshotImportService({
    searchSeries: async () => [],
    fetchDetail: async (seriesId) => ({ detail: details.get(seriesId) }),
  });
  const added = [];
  const checked = [];
  const target = {
    async addSubscription(seriesId, options) {
      added.push({ seriesId, options });
      return {
        action: "created",
        subscriptionId: "sub_latest",
        title: "测试短剧第一季",
      };
    },
    async checkSubscriptions(subscriptionIds, options) {
      checked.push({ subscriptionIds, options });
      return {
        checkedSubscriptions: subscriptionIds.length,
        failedSubscriptions: 0,
      };
    },
  };

  const result = await service.importSeriesIds(
    [
      firstSeasonId,
      secondSeasonId,
      firstSeasonId,
    ],
    target,
  );

  assert.deepEqual(added, [
    {
      seriesId: secondSeasonId,
      options: { detail: details.get(secondSeasonId) },
    },
  ]);
  assert.deepEqual(checked, [
    {
      subscriptionIds: ["sub_latest"],
      options: {
        notify: false,
        discover: true,
        forceDiscovery: true,
        markUnread: false,
      },
    },
  ]);
  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.failedCount, 0);
  assert.equal(result.checkedCount, 1);
  assert.equal(result.outcomes[0].title, "测试短剧第一季");
  assert.equal(result.outcomes[1].title, "测试短剧第一季");
});

test("importing an already tracked group immediately checks that subscription", async () => {
  const seriesId = "7694653385668037663";
  const service = new ScreenshotImportService({
    searchSeries: async () => [],
    fetchDetail: async () => ({
      detail: detailResponse(seriesId, {
        seriesGroupId: "7698938199183215702",
      }).detail,
    }),
  });
  const checked = [];
  const target = {
    async addSubscription() {
      const error = new Error("already tracked");
      error.code = "SUBSCRIPTION_EXISTS";
      error.subscriptionId = "sub_existing";
      throw error;
    },
    async checkSubscriptions(subscriptionIds, options) {
      checked.push({ subscriptionIds, options });
      return {
        checkedSubscriptions: subscriptionIds.length,
        failedSubscriptions: 0,
      };
    },
  };

  const result = await service.importSeriesIds([seriesId], target);

  assert.equal(result.importedCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.checkedCount, 1);
  assert.equal(result.outcomes[0].subscriptionId, "sub_existing");
  assert.deepEqual(checked, [
    {
      subscriptionIds: ["sub_existing"],
      options: {
        notify: false,
        discover: true,
        forceDiscovery: true,
        markUnread: false,
      },
    },
  ]);
});
