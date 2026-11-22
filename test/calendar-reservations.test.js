import assert from "node:assert/strict";
import test from "node:test";
import {
  parseReservationExpectedDate,
  reservationPlaceholderId,
} from "../public/calendar-reservations.js";

test("reservation expected dates use an explicit month and day", () => {
  assert.equal(
    parseReservationExpectedDate("预计11月24日上线", "2026-11-23"),
    "2026-11-24",
  );
  assert.equal(
    parseReservationExpectedDate("预计12月15日上线", "2026-11-23"),
    "2026-12-15",
  );
});

test("reservation expected dates without a year roll across New Year", () => {
  assert.equal(
    parseReservationExpectedDate("预计1月2日上线", "2026-12-20"),
    "2027-01-02",
  );
});

test("reservation expected dates accept an explicit year and full-width digits", () => {
  assert.equal(
    parseReservationExpectedDate("预计2027年1月2日上线", "2026-12-20"),
    "2027-01-02",
  );
  assert.equal(
    parseReservationExpectedDate("预计２０２６年１２月１５日上线", "2026-11-23"),
    "2026-12-15",
  );
});

test("reservation expected dates reject past, invalid, and vague text", () => {
  assert.equal(
    parseReservationExpectedDate("预计2025年12月15日上线", "2026-11-23"),
    null,
  );
  assert.equal(
    parseReservationExpectedDate("预计2月30日上线", "2026-11-23"),
    null,
  );
  assert.equal(
    parseReservationExpectedDate("即将上线，火速预约", "2026-11-23"),
    null,
  );
  assert.equal(parseReservationExpectedDate("", "2026-11-23"), null);
});

test("upcoming reservations link to placeholders by official item ID only", () => {
  assert.equal(
    reservationPlaceholderId("reservation:7706751373240437784"),
    "7706751373240437784",
  );
  assert.equal(
    reservationPlaceholderId("7706751373240437784"),
    null,
  );
  assert.equal(
    reservationPlaceholderId("满院亲戚全是上古大妖第八季"),
    null,
  );
});
