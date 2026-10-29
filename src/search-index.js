import { pinyin } from "pinyin-pro";

function normalizeSearchValue(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replaceAll("ü", "v")
    .replace(/[\s·・'’]+/g, "");
}

function uniqueNormalizedTitles(titles) {
  const seen = new Set();
  const normalized = [];
  for (const title of titles) {
    const value = normalizeSearchValue(title);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function pinyinParts(title) {
  return pinyin(title, {
    toneType: "none",
    multiple: true,
    nonZh: "consecutive",
    type: "array",
    v: true,
  })
    .map(normalizeSearchValue)
    .filter(Boolean);
}

export function buildSubscriptionSearchIndex(titles) {
  const normalizedTitles = uniqueNormalizedTitles(titles);
  const fullPinyin = [];
  const initials = [];

  for (const title of normalizedTitles) {
    const parts = pinyinParts(title);
    if (!parts.length) {
      continue;
    }
    fullPinyin.push(parts.join(""));
    initials.push(parts.map((part) => part[0]).join(""));
  }

  return {
    searchText: normalizedTitles.join(" "),
    searchPinyin: [...new Set(fullPinyin)].join(" "),
    searchInitials: [...new Set(initials)].join(" "),
  };
}
