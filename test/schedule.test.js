import { test } from "node:test";
import assert from "node:assert/strict";
import { regularOccurrences, weekday } from "../src/schedule.js";
import { computeStageDates, addDays, stageNo } from "../src/project-types.js";

test("weekday: 2026-10-08 は木曜", () => {
  assert.equal(weekday("2026-10-08"), 4);
});

test("毎週 火・金", () => {
  const got = regularOccurrences({ weekdays: [2, 5], time: "21:00", interval: 1, anchor: "2026-10-05" }, "2026-10-05", "2026-10-18");
  assert.deepEqual(got, ["2026-10-06T21:00", "2026-10-09T21:00", "2026-10-13T21:00", "2026-10-16T21:00"]);
});

test("隔週は開始日を含む週から数える", () => {
  const got = regularOccurrences({ weekdays: [3], time: "20:00", interval: 2, anchor: "2026-10-08" }, "2026-10-01", "2026-11-05");
  // 10/4〜10/10 の週が1回目 → 10/7, 10/21, 11/4
  assert.deepEqual(got, ["2026-10-07T20:00", "2026-10-21T20:00", "2026-11-04T20:00"]);
});

test("曜日か時刻がなければ空", () => {
  assert.deepEqual(regularOccurrences({ weekdays: [], time: "20:00", interval: 1, anchor: "2026-10-08" }, "2026-10-01", "2026-10-30"), []);
});

test("工程の期限：発表日が未定なら8週目末", () => {
  const s = computeStageDates("teigen", "2026-10-05", null);
  const by = Object.fromEntries(s.map((x) => [x.stage_no, x]));
  assert.equal(by[0].due_date, "2026-10-04");
  assert.equal(by[1].start_date, "2026-10-05");
  // マニュアル：リサーチは1〜2週目まるごと、施策は3〜5週目、発表準備は6〜8週目、修正は9〜12週目
  assert.equal(by[1].due_date, "2026-10-18");
  // 課題共有：資料は2週目（リサーチと並行）、共有は3週目のはじめ
  assert.equal(by[2].start_date, "2026-10-12");
  assert.equal(by[2].due_date, "2026-10-18");
  assert.equal(by[3].start_date, "2026-10-19");
  assert.equal(by[3].due_date, "2026-10-21");
  assert.equal(by[4].start_date, "2026-10-19");
  assert.equal(by[4].due_date, "2026-11-08");
  assert.equal(by[5].start_date, "2026-11-09");
  assert.equal(by[6].due_date, addDays("2026-10-05", 55));
  assert.equal(by[5].due_date, addDays("2026-10-05", 54));
  assert.equal(by[7].due_date, addDays("2026-10-05", 55 + 28));
  assert.equal(s.length, 8);
});

test("工程の期限：発表日が決まったらそこに合わせる", () => {
  const s = computeStageDates("teigen", "2026-10-05", "2026-12-10");
  const by = Object.fromEntries(s.map((x) => [x.stage_no, x]));
  assert.equal(by[5].due_date, "2026-12-09");
  assert.equal(by[6].start_date, "2026-12-10");
  assert.equal(by[7].start_date, "2026-12-11");
  assert.equal(by[7].due_date, "2027-01-07");
});

test("工程は役割（role）で探せる", () => {
  assert.equal(stageNo("teigen", "share"), 3);
  assert.equal(stageNo("teigen", "presentation"), 6);
  assert.equal(stageNo("teigen", "final"), 7);
});

test("工程の期限：部門の目安日程（管理者が変えたもの）を使う", () => {
  const custom = { stages: { 1: [0, 20], 5: [42, null] }, presentationDay: 62, finalDays: 21 };
  const s = computeStageDates("teigen", "2026-10-05", null, custom);
  const by = Object.fromEntries(s.map((x) => [x.stage_no, x]));
  assert.equal(by[1].due_date, addDays("2026-10-05", 20));
  assert.equal(by[5].start_date, addDays("2026-10-05", 42));
  assert.equal(by[6].start_date, addDays("2026-10-05", 62));
  assert.equal(by[7].due_date, addDays("2026-10-05", 62 + 21));
  // 変えていない工程は既定のまま
  assert.equal(by[4].due_date, "2026-11-08");
});
