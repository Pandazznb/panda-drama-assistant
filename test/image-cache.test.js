import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ImageCache } from "../src/image-cache.js";

const IMAGE_URL =
  "https://p3-novel.byteimg.com/novel-pic/test-cover.image";

async function createPng(color = "#e84b4b") {
  return sharp({
    create: {
      width: 12,
      height: 18,
      channels: 4,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

async function createCache(t, overrides = {}) {
  const dataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-image-cache-"),
  );
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  return {
    dataDir,
    cache: new ImageCache({
      dataDir,
      ...overrides,
    }),
  };
}

function imageResponse(image) {
  return new Response(image, {
    status: 200,
    headers: {
      "content-length": String(image.length),
      "content-type": "image/png",
    },
  });
}

test("封面首次下载后永久命中本地缓存", async (t) => {
  const image = await createPng();
  let fetchCount = 0;
  const { dataDir, cache } = await createCache(t, {
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse(image);
    },
  });

  const first = await cache.get({
    url: IMAGE_URL,
    seriesId: "7694653385668037657",
  });
  assert.equal(first.cacheHit, false);
  assert.equal(first.contentType, "image/png");
  assert.deepEqual(first.image, image);

  const second = await cache.get({
    url: "https://p3-novel.byteimg.com/novel-pic/changed.image",
    seriesId: "7694653385668037657",
  });
  assert.equal(second.cacheHit, true);
  assert.deepEqual(second.image, image);
  assert.equal(fetchCount, 1);

  const files = await fs.readdir(path.join(dataDir, "covers"));
  assert.deepEqual(files, ["series-7694653385668037657.cover"]);
});

test("相同封面的并发请求只下载一次", async (t) => {
  const image = await createPng();
  let fetchCount = 0;
  const { cache } = await createCache(t, {
    fetchImpl: async () => {
      fetchCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return imageResponse(image);
    },
  });

  const [first, second] = await Promise.all([
    cache.get({ url: IMAGE_URL }),
    cache.get({ url: IMAGE_URL }),
  ]);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, false);
  assert.equal(fetchCount, 1);
});

test("refresh 会绕过磁盘缓存并重新下载", async (t) => {
  const firstImage = await createPng("#e84b4b");
  const refreshedImage = await createPng("#26a269");
  let fetchCount = 0;
  const { cache } = await createCache(t, {
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse(fetchCount === 1 ? firstImage : refreshedImage);
    },
  });

  await cache.get({ url: IMAGE_URL });
  const refreshed = await cache.get({
    url: IMAGE_URL,
    refresh: true,
  });
  assert.equal(refreshed.cacheHit, false);
  assert.deepEqual(refreshed.image, refreshedImage);
  assert.equal(fetchCount, 2);
});

test("非图片和超大响应不会写入封面缓存", async (t) => {
  const responses = [
    Buffer.from("123456789"),
    Buffer.from("bad"),
  ];
  const { cache } = await createCache(t, {
    maxBytes: 8,
    fetchImpl: async () => {
      const content = responses.shift();
      return new Response(content, {
        status: 200,
        headers: {
          "content-length": String(content.length),
          "content-type": "text/plain",
        },
      });
    },
  });

  await assert.rejects(
    cache.get({ url: IMAGE_URL }),
    (error) => error.code === "COVER_TOO_LARGE",
  );
  await assert.rejects(
    cache.get({ url: IMAGE_URL }),
    (error) => error.code === "COVER_NOT_IMAGE",
  );
  await assert.rejects(
    fs.access(cache.cacheDir),
  );
});

test("拒绝非官方域名且支持损坏缓存自动恢复", async (t) => {
  const image = await createPng();
  let fetchCount = 0;
  const { dataDir, cache } = await createCache(t, {
    fetchImpl: async () => {
      fetchCount += 1;
      return imageResponse(image);
    },
  });

  await assert.rejects(
    cache.get({ url: "https://example.com/cover.png" }),
    (error) => error.code === "COVER_HOST_NOT_ALLOWED",
  );

  await cache.get({
    url: IMAGE_URL,
    seriesId: "7694653385668037657",
  });
  const cachePath = path.join(
    dataDir,
    "covers",
    "series-7694653385668037657.cover",
  );
  await fs.writeFile(cachePath, "broken");

  const recovered = await cache.get({
    url: IMAGE_URL,
    seriesId: "7694653385668037657",
  });
  assert.equal(recovered.cacheHit, false);
  assert.deepEqual(recovered.image, image);
  assert.equal(fetchCount, 2);
});

test("原封面地址失效后按剧集 ID 获取最新封面", async (t) => {
  const image = await createPng();
  const calls = [];
  const { cache } = await createCache(t, {
    resolveSeriesCover: async (seriesId) => {
      assert.equal(seriesId, "7694653385668037657");
      return "https://p3-novel.byteimg.com/novel-pic/latest.image";
    },
    fetchImpl: async (input) => {
      const requestUrl = String(input);
      calls.push(requestUrl);
      if (requestUrl === IMAGE_URL) {
        return new Response(null, { status: 404 });
      }
      return imageResponse(image);
    },
  });

  const result = await cache.get({
    url: IMAGE_URL,
    seriesId: "7694653385668037657",
  });
  assert.deepEqual(result.image, image);
  assert.deepEqual(calls, [
    IMAGE_URL,
    "https://p3-novel.byteimg.com/novel-pic/latest.image",
  ]);
});
