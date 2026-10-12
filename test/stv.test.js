import { test } from "node:test";
import assert from "node:assert/strict";
import { stvResults } from "../src/stv.js";
import { tallySurvey } from "../src/api/surveys.js";

test("STV：基数に届いた候補が当選し、余った票が次の希望へ移る", () => {
  // 10票・2席 → 基数 4。Aが6票で当選、余り2票（1/3ずつ）がBへ。Bは 2+2 = 4 で当選
  const ballots = [
    ...Array(6).fill(["A", "B"]),
    ...Array(2).fill(["B"]),
    ...Array(2).fill(["C"]),
  ];
  const r = stvResults(ballots, ["A", "B", "C"], 2);
  assert.equal(r.quota, 4);
  assert.deepEqual(r.elected, ["A", "B"]);
});

test("STV：誰も届かなければ最下位を外して票を移す", () => {
  const ballots = [["A"], ["A"], ["B"], ["B"], ["C", "A"]];
  const r = stvResults(ballots, ["A", "B", "C"], 1);
  assert.deepEqual(r.elected, ["A"]);
  assert.equal(r.rounds[0].eliminated, "C");
});

test("アンケートの開票：多数決・希望・RCV", () => {
  const s = (method) => ({ method, options: ["x", "y", "z"], seats: 1 });
  assert.deepEqual(tallySurvey(s("majority"), [{ picks: [1] }, { picks: [1] }, { picks: [0] }]).winners, [1]);
  const wish = tallySurvey(s("wish"), [{ picks: [0, 2], comment: "どれでも" }, { picks: [2] }]);
  assert.deepEqual(wish.counts, [1, 0, 2]);
  assert.deepEqual(wish.comments, ["どれでも"]);
  assert.deepEqual(tallySurvey(s("rcv"), [{ picks: [0, 1] }, { picks: [1] }, { picks: [2, 1] }]).winners, [1]);
});
