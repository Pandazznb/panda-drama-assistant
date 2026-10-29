import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorker,
  OEM,
  PSM,
} from "tesseract.js";
import {
  fetchSeriesDetail,
  searchOfficialSeries,
} from "./hongguo.js";
import { normalizeWhitespace } from "./utils.js";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(ROOT_DIR, "..", "node_modules", "@tesseract.js-data");
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24_000_000;
const MAX_IMAGE_SIDE = 12_000;
const MAX_IMPORT_ITEMS = 20;
const MAX_CANDIDATES = 6;
const SEARCH_CONCURRENCY = 2;
const SERIES_DETAIL_CONCURRENCY = 4;
const MAX_ACTIVE_ANALYSES = 3;
const OCR_TIMEOUT_MS = 45_000;
const OCR_IDLE_MS = 90_000;
const SEARCH_CACHE_MS = 5 * 60_000;
const SEARCH_RETRY_DELAY_MS = 450;
const SERIES_DETAIL_CACHE_MS = 10 * 60_000;
const MAX_TITLE_LENGTH = 80;
const MAX_SEARCH_LENGTH = 30;
const CJK_PATTERN = /[\u3400-\u9fff]/u;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const UI_LINE_PATTERN =
  /(?:历史|收藏夹|点赞|预约|动态|真人剧|漫剧|编辑|首页|剧场|商城|福利|我的)/u;
const TUTORIAL_PATTERN =
  /(?:教程|课程|教学|训练营|第[一二三四五六七八九十\d]+课|AI视频|视频剪辑.*课|运营课|变现课)/iu;

export class ScreenshotImportError extends Error {
  constructor(message, code = "SCREENSHOT_IMPORT_ERROR", statusCode = 400) {
    super(message);
    this.name = "ScreenshotImportError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function imageError(message, code, statusCode = 400) {
  return new ScreenshotImportError(message, code, statusCode);
}

function detectImageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function pngDimensions(buffer) {
  if (buffer.length < 24) {
    return null;
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (offset + 2 > buffer.length) {
      return null;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      return null;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30) {
    return null;
  }
  const chunkType = buffer.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  return null;
}

function imageDimensions(buffer, type) {
  if (type === "image/png") {
    return pngDimensions(buffer);
  }
  if (type === "image/jpeg") {
    return jpegDimensions(buffer);
  }
  if (type === "image/webp") {
    return webpDimensions(buffer);
  }
  return null;
}

export function validateScreenshotImage(buffer, declaredType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw imageError("请选择一张收藏页截图。", "EMPTY_IMAGE");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw imageError(
      "单张截图不能超过 8 MB，请压缩后再试。",
      "IMAGE_TOO_LARGE",
      413,
    );
  }

  const detectedType = detectImageType(buffer);
  const normalizedDeclaredType = String(declaredType)
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (
    !detectedType ||
    !ALLOWED_IMAGE_TYPES.has(detectedType) ||
    (normalizedDeclaredType && normalizedDeclaredType !== detectedType)
  ) {
    throw imageError(
      "仅支持 JPG、PNG 或 WebP 截图。",
      "UNSUPPORTED_IMAGE_TYPE",
      415,
    );
  }

  const dimensions = imageDimensions(buffer, detectedType);
  if (
    dimensions &&
    (dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > MAX_IMAGE_SIDE ||
      dimensions.height > MAX_IMAGE_SIDE ||
      dimensions.width * dimensions.height > MAX_IMAGE_PIXELS)
  ) {
    throw imageError(
      "截图尺寸过大，请先在相册中缩小或裁切后再导入。",
      "IMAGE_DIMENSIONS_TOO_LARGE",
      413,
    );
  }

  return {
    mimeType: detectedType,
    format: ALLOWED_IMAGE_TYPES.get(detectedType),
    bytes: buffer.length,
    width: dimensions?.width || null,
    height: dimensions?.height || null,
  };
}

function normalizeWord(word) {
  const text = normalizeWhitespace(word?.text || "");
  const bbox = word?.bbox;
  if (
    !text ||
    !bbox ||
    !Number.isFinite(Number(bbox.x0)) ||
    !Number.isFinite(Number(bbox.x1)) ||
    Number(bbox.x1) <= Number(bbox.x0)
  ) {
    return null;
  }
  return {
    text,
    confidence: Number(word.confidence) || 0,
    bbox: {
      x0: Number(bbox.x0),
      y0: Number(bbox.y0),
      x1: Number(bbox.x1),
      y1: Number(bbox.y1),
    },
  };
}

function normalizeLine(line) {
  const text = normalizeWhitespace(line?.text || "");
  const bbox = line?.bbox;
  if (
    !text ||
    !bbox ||
    !Number.isFinite(Number(bbox.x0)) ||
    !Number.isFinite(Number(bbox.y0)) ||
    !Number.isFinite(Number(bbox.x1)) ||
    !Number.isFinite(Number(bbox.y1))
  ) {
    return null;
  }
  return {
    text,
    confidence: Number(line.confidence) || 0,
    bbox: {
      x0: Number(bbox.x0),
      y0: Number(bbox.y0),
      x1: Number(bbox.x1),
      y1: Number(bbox.y1),
    },
    words: Array.isArray(line.words)
      ? line.words.map(normalizeWord).filter(Boolean)
      : [],
  };
}

function collectOcrLines(node, lines = []) {
  if (!node) {
    return lines;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectOcrLines(item, lines);
    }
    return lines;
  }
  if (Array.isArray(node.words) && node.bbox && typeof node.text === "string") {
    const line = normalizeLine(node);
    if (line) {
      lines.push(line);
    }
    return lines;
  }
  if (Array.isArray(node.lines)) {
    for (const line of node.lines) {
      collectOcrLines(line, lines);
    }
    return lines;
  }
  if (Array.isArray(node.paragraphs)) {
    for (const paragraph of node.paragraphs) {
      collectOcrLines(paragraph, lines);
    }
  }
  return lines;
}

function bboxCenter(bbox) {
  return (bbox.x0 + bbox.x1) / 2;
}

function unionBbox(words) {
  return {
    x0: Math.min(...words.map((word) => word.bbox.x0)),
    y0: Math.min(...words.map((word) => word.bbox.y0)),
    x1: Math.max(...words.map((word) => word.bbox.x1)),
    y1: Math.max(...words.map((word) => word.bbox.y1)),
  };
}

function progressFromLine(line) {
  const records = [];
  const words = line.words;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const direct = word.text.match(
      /^(\d{1,5})\s*[集集]?\s*\/\s*(\d{1,5})\s*[集集]?$/u,
    );
    if (direct) {
      records.push({
        current: Number(direct[1]),
        total: Number(direct[2]),
        bbox: word.bbox,
      });
      continue;
    }

    const currentMatch = word.text.match(/^(\d{1,5})\s*[集集]?$/u);
    if (!currentMatch) {
      continue;
    }
    for (
      let totalIndex = index + 1;
      totalIndex <= Math.min(index + 4, words.length - 1);
      totalIndex += 1
    ) {
      const totalMatch = words[totalIndex].text.match(
        /^\/\s*(\d{1,5})\s*[集集]?$/u,
      );
      if (!totalMatch) {
        continue;
      }
      records.push({
        current: Number(currentMatch[1]),
        total: Number(totalMatch[1]),
        bbox: unionBbox([word, words[totalIndex]]),
      });
      break;
    }
  }

  return records
    .filter(
      (record) =>
        Number.isFinite(record.current) &&
        Number.isFinite(record.total) &&
        record.total > 0 &&
        record.current <= record.total,
    )
    .sort((left, right) => bboxCenter(left.bbox) - bboxCenter(right.bbox));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function inferGridCenters(progressRows) {
  if (!progressRows.length) {
    return [];
  }
  const maxColumns = Math.max(...progressRows.map((row) => row.length));
  const referenceRows = progressRows.filter((row) => row.length === maxColumns);
  const centers = [];
  for (let column = 0; column < maxColumns; column += 1) {
    centers.push(
      median(
        referenceRows.map((row) => bboxCenter(row[column].bbox)),
      ),
    );
  }
  return centers;
}

function gridBoundaries(centers, imageWidth) {
  if (!centers.length) {
    return [];
  }
  const bounds = [0];
  for (let index = 1; index < centers.length; index += 1) {
    bounds.push((centers[index - 1] + centers[index]) / 2);
  }
  bounds.push(Math.max(imageWidth, centers.at(-1) + 1));
  return bounds;
}

function findTitleLine(lines, progressLine, rowWidth) {
  const candidates = lines
    .filter((line) => {
      if (line === progressLine || line.bbox.y1 > progressLine.bbox.y0) {
        return false;
      }
      const gap = progressLine.bbox.y0 - line.bbox.y1;
      if (gap < 0 || gap > 72 || line.confidence < 12) {
        return false;
      }
      if (!CJK_PATTERN.test(line.text) && !/[A-Za-z]{2,}/u.test(line.text)) {
        return false;
      }
      if (UI_LINE_PATTERN.test(line.text)) {
        return false;
      }
      const widthRatio =
        (line.bbox.x1 - line.bbox.x0) / Math.max(rowWidth, 1);
      return widthRatio >= 0.45;
    })
    .map((line) => {
      const gap = progressLine.bbox.y0 - line.bbox.y1;
      const wordPenalty = line.words.length < 2 ? 30 : 0;
      return { line, score: gap + wordPenalty };
    })
    .sort((left, right) => left.score - right.score);
  return candidates[0]?.line || null;
}

function cleanCandidateTitle(value) {
  let title = normalizeWhitespace(value)
    .replace(/^[\s:：,，.。·•|/\\-]+/u, "")
    .replace(/[\s:：,，.。·•|/\\-]+$/u, "")
    .replace(/(?:\.{2,}|…{1,})$/u, "")
    .trim();

  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH).trim();
  }
  if (
    title.length < 2 ||
    !/[A-Za-z0-9\u3400-\u9fff]/u.test(title) ||
    UI_LINE_PATTERN.test(title)
  ) {
    return "";
  }
  return title;
}

function splitTitleWordsByColumn(line, columnCount) {
  const words = line.words
    .filter((word) => /[A-Za-z0-9\u3400-\u9fff]/u.test(word.text))
    .sort((left, right) => left.bbox.x0 - right.bbox.x0);
  const groups = Array.from({ length: columnCount }, () => []);
  if (!words.length) {
    return groups;
  }
  if (columnCount <= 1 || words.length < columnCount) {
    groups[0] = words;
    return groups;
  }

  const splitIndexes = words
    .slice(1)
    .map((word, index) => ({
      index,
      gap: word.bbox.x0 - words[index].bbox.x1,
    }))
    .sort(
      (left, right) =>
        right.gap - left.gap ||
        left.index - right.index,
    )
    .slice(0, columnCount - 1)
    .sort((left, right) => left.index - right.index);
  let start = 0;
  for (let column = 0; column < columnCount; column += 1) {
    const end =
      column < splitIndexes.length
        ? splitIndexes[column].index + 1
        : words.length;
    groups[column] = words.slice(start, end);
    start = end;
  }
  return groups;
}

function weightedConfidence(words, fallback) {
  const totalWeight = words.reduce(
    (sum, word) => sum + Math.max(1, word.text.length),
    0,
  );
  if (!totalWeight) {
    return Math.round(fallback);
  }
  return Math.round(
    words.reduce(
      (sum, word) =>
        sum + word.confidence * Math.max(1, word.text.length),
      0,
    ) / totalWeight,
  );
}

function normalizeDedupeKey(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function chineseNumber(value) {
  const text = String(value || "");
  if (/^\d+$/u.test(text)) {
    return Number(text);
  }
  const digits = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let total = 0;
  let current = 0;
  for (const character of text) {
    if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    if (character in digits) {
      current = current * 10 + digits[character];
      continue;
    }
    return null;
  }
  return total + current;
}

function seasonNumber(value) {
  const match = String(value || "").match(
    /第\s*([零〇一二两三四五六七八九十百\d]+)\s*季/u,
  );
  return match ? chineseNumber(match[1]) : null;
}

function candidateFreshness(candidate) {
  return {
    seasonNumber: seasonNumber(candidate?.title),
    firstVisibleTime:
      Date.parse(candidate?.firstVisibleTime || "") || 0,
    episodeCount: Number(candidate?.episodeCount) || 0,
  };
}

function compareCandidatesByFreshness(left, right) {
  const leftFreshness = candidateFreshness(left);
  const rightFreshness = candidateFreshness(right);
  if (
    leftFreshness.seasonNumber !== null &&
    rightFreshness.seasonNumber !== null &&
    leftFreshness.seasonNumber !== rightFreshness.seasonNumber
  ) {
    return rightFreshness.seasonNumber - leftFreshness.seasonNumber;
  }
  if (
    leftFreshness.firstVisibleTime !== rightFreshness.firstVisibleTime
  ) {
    return rightFreshness.firstVisibleTime - leftFreshness.firstVisibleTime;
  }
  return rightFreshness.episodeCount - leftFreshness.episodeCount;
}

function groupKeyForDetail(detail) {
  if (detail?.seriesGroupId) {
    return `group:${detail.seriesGroupId}`;
  }
  return detail?.seriesId ? `series:${detail.seriesId}` : "";
}

function isRetryableSearchError(error) {
  const statusCode = Number(error?.statusCode);
  if (statusCode === 429 || statusCode >= 500) {
    return true;
  }
  return new Set([
    "SEARCH_REQUEST_FAILED",
    "SEARCH_REQUEST_TIMEOUT",
    "SEARCH_UPSTREAM_HTTP_ERROR",
  ]).has(String(error?.code || ""));
}

export function parseScreenshotOcr(blocks, { imageWidth = 0 } = {}) {
  const lines = collectOcrLines(blocks);
  const progressLines = lines
    .map((line) => ({
      line,
      records: progressFromLine(line),
    }))
    .filter((entry) => entry.records.length > 0)
    .sort(
      (left, right) =>
        left.line.bbox.y0 - right.line.bbox.y0 ||
        left.line.bbox.x0 - right.line.bbox.x0,
    );
  const centers = inferGridCenters(
    progressLines.map((entry) => entry.records),
  );
  if (!centers.length) {
    return [];
  }
  const pageWidth =
    imageWidth ||
    Math.max(
      ...lines.map((line) => line.bbox.x1),
      ...progressLines.flatMap((entry) =>
        entry.records.map((record) => record.bbox.x1),
      ),
    );
  const boundaries = gridBoundaries(centers, pageWidth);
  const items = [];
  const seen = new Set();

  for (const entry of progressLines) {
    const titleLine = findTitleLine(lines, entry.line, pageWidth);
    if (!titleLine) {
      continue;
    }
    const titleWordsByColumn = splitTitleWordsByColumn(
      titleLine,
      centers.length,
    );
    for (let column = 0; column < centers.length; column += 1) {
      const words = titleWordsByColumn[column];
      const title = cleanCandidateTitle(words.map((word) => word.text).join(""));
      const dedupeKey = normalizeDedupeKey(title);
      if (!title || !dedupeKey || seen.has(dedupeKey)) {
        continue;
      }

      const record = entry.records
        .map((candidate) => ({
          candidate,
          distance: Math.abs(
            bboxCenter(candidate.bbox) - centers[column],
          ),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
      const columnWidth = boundaries[column + 1] - boundaries[column];
      const progress =
        record && record.distance <= columnWidth * 0.45
          ? record.candidate
          : null;

      seen.add(dedupeKey);
      items.push({
        rawTitle: title,
        title,
        dedupeKey,
        confidence: weightedConfidence(words, titleLine.confidence),
        progress: progress
          ? {
              current: progress.current,
              total: progress.total,
              label: `${progress.current}集/${progress.total}集`,
            }
          : null,
        tutorialLike: TUTORIAL_PATTERN.test(title),
      });
    }
  }

  return items;
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLocaleLowerCase("zh-CN")
    .replace(/第[一二三四五六七八九十百\d]+季/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(value) {
  if (value.length < 2) {
    return [value];
  }
  const result = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}

function titleMatchScore(left, right) {
  const normalizedLeft = normalizeMatchText(left);
  const normalizedRight = normalizeMatchText(right);
  if (!normalizedLeft || !normalizedRight) {
    return 0;
  }
  if (normalizedLeft === normalizedRight) {
    return 1;
  }
  const shorter =
    normalizedLeft.length <= normalizedRight.length
      ? normalizedLeft
      : normalizedRight;
  const longer =
    shorter === normalizedLeft ? normalizedRight : normalizedLeft;
  if (longer.includes(shorter)) {
    return 0.9 + 0.1 * (shorter.length / longer.length);
  }

  const leftBigrams = bigrams(normalizedLeft);
  const rightCounts = new Map();
  for (const value of bigrams(normalizedRight)) {
    rightCounts.set(value, (rightCounts.get(value) || 0) + 1);
  }
  let matches = 0;
  for (const value of leftBigrams) {
    const remaining = rightCounts.get(value) || 0;
    if (remaining > 0) {
      matches += 1;
      rightCounts.set(value, remaining - 1);
    }
  }
  return (2 * matches) / (leftBigrams.length + bigrams(normalizedRight).length);
}

function scoreCandidates(title, candidates, progressTotal = 0) {
  return candidates
    .map((candidate, index) => {
      const matchScore = Number(
        titleMatchScore(title, candidate.title).toFixed(3),
      );
      const episodeMatch =
        progressTotal > 0 &&
        Number(candidate.episodeCount) === Number(progressTotal);
      return {
        ...candidate,
        matchScore,
        rankScore: matchScore + (episodeMatch ? 0.08 : 0),
        searchRank: index,
      };
    })
    .sort(
      (left, right) =>
        right.rankScore - left.rankScore ||
        right.matchScore - left.matchScore ||
        left.searchRank - right.searchRank,
    )
    .map(({ rankScore, searchRank, ...candidate }) => candidate)
    .slice(0, MAX_CANDIDATES);
}

function suggestedCandidate(item, candidates) {
  if (item.tutorialLike || item.confidence < 45 || !candidates.length) {
    return null;
  }
  const best = candidates[0];
  const threshold = item.confidence >= 70 ? 0.62 : 0.7;
  return best.matchScore >= threshold ? best : null;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => run(),
    ),
  );
  return results;
}

async function ensureLanguageDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hongguo-tessdata-"),
  );
  const languages = [
    ["chi_sim", path.join(DATA_ROOT, "chi_sim", "4.0.0_best_int", "chi_sim.traineddata.gz")],
    ["eng", path.join(DATA_ROOT, "eng", "4.0.0_best_int", "eng.traineddata.gz")],
  ];
  for (const [language, source] of languages) {
    const target = path.join(directory, `${language}.traineddata.gz`);
    try {
      await fs.symlink(source, target);
    } catch {
      await fs.copyFile(source, target);
    }
  }
  return directory;
}

function withTimeout(promise, timeoutMs, timeoutError) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError), timeoutMs);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class ScreenshotImportService {
  constructor({
    searchSeries = searchOfficialSeries,
    fetchDetail = fetchSeriesDetail,
    createOcrWorker = createWorker,
    now = () => new Date(),
    ocrTimeoutMs = OCR_TIMEOUT_MS,
    idleTimeoutMs = OCR_IDLE_MS,
    searchCacheMs = SEARCH_CACHE_MS,
    searchRetryDelayMs = SEARCH_RETRY_DELAY_MS,
    detailCacheMs = SERIES_DETAIL_CACHE_MS,
  } = {}) {
    this.searchSeries = searchSeries;
    this.fetchDetail = fetchDetail;
    this.createOcrWorker = createOcrWorker;
    this.now = now;
    this.ocrTimeoutMs = ocrTimeoutMs;
    this.idleTimeoutMs = idleTimeoutMs;
    this.searchCacheMs = searchCacheMs;
    this.searchRetryDelayMs = searchRetryDelayMs;
    this.detailCacheMs = detailCacheMs;
    this.worker = null;
    this.workerPromise = null;
    this.recognitionQueue = Promise.resolve();
    this.detailCache = new Map();
    this.detailPromises = new Map();
    this.searchCache = new Map();
    this.searchPromises = new Map();
    this.activeSearches = 0;
    this.searchWaiters = [];
    this.languageDirectory = null;
    this.idleTimer = null;
    this.activeAnalyses = 0;
    this.importing = false;
    this.stopped = false;
  }

  clearIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  scheduleIdleTermination() {
    this.clearIdleTimer();
    if (!this.worker || this.stopped) {
      return;
    }
    this.idleTimer = setTimeout(() => {
      void this.terminateWorker();
    }, this.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  async ensureWorker() {
    if (this.stopped) {
      throw new ScreenshotImportError(
        "截图识别服务已停止。",
        "SCREENSHOT_SERVICE_STOPPED",
        503,
      );
    }
    if (this.worker) {
      return this.worker;
    }
    if (this.workerPromise) {
      return this.workerPromise;
    }

    this.languageDirectory ||= await ensureLanguageDirectory();
    this.workerPromise = (async () => {
      const worker = await this.createOcrWorker(
        ["chi_sim", "eng"],
        OEM.LSTM_ONLY,
        {
          langPath: this.languageDirectory,
          cacheMethod: "none",
          gzip: true,
        },
      );
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
        user_defined_dpi: "96",
      });
      this.worker = worker;
      return worker;
    })();

    try {
      return await this.workerPromise;
    } catch (error) {
      this.worker = null;
      throw new ScreenshotImportError(
        `截图文字识别引擎启动失败：${error.message}`,
        "OCR_INITIALIZATION_FAILED",
        503,
      );
    } finally {
      this.workerPromise = null;
    }
  }

  async warmup() {
    this.clearIdleTimer();
    await this.ensureWorker();
    this.scheduleIdleTermination();
    return { ready: true };
  }

  async terminateWorker() {
    this.clearIdleTimer();
    const worker = this.worker;
    this.worker = null;
    this.workerPromise = null;
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }

  async recognizeNow(image) {
    const worker = await this.ensureWorker();
    const recognition = worker.recognize(
      image,
      {},
      { text: true, blocks: true },
    );
    recognition.catch(() => {});
    const timeoutError = new ScreenshotImportError(
      "截图识别超时，已停止本次识别。请裁切掉无关区域后重试。",
      "OCR_TIMEOUT",
      504,
    );
    try {
      const result = await withTimeout(
        recognition,
        this.ocrTimeoutMs,
        timeoutError,
      );
      return result.data;
    } catch (error) {
      await this.terminateWorker();
      if (error instanceof ScreenshotImportError) {
        throw error;
      }
      throw new ScreenshotImportError(
        `截图识别失败：${error.message}`,
        "OCR_FAILED",
        502,
      );
    }
  }

  async recognize(image) {
    const previous = this.recognitionQueue;
    let release;
    this.recognitionQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.recognizeNow(image);
    } finally {
      release();
    }
  }

  cachedDetail(seriesId) {
    const cached = this.detailCache.get(seriesId);
    if (!cached) {
      return null;
    }
    if (this.now().getTime() - cached.cachedAt > this.detailCacheMs) {
      this.detailCache.delete(seriesId);
      return null;
    }
    return cached.detail;
  }

  cachedSearch(query) {
    const cached = this.searchCache.get(query);
    if (!cached) {
      return null;
    }
    if (this.now().getTime() - cached.cachedAt > this.searchCacheMs) {
      this.searchCache.delete(query);
      return null;
    }
    return cached.results;
  }

  async acquireSearchSlot() {
    if (this.activeSearches < SEARCH_CONCURRENCY) {
      this.activeSearches += 1;
      return;
    }
    await new Promise((resolve) => this.searchWaiters.push(resolve));
  }

  releaseSearchSlot() {
    const next = this.searchWaiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeSearches = Math.max(0, this.activeSearches - 1);
  }

  async searchWithRetry(query) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.searchSeries(query);
      } catch (error) {
        if (attempt > 0 || !isRetryableSearchError(error)) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, this.searchRetryDelayMs),
        );
      }
    }
  }

  async getSearchResults(query) {
    const normalizedQuery = normalizeWhitespace(query);
    const cached = this.cachedSearch(normalizedQuery);
    if (cached) {
      return cached;
    }
    if (this.searchPromises.has(normalizedQuery)) {
      return this.searchPromises.get(normalizedQuery);
    }

    const promise = (async () => {
      await this.acquireSearchSlot();
      try {
        const results = await this.searchWithRetry(normalizedQuery);
        this.searchCache.set(normalizedQuery, {
          results,
          cachedAt: this.now().getTime(),
        });
        return results;
      } finally {
        this.releaseSearchSlot();
      }
    })();
    this.searchPromises.set(normalizedQuery, promise);
    try {
      return await promise;
    } finally {
      this.searchPromises.delete(normalizedQuery);
    }
  }

  async getSeriesDetail(seriesId) {
    const normalizedSeriesId = String(seriesId || "");
    const cached = this.cachedDetail(normalizedSeriesId);
    if (cached) {
      return cached;
    }
    if (this.detailPromises.has(normalizedSeriesId)) {
      return this.detailPromises.get(normalizedSeriesId);
    }

    const promise = (async () => {
      const result = await this.fetchDetail(normalizedSeriesId);
      const detail = result?.detail || result;
      if (!detail?.seriesId) {
        throw new Error("红果详情没有返回有效剧集信息。");
      }
      this.detailCache.set(normalizedSeriesId, {
        detail,
        cachedAt: this.now().getTime(),
      });
      return detail;
    })();
    this.detailPromises.set(normalizedSeriesId, promise);
    try {
      return await promise;
    } finally {
      this.detailPromises.delete(normalizedSeriesId);
    }
  }

  async enrichCandidate(candidate) {
    if (!candidate?.seriesId) {
      return candidate;
    }
    try {
      const detail = await this.getSeriesDetail(candidate.seriesId);
      return {
        ...candidate,
        seriesGroupId: detail.seriesGroupId || null,
        firstVisibleTime: detail.firstVisibleTime || null,
        detailUrl: detail.detailUrl || "",
      };
    } catch {
      return candidate;
    }
  }

  async searchForItem(item) {
    const query = [...item.title].slice(0, MAX_SEARCH_LENGTH).join("");
    try {
      const candidates = await this.getSearchResults(query);
      const scored = scoreCandidates(
        item.title,
        candidates,
        item.progress?.total,
      );
      const suggested = suggestedCandidate(item, scored);
      const groupAnchor =
        suggested ||
        (scored[0]?.matchScore >= 0.72 ? scored[0] : null);
      const anchorDetail = groupAnchor
        ? await this.enrichCandidate(groupAnchor)
        : null;
      const enrichedCandidates = anchorDetail?.seriesGroupId
        ? scored.map((candidate) =>
            candidate.seriesId === anchorDetail.seriesId
              ? {
                  ...candidate,
                  seriesGroupId: anchorDetail.seriesGroupId,
                  firstVisibleTime: anchorDetail.firstVisibleTime,
                  detailUrl: anchorDetail.detailUrl,
                }
              : candidate,
          )
        : scored;
      return {
        ...item,
        query,
        queryTruncated: [...query].length < [...item.title].length,
        candidates: enrichedCandidates,
        seriesGroupId: anchorDetail?.seriesGroupId || null,
        suggestedSeriesId: suggested?.seriesId || null,
        selectionReason: item.tutorialLike
          ? "疑似教程内容，默认不导入"
          : !enrichedCandidates.length
            ? "未找到官方候选，请修改标题后重试"
            : !suggested
              ? "匹配度不足，请核对后选择"
              : "已找到较可信的官方候选",
        searchError: null,
      };
    } catch (error) {
      return {
        ...item,
        query,
        queryTruncated: [...query].length < [...item.title].length,
        candidates: [],
        suggestedSeriesId: null,
        selectionReason: "官方搜索失败，请稍后修改标题重试",
        searchError: error.message,
      };
    }
  }

  async analyze(image, declaredType = "") {
    if (this.activeAnalyses >= MAX_ACTIVE_ANALYSES) {
      throw new ScreenshotImportError(
        "同时识别的截图过多，请稍等片刻。",
        "OCR_BUSY",
        429,
      );
    }
    const metadata = validateScreenshotImage(image, declaredType);
    this.activeAnalyses += 1;
    this.clearIdleTimer();
    try {
      const data = await this.recognize(image);
      const parsed = parseScreenshotOcr(data.blocks, {
        imageWidth: metadata.width,
      });
      if (!parsed.length) {
        throw new ScreenshotImportError(
          "没有识别到收藏卡片。请上传完整的“收藏”页截图，并保留下方剧名和集数。",
          "NO_SERIES_DETECTED",
          422,
        );
      }
      const items = await mapWithConcurrency(
        parsed,
        SEARCH_CONCURRENCY,
        (item) => this.searchForItem(item),
      );
      const uniqueItems = [];
      const bySeriesGroup = new Map();
      for (const item of items) {
        const seriesKey = item.seriesGroupId
          ? `group:${item.seriesGroupId}`
          : "";
        if (!seriesKey || !bySeriesGroup.has(seriesKey)) {
          uniqueItems.push(item);
          if (seriesKey) {
            bySeriesGroup.set(seriesKey, item);
          }
          continue;
        }

        const existing = bySeriesGroup.get(seriesKey);
        const knownCandidateIds = new Set(
          existing.candidates.map((candidate) => candidate.seriesId),
        );
        for (const candidate of item.candidates) {
          if (!knownCandidateIds.has(candidate.seriesId)) {
            existing.candidates.push(candidate);
            knownCandidateIds.add(candidate.seriesId);
          }
        }
        const existingSelected = existing.candidates.find(
          (candidate) => candidate.seriesId === existing.suggestedSeriesId,
        );
        const nextSelected = item.candidates.find(
          (candidate) => candidate.seriesId === item.suggestedSeriesId,
        );
        if (
          nextSelected &&
          (!existingSelected ||
            compareCandidatesByFreshness(nextSelected, existingSelected) < 0)
        ) {
          existing.title = item.title;
          existing.rawTitle = item.rawTitle;
          existing.progress = item.progress;
          existing.confidence = item.confidence;
          existing.suggestedSeriesId = item.suggestedSeriesId;
        }
      }
      return {
        image: metadata,
        items: uniqueItems,
        text: normalizeWhitespace(data.text || ""),
      };
    } finally {
      this.activeAnalyses -= 1;
      if (this.activeAnalyses === 0) {
        this.scheduleIdleTermination();
      }
    }
  }

  async search(query) {
    const results = await this.getSearchResults(query);
    if (!results.length) {
      return results;
    }
    const best = [...results].sort(
      (left, right) =>
        titleMatchScore(query, right.title) -
        titleMatchScore(query, left.title),
    )[0];
    const enriched = await this.enrichCandidate(best);
    return results.map((candidate) =>
      candidate.seriesId === enriched.seriesId ? enriched : candidate,
    );
  }

  async importSeriesIds(seriesIds, service) {
    if (this.importing) {
      throw new ScreenshotImportError(
        "已有导入任务正在执行，请等待完成。",
        "IMPORT_BUSY",
        429,
      );
    }
    if (!service) {
      throw new ScreenshotImportError(
        "追更服务未就绪。",
        "SERVICE_UNAVAILABLE",
        503,
      );
    }

    const normalized = [];
    for (const value of Array.isArray(seriesIds) ? seriesIds : []) {
      const seriesId = String(value || "").trim();
      if (!/^\d{8,25}$/.test(seriesId)) {
        throw new ScreenshotImportError(
          "导入列表中有格式不正确的剧集 ID。",
          "INVALID_SERIES_ID",
        );
      }
      if (!normalized.includes(seriesId)) {
        normalized.push(seriesId);
      }
    }
    if (!normalized.length) {
      throw new ScreenshotImportError(
        "请至少选择一部要导入的短剧。",
        "EMPTY_IMPORT_SELECTION",
      );
    }
    if (normalized.length > MAX_IMPORT_ITEMS) {
      throw new ScreenshotImportError(
        `一次最多导入 ${MAX_IMPORT_ITEMS} 部短剧。`,
        "IMPORT_LIMIT",
        413,
      );
    }

    this.importing = true;
    const outcomesBySeriesId = new Map();
    const subscriptions = new Map();
    try {
      const prepared = await mapWithConcurrency(
        normalized,
        SERIES_DETAIL_CONCURRENCY,
        async (seriesId) => {
          try {
            return {
              seriesId,
              detail: await this.getSeriesDetail(seriesId),
              error: null,
            };
          } catch (error) {
            outcomesBySeriesId.set(seriesId, {
              seriesId,
              status: "failed",
              subscriptionId: null,
              title: "",
              message: error?.message || "读取官方详情失败。",
            });
            return { seriesId, detail: null, error };
          }
        },
      );

      const groups = new Map();
      for (const item of prepared) {
        if (!item.detail) {
          continue;
        }
        const key = groupKeyForDetail(item.detail);
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key).push(item);
      }

      for (const group of groups.values()) {
        group.sort((left, right) =>
          compareCandidatesByFreshness(left.detail, right.detail),
        );
        const [primary, ...duplicates] = group;
        try {
          const result = await service.addSubscription(
            primary.seriesId,
            { detail: primary.detail },
          );
          subscriptions.set(result.subscriptionId, result.title);
          outcomesBySeriesId.set(primary.seriesId, {
            seriesId: primary.seriesId,
            status: "imported",
            subscriptionId: result.subscriptionId,
            title: result.title,
            message:
              result.action === "season_added"
                ? `已并入《${result.title}》的同一官方系列。`
                : `已开始追更《${result.title}》。`,
          });

          for (const duplicate of duplicates) {
            outcomesBySeriesId.set(duplicate.seriesId, {
              seriesId: duplicate.seriesId,
              status: "skipped",
              subscriptionId: result.subscriptionId,
              title: result.title,
              message: `与《${result.title}》属于同一官方系列，已自动合并。`,
            });
          }
        } catch (error) {
          const status =
            error?.code === "SUBSCRIPTION_EXISTS" ? "skipped" : "failed";
          const existingSubscriptionId =
            status === "skipped" ? error?.subscriptionId || null : null;
          const existingTitle =
            error?.seriesTitle || primary.detail.title;
          const message =
            error?.code === "SUBSCRIPTION_EXISTS"
              ? "这个系列已经在追更，已跳过。"
              : error?.message || "导入失败。";
          if (existingSubscriptionId) {
            subscriptions.set(
              existingSubscriptionId,
              existingTitle,
            );
          }
          outcomesBySeriesId.set(primary.seriesId, {
            seriesId: primary.seriesId,
            status,
            subscriptionId: existingSubscriptionId,
            title: existingTitle,
            message,
          });
          for (const duplicate of duplicates) {
            outcomesBySeriesId.set(duplicate.seriesId, {
              seriesId: duplicate.seriesId,
              status,
              subscriptionId: existingSubscriptionId,
              title: existingTitle,
              message,
            });
          }
        }
      }

      const subscriptionIds = [...subscriptions.keys()];
      let checkedCount = 0;
      let checkErrors = 0;
      if (subscriptionIds.length) {
        const checkOptions = {
          notify: false,
          discover: true,
          forceDiscovery: true,
          markUnread: false,
        };
        if (typeof service.checkSubscriptions === "function") {
          const checkResult = await service.checkSubscriptions(
            subscriptionIds,
            checkOptions,
          );
          checkedCount = checkResult.checkedSubscriptions || 0;
          checkErrors = checkResult.failedSubscriptions || 0;
        } else {
          for (const subscriptionId of subscriptionIds) {
            try {
              const result = await service.checkSubscription(
                subscriptionId,
                checkOptions,
              );
              checkedCount += 1;
              if (result.errors > 0) {
                checkErrors += 1;
              }
            } catch {
              checkErrors += 1;
            }
          }
        }
      }

      const outcomes = normalized.map(
        (seriesId) =>
          outcomesBySeriesId.get(seriesId) || {
            seriesId,
            status: "failed",
            subscriptionId: null,
            title: "",
            message: "未能完成导入。",
          },
      );
      return {
        outcomes,
        importedCount: outcomes.filter((item) => item.status === "imported")
          .length,
        skippedCount: outcomes.filter((item) => item.status === "skipped")
          .length,
        failedCount: outcomes.filter((item) => item.status === "failed")
          .length,
        subscriptionCount: subscriptions.size,
        checkedCount,
        checkErrors,
      };
    } finally {
      this.importing = false;
    }
  }

  async stop() {
    this.stopped = true;
    await this.terminateWorker();
    if (this.languageDirectory) {
      await fs.rm(this.languageDirectory, { recursive: true, force: true });
      this.languageDirectory = null;
    }
  }
}

export const __test = {
  detectImageType,
  imageDimensions,
  titleMatchScore,
  MAX_IMAGE_BYTES,
};
