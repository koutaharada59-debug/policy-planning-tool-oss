// 希望PJアンケートとの連動：アンケートのDB（SURVEY_DB）を読み、連動する募集回の種・投票・締め切りを合わせる。
// アンケート側には書き込まない。画面を開いたときに、前回から1分以上たっていれば読み直す
import { nowJst } from "./util.js";

const SYNC_INTERVAL_MS = 60 * 1000;

export function surveyLinked(env) {
  return Boolean(env.SURVEY_DB);
}

export async function syncSurveyRound(env, round, { force = false } = {}) {
  if (round.source !== "survey" || !env.SURVEY_DB) return round;
  if (!force && round.synced_at && Date.now() - round.synced_at < SYNC_INTERVAL_MS) return round;

  const survey = env.SURVEY_DB;
  const [projects, votes, voters, deadline] = await Promise.all([
    survey.prepare(
      `SELECT p.id, p.title, p.description, p.tag, p.icon, p.categories, p.created_by, u.name AS creator_name
       FROM projects p LEFT JOIN users u ON u.id = p.created_by ORDER BY p.created_at`
    ).all(),
    survey.prepare("SELECT user_id, project_id, rank FROM votes ORDER BY user_id, rank, created_at").all(),
    survey.prepare("SELECT id, name, avatar FROM users WHERE id IN (SELECT user_id FROM votes)").all(),
    survey.prepare("SELECT value FROM settings WHERE key = 'deadline'").first(),
  ]);
  const { results: seeds } = await env.DB.prepare(
    "SELECT id, external_id, title, description, tag, icon, categories, author_name, sort, project_id FROM seeds WHERE round_id = ?"
  ).bind(round.id).all();

  const now = Date.now();
  const stmts = [];
  const byExternal = new Map(seeds.filter((s) => s.external_id).map((s) => [s.external_id, s]));
  const byTitle = new Map(seeds.filter((s) => !s.external_id).map((s) => [s.title, s]));
  const seen = new Set();

  // 1) 選択肢 → 種（新しいものは追加、変わったものは更新）
  projects.results.forEach((p, i) => {
    const fields = {
      title: p.title, description: p.description || "", tag: p.tag || "", icon: p.icon || "🌱",
      categories: p.categories || "[]", author_name: p.created_by ? p.creator_name || "" : "", sort: i + 1,
    };
    // 以前アンケートから取り込んだ種（external_id なし）は、タイトルで突き合わせて結び付ける
    const cur = byExternal.get(p.id) || byTitle.get(p.title);
    if (!cur) {
      stmts.push(env.DB.prepare(
        `INSERT INTO seeds (round_id, external_id, title, description, tag, icon, categories, author_name, sort, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(round.id, p.id, fields.title, fields.description, fields.tag, fields.icon, fields.categories, fields.author_name, fields.sort, now, now));
      return;
    }
    seen.add(cur.id);
    const changed = cur.external_id !== p.id || Object.keys(fields).some((k) => String(cur[k]) !== String(fields[k]));
    if (changed) {
      stmts.push(env.DB.prepare(
        `UPDATE seeds SET external_id=?, title=?, description=?, tag=?, icon=?, categories=?, author_name=?, sort=?, updated_at=? WHERE id=?`
      ).bind(p.id, fields.title, fields.description, fields.tag, fields.icon, fields.categories, fields.author_name, fields.sort, now, cur.id));
    }
  });
  // アンケートから消えた選択肢は消す（PJにしたものは残す）
  for (const s of seeds) {
    if (!seen.has(s.id) && !s.project_id) stmts.push(env.DB.prepare("DELETE FROM seeds WHERE id = ?").bind(s.id));
  }

  // 2) 投票した人（ツールにまだログインしていない人も、名前を出せるように登録だけしておく）
  for (const u of voters.results) {
    stmts.push(env.DB.prepare("INSERT OR IGNORE INTO users (id, name, avatar, updated_at) VALUES (?, ?, ?, 0)").bind(u.id, u.name, u.avatar));
  }

  // 3) 締め切り（アンケートは UNIXミリ秒、こちらは日本時間 'YYYY-MM-DDTHH:MM'）
  const surveyDeadline = deadline ? nowJst(Number(deadline.value)) : null;
  stmts.push(env.DB.prepare("UPDATE seed_rounds SET deadline = ?, synced_at = ? WHERE id = ?").bind(surveyDeadline, now, round.id));
  await env.DB.batch(stmts);

  // 4) 投票：種のIDが決まってから、まるごと置き換える（順位 0 = 順位を付ける前の希望＝同率）
  const { results: linked } = await env.DB.prepare("SELECT id, external_id FROM seeds WHERE round_id = ? AND external_id IS NOT NULL").bind(round.id).all();
  const seedOf = new Map(linked.map((s) => [s.external_id, s.id]));
  const wanted = votes.results.filter((v) => seedOf.has(v.project_id)).map((v) => [v.user_id, seedOf.get(v.project_id), v.rank]);
  const { results: current } = await env.DB.prepare("SELECT user_id, seed_id, rank FROM seed_votes WHERE round_id = ? ORDER BY user_id, rank, seed_id").bind(round.id).all();
  const key = (rows) => rows.map((r) => r.join(":")).sort().join("|");
  if (key(wanted) !== key(current.map((r) => [r.user_id, r.seed_id, r.rank]))) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM seed_votes WHERE round_id = ?").bind(round.id),
      ...wanted.map(([uid, sid, rank]) =>
        env.DB.prepare("INSERT INTO seed_votes (round_id, user_id, seed_id, rank, created_at) VALUES (?, ?, ?, ?, ?)").bind(round.id, uid, sid, rank, now)),
    ]);
  }
  return { ...round, deadline: surveyDeadline, synced_at: now };
}
