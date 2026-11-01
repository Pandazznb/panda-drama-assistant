import fs from "node:fs/promises";
import path from "node:path";
import {
  createId,
  isPlainObject,
  nowIso,
  parseTimestamp,
} from "./utils.js";

export const SYSTEM_LOG_TIME_ZONE = "Asia/Shanghai";
export const SYSTEM_LOG_MAX_FILE_BYTES = 1024 * 1024;

const LOG_FILE_PATTERN =
  /^system-(\d{4}-\d{2}-\d{2})-(\d{4})\.jsonl$/;
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SYSTEM_LOG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const SENSITIVE_KEY_PATTERN =
  /cookie|authorization|token|password|passwd|secret|session|verification.?code|sms.?code|mobile|phone|proxy.?url/i;
const LOG_LEVELS = new Set(["info", "success", "warning", "error"]);

export function systemLogDateKey(value) {
  const date = new Date(parseTimestamp(value) || nowIso());
  const parts = Object.fromEntries(
    dateKeyFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function sanitizeSystemLogText(value) {
  let text = String(value ?? "");
  text = text.replace(
    /\b(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi,
    "$1[已隐藏凭据]@",
  );
  text = text.replace(
    /([?&](?:access_?token|auth_?token|token|key|secret|password|session|sessionid|code)=)[^&#\s]*/gi,
    "$1[已隐藏]",
  );
  text = text.replace(
    /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
    "Bearer [已隐藏]",
  );
  text = text.replace(
    /(?<![A-Za-z0-9_])(?:cookie|authorization|auth_?token|access_?token|token|password|passwd|secret|sessionid|session|sms_?code|verification_?code|验证码|短信验证码)(?![A-Za-z0-9_])\s*[:=：]\s*[^\s,，;；]+/gi,
    (match, offset, input) => {
      const separator = match.includes("：")
        ? "："
        : match.includes("=")
          ? "="
          : ":";
      const label = match.slice(0, match.search(/[:=：]/));
      return `${label}${separator}[已隐藏]`;
    },
  );
  text = text.replace(
    /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g,
    "[手机号已隐藏]",
  );
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

export function sanitizeSystemLogMetadata(metadata) {
  if (!isPlainObject(metadata)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(String(key)))
      .slice(0, 20)
      .map(([key, value]) => [
        String(key).slice(0, 80),
        typeof value === "string"
          ? sanitizeSystemLogText(value).slice(0, 500)
          : typeof value === "number" || typeof value === "boolean"
            ? value
            : null,
      ])
      .filter(([, value]) => value !== null),
  );
}

function normalizedSystemLog(entry) {
  if (!isPlainObject(entry) || !entry.action || !entry.message) {
    return null;
  }
  return {
    id: String(entry.id || createId("sys_")),
    category: sanitizeSystemLogText(
      entry.category || "system",
    ).slice(0, 40),
    action: sanitizeSystemLogText(entry.action).slice(0, 100),
    level: LOG_LEVELS.has(entry.level)
      ? entry.level
      : "info",
    message: sanitizeSystemLogText(entry.message).slice(0, 2000),
    metadata: sanitizeSystemLogMetadata(entry.metadata),
    createdAt: parseTimestamp(entry.createdAt)
      ? new Date(parseTimestamp(entry.createdAt)).toISOString()
      : nowIso(),
  };
}

function logFileName(dateKey, part) {
  return `system-${dateKey}-${String(part).padStart(4, "0")}.jsonl`;
}

export class SystemLogStore {
  constructor(
    directory,
    { maxFileBytes = SYSTEM_LOG_MAX_FILE_BYTES } = {},
  ) {
    this.directory = path.resolve(directory);
    this.maxFileBytes = Math.max(256, Number(maxFileBytes));
    this.initialized = false;
    this.initialization = null;
    this.entriesById = new Map();
    this.days = new Map();
    this.filePaths = new Set();
    this.appendQueue = Promise.resolve();
  }

  async init() {
    if (this.initialized) {
      return;
    }
    if (!this.initialization) {
      this.initialization = this.load();
    }
    await this.initialization;
  }

  async load() {
    await fs.mkdir(this.directory, {
      recursive: true,
      mode: 0o700,
    });
    const entries = await fs.readdir(this.directory, {
      withFileTypes: true,
    });
    const files = entries
      .filter(
        (entry) =>
          entry.isFile() && LOG_FILE_PATTERN.test(entry.name),
      )
      .map((entry) => entry.name)
      .sort();

    for (const fileName of files) {
      const match = fileName.match(LOG_FILE_PATTERN);
      const dateKey = match[1];
      const part = Number(match[2]);
      const filePath = path.join(this.directory, fileName);
      const [content, stat] = await Promise.all([
        fs.readFile(filePath, "utf8"),
        fs.stat(filePath),
      ]);
      this.filePaths.add(filePath);
      const dayState = this.days.get(dateKey) || {
        maxPart: 0,
        sizes: new Map(),
      };
      dayState.maxPart = Math.max(dayState.maxPart, part);
      dayState.sizes.set(part, stat.size);
      this.days.set(dateKey, dayState);

      for (const line of content.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        try {
          const log = normalizedSystemLog(JSON.parse(line));
          if (log && !this.entriesById.has(log.id)) {
            this.entriesById.set(log.id, {
              ...log,
              logFile: fileName,
            });
          }
        } catch {
          // A partial final line can remain after an interrupted disk write.
        }
      }
    }
    this.initialized = true;
  }

  async append(entries) {
    const list = Array.isArray(entries) ? entries : [entries];
    const operation = this.appendQueue.then(async () => {
      await this.init();
      const written = [];
      for (const input of list) {
        const log = normalizedSystemLog(input);
        if (!log || this.entriesById.has(log.id)) {
          continue;
        }
        written.push(await this.appendEntry(log));
      }
      return written;
    });
    this.appendQueue = operation.catch(() => {});
    return operation;
  }

  async appendEntry(log) {
    const dateKey = systemLogDateKey(log.createdAt);
    const dayState = this.days.get(dateKey) || {
      maxPart: 0,
      sizes: new Map(),
    };
    let part = Math.max(1, dayState.maxPart);
    let fileName = logFileName(dateKey, part);
    let filePath = path.join(this.directory, fileName);
    let size = dayState.sizes.get(part);
    if (size === undefined) {
      try {
        size = (await fs.stat(filePath)).size;
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
        size = 0;
      }
      dayState.sizes.set(part, size);
    }

    const line = `${JSON.stringify(log)}\n`;
    const lineBytes = Buffer.byteLength(line);
    if (size > 0 && size + lineBytes > this.maxFileBytes) {
      part += 1;
      fileName = logFileName(dateKey, part);
      filePath = path.join(this.directory, fileName);
      size = 0;
    }

    await fs.appendFile(filePath, line, {
      encoding: "utf8",
      mode: 0o600,
      flag: "a",
    });
    dayState.maxPart = Math.max(dayState.maxPart, part);
    dayState.sizes.set(part, size + lineBytes);
    this.days.set(dateKey, dayState);
    this.filePaths.add(filePath);
    const stored = {
      ...log,
      logFile: fileName,
    };
    this.entriesById.set(log.id, stored);
    return stored;
  }

  async readPage({ offset = 0, limit = 200 } = {}) {
    await this.init();
    await this.appendQueue;
    const entries = [...this.entriesById.values()].sort((left, right) => {
      const timeDifference =
        (parseTimestamp(right.createdAt) || 0) -
        (parseTimestamp(left.createdAt) || 0);
      return timeDifference || right.id.localeCompare(left.id);
    });
    const safeOffset = Math.max(0, Number(offset) || 0);
    const safeLimit = Math.max(1, Number(limit) || 200);
    return {
      entries: entries.slice(safeOffset, safeOffset + safeLimit),
      total: entries.length,
      fileCount: this.filePaths.size,
      newestAt: entries[0]?.createdAt || null,
      oldestAt: entries.at(-1)?.createdAt || null,
      maxFileBytes: this.maxFileBytes,
      timeZone: SYSTEM_LOG_TIME_ZONE,
    };
  }

  async readAllFiles() {
    await this.init();
    await this.appendQueue;
    const fileNames = [...this.filePaths]
      .map((filePath) => path.basename(filePath))
      .filter((fileName) => LOG_FILE_PATTERN.test(fileName))
      .sort();
    if (!fileNames.length) {
      return null;
    }
    const contents = await Promise.all(
      fileNames.map((fileName) =>
        fs.readFile(path.join(this.directory, fileName)),
      ),
    );
    return {
      fileName: "hongguo-system-actions-all.jsonl",
      fileCount: fileNames.length,
      content: Buffer.concat(contents),
    };
  }
}
