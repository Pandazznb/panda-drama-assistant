import fs from "node:fs/promises";
import path from "node:path";
import { isPlainObject, nowIso, parseTimestamp } from "./utils.js";

export const EVENT_LOG_TIME_ZONE = "Asia/Shanghai";
export const EVENT_LOG_MAX_FILE_BYTES = 1024 * 1024;

const LOG_FILE_PATTERN =
  /^events-(\d{4}-\d{2}-\d{2})-(\d{4})\.jsonl$/;
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: EVENT_LOG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function eventLogDateKey(value) {
  const date = new Date(parseTimestamp(value) || nowIso());
  const parts = Object.fromEntries(
    dateKeyFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizedLogEvent(event) {
  if (!isPlainObject(event) || !event.id || !event.type) {
    return null;
  }
  return {
    ...event,
    id: String(event.id),
    type: String(event.type),
    createdAt: parseTimestamp(event.createdAt)
      ? new Date(parseTimestamp(event.createdAt)).toISOString()
      : nowIso(),
  };
}

function logFileName(dateKey, part) {
  return `events-${dateKey}-${String(part).padStart(4, "0")}.jsonl`;
}

export class EventLogStore {
  constructor(
    directory,
    { maxFileBytes = EVENT_LOG_MAX_FILE_BYTES } = {},
  ) {
    this.directory = path.resolve(directory);
    this.maxFileBytes = Math.max(256, Number(maxFileBytes));
    this.initialized = false;
    this.initialization = null;
    this.eventsById = new Map();
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
          const event = normalizedLogEvent(JSON.parse(line));
          if (event && !this.eventsById.has(event.id)) {
            this.eventsById.set(event.id, {
              ...event,
              logFile: fileName,
            });
          }
        } catch {
          // A partial final line can occur after an interrupted disk write.
        }
      }
    }

    this.initialized = true;
  }

  async appendEvents(events) {
    const list = Array.isArray(events) ? events : [events];
    const operation = this.appendQueue.then(async () => {
      await this.init();
      for (const input of list) {
        const event = normalizedLogEvent(input);
        if (!event || this.eventsById.has(event.id)) {
          continue;
        }
        await this.appendEvent(event);
      }
    });
    this.appendQueue = operation.catch(() => {});
    return operation;
  }

  async appendEvent(event) {
    const dateKey = eventLogDateKey(event.createdAt);
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

    const line = `${JSON.stringify(event)}\n`;
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
    this.eventsById.set(event.id, {
      ...event,
      logFile: fileName,
    });
  }

  async readPage({ offset = 0, limit = 200 } = {}) {
    await this.init();
    await this.appendQueue;
    const events = [...this.eventsById.values()].sort((left, right) => {
      const timeDifference =
        (parseTimestamp(right.createdAt) || 0) -
        (parseTimestamp(left.createdAt) || 0);
      return timeDifference || right.id.localeCompare(left.id);
    });
    const safeOffset = Math.max(0, Number(offset) || 0);
    const safeLimit = Math.max(1, Number(limit) || 200);
    return {
      events: events.slice(safeOffset, safeOffset + safeLimit),
      total: events.length,
      fileCount: this.filePaths.size,
      newestAt: events[0]?.createdAt || null,
      oldestAt: events.at(-1)?.createdAt || null,
      maxFileBytes: this.maxFileBytes,
      timeZone: EVENT_LOG_TIME_ZONE,
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
      fileName: "hongguo-events-all.jsonl",
      fileCount: fileNames.length,
      content: Buffer.concat(contents),
    };
  }
}
