// 日程調整アンケート：定例でないPJで、次回のMTGの日程が決められないときに、候補の日時に ○△× で答えてもらう
// 作る・答える・決めるのは、PJのメンバー（と管理者）。決めると、その日時でMTGを作ってメンバーに知らせる
import { HttpError, readJson, clean, int, reqDateTime, shortDateTime, nowJst } from "../util.js";
import { loadProject, requireEditor } from "./common.js";
import { notifyProject } from "../notify.js";
import { refreshDiscord, hasDiscordPost, pollVersion } from "../discord-post.js";

export const routes = [
  ["GET", "/api/schedule-polls/mine", myPolls],
  ["GET", "/api/projects/:id/schedule-polls", listPolls],
  ["POST", "/api/projects/:id/schedule-polls", createPoll],
  ["GET", "/api/schedule-polls/:id", getPoll],
  ["PUT", "/api/schedule-polls/:id/answers", saveAnswers],
  ["POST", "/api/schedule-polls/:id/decide", decidePoll],
  ["DELETE", "/api/schedule-polls/:id", closePoll],
];

const ANSWERS = ["yes", "maybe", "no"];

async function loadPoll(env, id) {
  const poll = await env.DB.prepare("SELECT * FROM schedule_polls WHERE id = ?").bind(id).first();
  if (!poll) throw new HttpError(404, "日程調整アンケートが見つかりません");
  return poll;
}

// ホーム：自分のPJの受付中のアンケートのうち、まだ答えていないもの
async function myPolls({ env, user }) {
  const { results } = await env.DB.prepare(
    `SELECT sp.id, sp.project_id, p.name AS project_name FROM schedule_polls sp
     JOIN projects p ON p.id = sp.project_id
     JOIN project_members pm ON pm.project_id = sp.project_id AND pm.user_id = ?1
     WHERE sp.closed_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = sp.id AND a.user_id = ?1)
     ORDER BY sp.created_at DESC`
  ).bind(user.id).all();
  return { polls: results };
}

async function listPolls({ env, user, params }) {
  const project = await loadProject(env, params.id);
  const { results } = await env.DB.prepare(
    `SELECT sp.id, sp.created_at, sp.closed_at, sp.meeting_id,
       (SELECT COUNT(DISTINCT a.user_id) FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = sp.id) AS answered,
       EXISTS (SELECT 1 FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = sp.id AND a.user_id = ?) AS mine
     FROM schedule_polls sp WHERE sp.project_id = ? AND sp.closed_at IS NULL ORDER BY sp.created_at DESC`
  ).bind(user.id, project.id).all();
  return { polls: results };
}

async function createPoll({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const body = await readJson(request);
  const now = nowJst();
  const slots = [...new Set((Array.isArray(body.slots) ? body.slots : []).map((s) => reqDateTime(s, "候補の日時")))]
    .filter((s) => s >= now).sort().slice(0, 30);
  if (slots.length < 2) throw new HttpError(400, "これから先の候補の日時を2つ以上入れてください");
  const row = await env.DB.prepare(
    "INSERT INTO schedule_polls (project_id, note, duration_min, place, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
  ).bind(project.id, clean(body.note, 500), int(body.duration_min, { min: 15, max: 480, fallback: project.meeting_duration || 60, label: "MTGの長さ" }),
    clean(body.place, 200) || project.meeting_place || "", user.id, Date.now()).first();
  await env.DB.batch(slots.map((s) => env.DB.prepare("INSERT INTO schedule_poll_slots (poll_id, starts_at) VALUES (?, ?)").bind(row.id, s)));
  await notifyProject(env, project, `次回MTGの日程調整アンケートができました。行ける日時に答えてください（候補${slots.length}つ）`, `#/schedule-polls/${row.id}`, user.id, { dm: true });
  return { id: row.id };
}

async function getPoll({ env, user, params }) {
  const poll = await loadPoll(env, params.id);
  const project = await loadProject(env, poll.project_id);
  const [slots, answers, members] = await Promise.all([
    env.DB.prepare("SELECT id, starts_at FROM schedule_poll_slots WHERE poll_id = ? ORDER BY starts_at").bind(poll.id).all(),
    env.DB.prepare(
      "SELECT a.slot_id, a.user_id, a.answer FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = ?"
    ).bind(poll.id).all(),
    env.DB.prepare("SELECT u.id, u.name, u.avatar FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY u.name").bind(project.id).all(),
  ]);
  const canEdit = user.isAdmin || members.results.some((m) => m.id === user.id);
  // Discordに投稿してあれば、答えた人の画面が、画面そっくりの画像を作って送る（version：そのときの状態の印）
  const discord = canEdit && !poll.closed_at && await hasDiscordPost(env, "p", poll.id) ? { version: await pollVersion(env, poll.id) } : null;
  return {
    poll, slots: slots.results, answers: answers.results, members: members.results, canEdit, discord,
    project: { id: project.id, name: project.name, meeting_mode: project.meeting_mode },
  };
}

async function saveAnswers({ request, env, user, params, ctx }) {
  const poll = await loadPoll(env, params.id);
  await requireEditor(env, user, poll.project_id);
  if (poll.closed_at) throw new HttpError(400, "このアンケートは締め切りました");
  const body = await readJson(request);
  const { results: slots } = await env.DB.prepare("SELECT id FROM schedule_poll_slots WHERE poll_id = ?").bind(poll.id).all();
  const now = Date.now();
  const stmts = [];
  for (const s of slots) {
    const a = body.answers?.[s.id];
    if (!ANSWERS.includes(a)) continue;
    stmts.push(env.DB.prepare(
      `INSERT INTO schedule_poll_answers (slot_id, user_id, answer, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (slot_id, user_id) DO UPDATE SET answer = excluded.answer, updated_at = excluded.updated_at`
    ).bind(s.id, user.id, a, now));
  }
  if (!stmts.length) throw new HttpError(400, "○△× を1つ以上選んでください");
  await env.DB.batch(stmts);
  refreshDiscord(env, ctx, "p", poll.id); // Discordに投稿してあれば、回答状況を書き直す
  return { ok: true };
}

// 決める：選んだ候補の日時でMTGを作り、アンケートを締め切って、メンバーに知らせる
async function decidePoll({ request, env, user, params, ctx }) {
  const poll = await loadPoll(env, params.id);
  const project = await loadProject(env, poll.project_id);
  await requireEditor(env, user, project.id);
  if (poll.closed_at) throw new HttpError(400, "このアンケートはもう締め切っています");
  const body = await readJson(request);
  const slot = await env.DB.prepare("SELECT * FROM schedule_poll_slots WHERE id = ? AND poll_id = ?").bind(int(body.slot_id, { min: 1, label: "候補" }), poll.id).first();
  if (!slot) throw new HttpError(400, "候補を選び直してください");
  const place = clean(body.place, 200) || poll.place || project.meeting_place || "";
  const closed = await env.DB.prepare("UPDATE schedule_polls SET closed_at = ? WHERE id = ? AND closed_at IS NULL").bind(Date.now(), poll.id).run();
  if (!closed.meta.changes) throw new HttpError(409, "ほかの人がさっき決めました。画面を読み込み直してください");
  const row = await env.DB.prepare(
    `INSERT INTO meetings (project_id, starts_at, duration_min, kind, place, created_by, created_at) VALUES (?, ?, ?, 'adhoc', ?, ?, ?) RETURNING id`
  ).bind(project.id, slot.starts_at, poll.duration_min, place, user.id, Date.now()).first();
  await env.DB.prepare("UPDATE schedule_polls SET meeting_id = ? WHERE id = ?").bind(row.id, poll.id).run();
  await notifyProject(env, project, `日程調整の結果、次回MTGが決まりました：${shortDateTime(slot.starts_at)}`, `#/meetings/${row.id}`, user.id, { dm: true });
  refreshDiscord(env, ctx, "p", poll.id);
  return { ok: true, meeting_id: row.id, starts_at: slot.starts_at };
}

// 決めずに締め切る（取りやめ）
async function closePoll({ env, user, params, ctx }) {
  const poll = await loadPoll(env, params.id);
  await requireEditor(env, user, poll.project_id);
  await env.DB.prepare("UPDATE schedule_polls SET closed_at = ? WHERE id = ? AND closed_at IS NULL").bind(Date.now(), poll.id).run();
  refreshDiscord(env, ctx, "p", poll.id);
  return { ok: true };
}
