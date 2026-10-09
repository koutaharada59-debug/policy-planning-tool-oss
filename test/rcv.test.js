import { test } from "node:test";
import assert from "node:assert/strict";
import { rcvResults, runIrv, suggestAssignment } from "../src/rcv.js";

test("過半数があれば1回目で決まる", () => {
  const r = runIrv([[1, 2], [1], [2, 1]], [1, 2, 3], [1, 2, 3]);
  assert.equal(r.winner, 1);
  assert.equal(r.rounds.length, 1);
});

test("最下位を除外して次の希望へ移す", () => {
  // 1位票：A=2, B=2, C=1 → 0票なし。最下位Cを除外し、Cの票は第2希望Bへ → B=3
  const ballots = [["A"], ["A"], ["B"], ["B"], ["C", "B"]];
  const r = runIrv(ballots, ["A", "B", "C"], ["A", "B", "C"]);
  assert.equal(r.winner, "B");
  assert.deepEqual(r.rounds[0].eliminated, ["C"]);
  assert.deepEqual(r.rounds[0].transfers, { C: { B: 1 } });
});

test("逐次IRVで上位N件を決める", () => {
  const ballots = [["A", "B"], ["A", "C"], ["B", "A"], ["C", "B"], ["B", "C"]];
  const winners = rcvResults(ballots, ["A", "B", "C"], 2).map((w) => w.winner);
  assert.equal(winners.length, 2);
  assert.equal(new Set(winners).size, 2);
});

test("票がなければ決まらない", () => {
  assert.deepEqual(rcvResults([], ["A", "B"], 2), []);
});

test("同率の希望は均等に分けて数える（希望PJアンケートの順位なしの票）", () => {
  // 1人目はAとBが同率 → 0.5票ずつ。A=1.5, B=0.5, C=1 → 0票なし、最下位Bを除外 → 1人目の票は全部Aへ → A=2（過半数）
  const r = runIrv([[["A", "B"]], ["A"], ["C"]], ["A", "B", "C"], ["A", "B", "C"]);
  assert.equal(r.rounds[0].tallies.A, 1.5);
  assert.deepEqual(r.rounds[0].eliminated, ["B"]);
  assert.equal(r.winner, "A");
});

test("割り振り案：同率の中に選ばれたPJが複数あれば掲載順で先のもの", () => {
  const a = suggestAssignment({ u1: [["B", "A"]] }, ["A", "B"]);
  assert.deepEqual(a.byWinner, { A: ["u1"], B: [] });
});

test("割り振り案：選ばれたPJのうち本人の希望順位が高いものへ", () => {
  const a = suggestAssignment({ u1: ["C", "A", "B"], u2: ["B"], u3: ["C"] }, ["A", "B"]);
  assert.deepEqual(a.byWinner, { A: ["u1"], B: ["u2"] });
  assert.deepEqual(a.unassigned, ["u3"]);
});
