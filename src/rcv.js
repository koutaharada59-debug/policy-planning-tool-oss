// RCV（ランク付け投票）の開票。希望PJアンケートの実装を移植
//
// ballots: 1人1票。希望の順に並べたもの。要素は候補ID、または同率の候補IDの配列
//          （例：[["A", "B"], "C"] = AとBが同率で第1希望、Cが第2希望）。
//          希望PJアンケートで順位を付ける前に選んだ希望は「同率」として扱う
// order:   掲載順の候補ID。最下位が同数のときの最後の決め手に使う
// 1位を決めたら、そのPJを候補から外してもう一度開票する（逐次IRV）。票は各自の次の希望へ移る

const EPS = 1e-9;
const round4 = (n) => Math.round(n * 10000) / 10000;
const groupsOf = (ballot) => ballot.map((g) => (Array.isArray(g) ? g : [g]));

export function rcvResults(ballots, order, seats) {
  const grouped = ballots.map(groupsOf);
  const winners = [];
  let candidates = order.slice();
  while (winners.length < seats && candidates.length) {
    const result = runIrv(grouped, candidates, order);
    if (!result.winner) break;
    winners.push(result);
    candidates = candidates.filter((c) => c !== result.winner);
  }
  return winners;
}

// 1人の1票の行き先。まだ残っている希望のうち最上位のグループに、均等に分ける
function allocate(ballot, alive) {
  for (const group of ballot) {
    const live = group.filter((c) => alive.has(c));
    if (live.length) return new Map(live.map((c) => [c, 1 / live.length]));
  }
  return new Map();
}

// 即時決選投票（IRV）。過半数を取る候補が出るまで、最下位を1つずつ除外して票を次の希望へ移す。
// 同率の票は均等に分けて数えるので、票数が小数になることがある
export function runIrv(ballots, candidates, order) {
  const grouped = ballots.map(groupsOf);
  let remaining = candidates.slice();
  const rounds = [];
  const history = []; // 同数の最下位を決めるために、過去ラウンドの票数を覚えておく
  for (;;) {
    const alive = new Set(remaining);
    const tallies = Object.fromEntries(remaining.map((c) => [c, 0]));
    const shares = grouped.map((b) => allocate(b, alive));
    for (const share of shares) for (const [c, w] of share) tallies[c] += w;
    for (const c of remaining) tallies[c] = round4(tallies[c]);
    // 1人の票は「まるごと残っている」か「次の希望がなく順位切れ」のどちらかなので、有効票は必ず整数
    const exhausted = shares.filter((s) => !s.size).length;
    const active = grouped.length - exhausted;
    const majority = Math.floor(active / 2) + 1;
    const round = { tallies, active, exhausted, majority };
    if (active === 0) {
      rounds.push(round);
      return { winner: null, rounds };
    }
    const leader = remaining.reduce((a, b) => (tallies[b] > tallies[a] + EPS ? b : a));
    if (tallies[leader] * 2 > active + EPS || remaining.length === 1) {
      rounds.push({ ...round, winner: leader });
      return { winner: leader, rounds };
    }

    // 0票の候補はまとめて除外。そうでなければ最下位を1つ除外する
    let tieBreak = false;
    let eliminated = remaining.filter((c) => tallies[c] < EPS);
    if (!eliminated.length) {
      const min = Math.min(...remaining.map((c) => tallies[c]));
      let tied = remaining.filter((c) => tallies[c] - min < EPS);
      tieBreak = tied.length > 1;
      for (let h = history.length - 1; h >= 0 && tied.length > 1; h--) {
        const low = Math.min(...tied.map((c) => history[h][c]));
        tied = tied.filter((c) => history[h][c] - low < EPS);
      }
      // それでも同数なら、掲載順で後ろのものを除外する
      tied.sort((a, b) => order.indexOf(b) - order.indexOf(a));
      eliminated = [tied[0]];
    }

    // 除外したPJに入っていた分が、次の希望のどこへ移ったか
    const next = new Set(remaining.filter((c) => !eliminated.includes(c)));
    const transfers = {};
    grouped.forEach((b, i) => {
      const before = shares[i];
      const lost = eliminated.filter((e) => before.get(e));
      if (!lost.length) return;
      const after = allocate(b, next);
      const moved = lost.reduce((a, e) => a + before.get(e), 0);
      // 複数のPJを同時に除外したときは、元の配分の比で分ける
      for (const e of lost) {
        const ratio = before.get(e) / moved;
        transfers[e] ||= {};
        let given = 0;
        for (const [to, w] of after) {
          const gain = (w - (before.get(to) || 0)) * ratio;
          if (gain > EPS) {
            transfers[e][to] = (transfers[e][to] || 0) + gain;
            given += gain;
          }
        }
        const rest = before.get(e) - given;
        if (rest > EPS) transfers[e].exhausted = (transfers[e].exhausted || 0) + rest;
      }
    });
    for (const t of Object.values(transfers)) for (const k of Object.keys(t)) t[k] = round4(t[k]);
    rounds.push({ ...round, eliminated, transfers, tieBreak });
    history.push(tallies);
    remaining = [...next];
  }
}

// 人員の割り振り案：各投票者を、選ばれたPJのうち本人の希望順位がいちばん高いものに入れる
// （同率の中に選ばれたPJが複数あるときは、掲載順で先のもの）
export function suggestAssignment(ballotsByUser, winners) {
  const win = new Set(winners);
  const out = Object.fromEntries(winners.map((w) => [w, []]));
  const unassigned = [];
  for (const [userId, ballot] of Object.entries(ballotsByUser)) {
    let pick;
    for (const group of groupsOf(ballot)) {
      pick = winners.find((w) => group.includes(w));
      if (pick !== undefined) break;
    }
    if (pick === undefined) unassigned.push(userId);
    else out[pick].push(userId);
  }
  return { byWinner: out, unassigned };
}
