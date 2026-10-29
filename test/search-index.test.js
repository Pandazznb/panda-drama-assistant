import assert from "node:assert/strict";
import test from "node:test";
import { buildSubscriptionSearchIndex } from "../src/search-index.js";

test("subscription search index includes normalized titles, full pinyin, and initials", () => {
  const index = buildSubscriptionSearchIndex([
    "万妖图录传第一季",
    "万妖图录传第六季",
    "万妖图录传第一季",
    "女主的旅行",
  ]);

  assert.deepEqual(index, {
    searchText: "万妖图录传第一季 万妖图录传第六季 女主的旅行",
    searchPinyin:
      "wanyaotuluchuandiyiji wanyaotuluchuandiliuji nvzhudelvxing",
    searchInitials: "wytlcdyj wytlcdlj nzdlx",
  });
});
