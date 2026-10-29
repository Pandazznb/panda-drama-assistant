import crypto from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix = "") {
  return `${prefix}${crypto.randomUUID()}`;
}

export function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/^\d+$/.test(text)) {
    const number = Number(text);
    return number < 1e12 ? number * 1000 : number;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

export function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

export function deepClone(value) {
  return structuredClone(value);
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

export function toSafeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
