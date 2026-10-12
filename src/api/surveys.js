// ホームに出すアンケート（管理者が追加する）：PJ決めアンケート／その他のアンケート（多数決・希望を聞く・RCV・STV）
import { HttpError, readJson, clean, required, int, oneOf, nowJst } from "../util.js";
import { requireAdmin } from "./common.js";
import { runIrv } from "../rcv.js";
import { stvResults } from "../stv.js";

export const routes = [
  ["GET", "/api/surveys", listSurveys],
  ["POST", "/api/surveys", createSurvey],
  ["GET", "/api/surveys/:id", getSurvey],
  ["PUT", "/api/surveys/:id/answer", saveAnswer],
  ["PATCH", "/api/surveys/:id", updateSurvey],
  ["DELETE", "/api/surveys/:id", deleteSurvey],
];

export const METHODS = { majority: "多数決", wish: "希望を聞く", rcv: "RCV（順位を付けて1つに決める）", stv: "STV（順位を付けて複数に決める）" };
const parse = (s) => ({ ...s, options: JSON.parse(s.options || "[]") });

async function loadSurvey(env, id) {
  const s = await env.DB.prepare("SELECT * FROM surveys WHERE id = ?").bind(id).first();
  if (!s) throw new HttpError(404, "アンケートが見つかりません");
  return parse(s);
}

// ホーム：受付中のアンケート（管理者には終わったものも）
async function listSurveys({ env, user }) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.kind, s.title, s.method, s.round_id, s.closed_at, s.created_at,
       EXISTS (SELECT 1 FROM survey_answers a WHERE a.survey_id = s.id AND a.user_id = ?) AS answered
     FROM surveys s WHERE s.closed_at IS NULL OR ? ORDER BY s.closed_at IS NOT NULL, s.created_at DESC LIMIT 30`
  ).bind(user.id, user.isAdmin ? 1 : 0).all();
  // PJ決めアンケート：投票済みかは、PJ決めの票で見る
  for (const s of results) {
    if (s.kind === "pj" && s.round_id) {
      s.answered = Boolean(await env.DB.prepare("SELECT 1 FROM seed_votes WHERE round_id = ? AND user_id = ? LIMIT 1").bind(s.round_id, user.id).first());
    }
  }
  return { surveys: results };
}

async function createSurvey({ request, env, user }) {
  requireAdmin(user, "アンケートを追加できるのは、管理者です");
  const body = await readJson(request);
  const now = Date.now();
  if (body.kind === "pj") {
    // PJ決めアンケート：受付中のPJ決め（募集回）に投票しに行く。なければ作る
    const { results } = await env.DB.prepare("SELECT * FROM seed_rounds WHERE archived = 0 AND source != 'survey' ORDER BY created_at DESC").all();
    let round = results.find((r) => !r.deadline || nowJst() < r.deadline);
    if (!round) {
      round = await env.DB.prepare("INSERT INTO seed_rounds (title, deadline, seats, source, created_by, created_at) VALUES ('PJ決め', NULL, 3, '', ?, ?) RETURNING *")
        .bind(user.id, now).first();
    }
    const open = await env.DB.prepare("SELECT id FROM surveys WHERE kind = 'pj' AND round_id = ? AND closed_at IS NULL").bind(round.id).first();
    if (open) return { id: open.id, round_id: round.id, existed: true };
    const row = await env.DB.prepare(
      "INSERT INTO surveys (kind, title, round_id, created_by, created_at) VALUES ('pj', 'PJ決めアンケート', ?, ?, ?) RETURNING id"
    ).bind(round.id, user.id, now).first();
    return { id: row.id, round_id: round.id };
  }
  const method = oneOf(body.method, Object.keys(METHODS), "決め方");
  const options = [...new Set((Array.isArray(body.options) ? body.options : []).map((o) => clean(o, 80)).filter(Boolean))].slice(0, 30);
  if (options.length < 2) throw new HttpError(400, "選択肢を2つ以上入れてください");
  const seats = method === "stv" ? int(body.seats, { min: 1, max: options.length - 1, fallback: 2, label: "決める数" }) : 1;
  const row = await env.DB.prepare(
    "INSERT INTO surveys (kind, title, description, method, options, seats, created_by, created_at) VALUES ('other', ?, ?, ?, ?, ?, ?, ?) RETURNING id"
  ).bind(required(body.title, 80, "アンケートの名前"), clean(body.description, 1000), method, JSON.stringify(options), seats, user.id, now).first();
  return { id: row.id };
}

async function getSurvey({ env, user, params }) {
  const s = await loadSurvey(env, params.id);
  const mine = await env.DB.prepare("SELECT answer FROM survey_answers WHERE survey_id = ? AND user_id = ?").bind(s.id, user.id).first();
  const { results } = await env.DB.prepare(
    "SELECT a.user_id, a.answer, a.updated_at, u.name, u.avatar FROM survey_answers a LEFT JOIN users u ON u.id = a.user_id WHERE a.survey_id = ? ORDER BY a.updated_at"
  ).bind(s.id).all();
  const answers = results.map((r) => ({ ...r, answer: JSON.parse(r.answer) }));
  // 結果：管理者はいつでも、みんなは締め切ったあと。だれが何に入れたかは管理者だけ
  const showResults = user.isAdmin || Boolean(s.closed_at);
  return {
    survey: s,
    mine: mine ? JSON.parse(mine.answer) : null,
    count: answers.length,
    results: showResults ? tallySurvey(s, answers.map((a) => a.answer)) : null,
    answers: user.isAdmin ? answers.map((a) => ({ name: a.name, avatar: a.avatar, user_id: a.user_id, picks: a.answer.picks, comment: a.answer.comment || "", updated_at: a.updated_at })) : null,
    canManage: user.isAdmin,
  };
}

// 開票：多数決・希望はそれぞれの票数、RCVは逐次の決選、STVは当選者と各ラウンド
export function tallySurvey(s, answers) {
  const ids = s.options.map((_, i) => String(i));
  const counts = ids.map(() => 0);
  for (const a of answers) {
    const picks = s.method === "majority" ? a.picks.slice(0, 1) : s.method === "wish" ? a.picks : a.picks.slice(0, 1);
    for (const p of picks) if (counts[p] !== undefined) counts[p] += 1;
  }
  const out = { counts, total: answers.length, comments: s.method === "wish" ? answers.map((a) => a.comment).filter(Boolean) : [] };
  const ballots = answers.map((a) => a.picks.map(String));
  if (s.method === "rcv" && ballots.length) {
    const r = runIrv(ballots, ids, ids);
    out.winners = r.winner ? [Number(r.winner)] : [];
    out.rounds = r.rounds.map((x) => ({ tallies: x.tallies, eliminated: x.eliminated, winner: x.winner, majority: x.majority }));
  } else if (s.method === "stv" && ballots.length) {
    const r = stvResults(ballots, ids, s.seats);
    out.winners = r.elected.map(Number);
    out.quota = r.quota;
    out.rounds = r.rounds;
  } else {
    const max = Math.max(0, ...counts);
    out.winners = max ? counts.flatMap((c, i) => (c === max ? [i] : [])) : [];
  }
  return out;
}

async function saveAnswer({ request, env, user, params }) {
  const s = await loadSurvey(env, params.id);
  if (s.kind !== "other") throw new HttpError(400, "PJ決めアンケートは、PJ決めの画面で投票してください");
  if (s.closed_at) throw new HttpError(400, "このアンケートは締め切りました");
  const body = await readJson(request);
  const picks = [...new Set((Array.isArray(body.picks) ? body.picks : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 0 && n < s.options.length);
  if (!picks.length) throw new HttpError(400, s.method === "majority" ? "1つ選んでください" : "1つ以上選んでください");
  if (s.method === "majority" && picks.length !== 1) throw new HttpError(400, "選べるのは1つです");
  const answer = JSON.stringify({ picks, comment: s.method === "wish" ? clean(body.comment, 500) : "" });
  await env.DB.prepare(
    `INSERT INTO survey_answers (survey_id, user_id, answer, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (survey_id, user_id) DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at`
  ).bind(s.id, user.id, answer, Date.now()).run();
  return { ok: true };
}

// 締め切る・再開する（管理者）
async function updateSurvey({ request, env, user, params }) {
  requireAdmin(user, "アンケートを締め切れるのは、管理者です");
  const s = await loadSurvey(env, params.id);
  const body = await readJson(request);
  await env.DB.prepare("UPDATE surveys SET closed_at = ? WHERE id = ?").bind(body.closed ? s.closed_at || Date.now() : null, s.id).run();
  return { ok: true };
}

async function deleteSurvey({ env, user, params }) {
  requireAdmin(user, "アンケートを削除できるのは、管理者です");
  const s = await loadSurvey(env, params.id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM survey_answers WHERE survey_id = ?").bind(s.id),
    env.DB.prepare("DELETE FROM surveys WHERE id = ?").bind(s.id),
  ]);
  return { ok: true };
}
