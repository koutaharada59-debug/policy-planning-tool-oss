// STV（単記移譲式投票）の開票：複数の当選者を決める
//
// ballots: 1人1票。希望の順に並べた候補IDの配列（例：["A", "C", "B"]）
// order:   掲載順の候補ID（同数のときの最後の決め手）
// seats:   当選者の数
//
// ドループ基数（有効票 ÷ (当選者数 + 1) を切り捨てて + 1）に届いた候補が当選。
// 当選者の余った票は、その候補に入った票の「次の希望」へ、割合を小さくして移す（グレゴリー方式）。
// 誰も基数に届かないときは、最下位の候補を外して、その票を次の希望へ移す。
const EPS = 1e-9;
const round4 = (n) => Math.round(n * 10000) / 10000;

export function stvResults(ballots, order, seats) {
  const papers = ballots.filter((b) => b.length).map((b) => ({ prefs: b, weight: 1 }));
  const quota = Math.floor(papers.length / (seats + 1)) + 1;
  let hopeful = order.slice();
  const elected = [];
  const rounds = [];
  const history = [];
  // 1枚の票が、いま数えられる候補（残っている候補のうち一番上の希望）
  const top = (p) => p.prefs.find((c) => hopeful.includes(c));

  while (elected.length < seats && hopeful.length) {
    // 残りの候補が残りの席と同じ数なら、全員当選
    if (hopeful.length <= seats - elected.length) {
      const tallies = tally(papers, hopeful, top);
      rounds.push({ tallies, quota, elected: hopeful.slice(), note: "残りの候補が残りの席の数になったので当選" });
      elected.push(...hopeful);
      break;
    }
    const tallies = tally(papers, hopeful, top);
    history.push(tallies);
    const reached = hopeful.filter((c) => tallies[c] + EPS >= quota).sort((a, b) => tallies[b] - tallies[a]);
    if (reached.length) {
      // 当選：余りの票を、次の希望へ移す
      for (const c of reached) {
        elected.push(c);
        const surplus = tallies[c] - quota;
        const ratio = tallies[c] > 0 ? surplus / tallies[c] : 0;
        for (const p of papers) if (top(p) === c) p.weight *= ratio;
      }
      hopeful = hopeful.filter((c) => !reached.includes(c));
      rounds.push({ tallies, quota, elected: reached });
      continue;
    }
    // 誰も届かない：最下位を外す（同数なら前のラウンドで少ない方、それでも同じなら掲載順で後ろ）
    const min = Math.min(...hopeful.map((c) => tallies[c]));
    let low = hopeful.filter((c) => Math.abs(tallies[c] - min) < EPS);
    for (let i = history.length - 2; low.length > 1 && i >= 0; i--) {
      const m = Math.min(...low.map((c) => history[i][c] ?? 0));
      low = low.filter((c) => Math.abs((history[i][c] ?? 0) - m) < EPS);
    }
    const out = low.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
    hopeful = hopeful.filter((c) => c !== out);
    rounds.push({ tallies, quota, eliminated: out });
  }
  return { elected: elected.slice(0, seats), quota, rounds, valid: papers.length };
}

function tally(papers, hopeful, top) {
  const t = Object.fromEntries(hopeful.map((c) => [c, 0]));
  for (const p of papers) {
    const c = top(p);
    if (c) t[c] += p.weight;
  }
  for (const c of hopeful) t[c] = round4(t[c]);
  return t;
}
