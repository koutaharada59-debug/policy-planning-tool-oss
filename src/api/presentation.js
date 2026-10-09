// フェーズ3：発表準備・政調からのフィードバック・最終提出
import { HttpError, readJson, clean, required, int, oneOf, optDate, optUrl, reqDateTime, assertUpdated, todayJst } from "../util.js";
import { addDays, stageNo } from "../project-types.js";
import { loadProject, requireEditor, canEdit, assertUsers } from "./common.js";
import { notifyProject } from "../notify.js";

export const routes = [
  ["GET", "/api/projects/:id/presentation", getPresentation],
  ["PUT", "/api/projects/:id/presentation", savePresentation],
  ["POST", "/api/projects/:id/rehearsals", createRehearsal],
  ["PATCH", "/api/rehearsals/:id", updateRehearsal],
  ["DELETE", "/api/rehearsals/:id", deleteRehearsal],
  ["POST", "/api/projects/:id/feedback", createFeedback],
  ["PATCH", "/api/feedback/:id", updateFeedback],
  ["DELETE", "/api/feedback/:id", deleteFeedback],
];

const ROLES = ["role_mc", "role_slides", "role_minutes", "role_screenshots"];

const EMPTY_PREP = {
  abstract_status: "todo", abstract_submitted_on: null, abstract_url: "", output_format: "", slide_url: "",
  role_mc: null, role_slides: null, role_minutes: null, role_screenshots: null, materials_sent_on: null,
  final_status: "todo", final_submitted_on: null, final_url: "", final_memo: "", present_memo: "", version: 0,
};

async function getPresentation({ env, user, params }) {
  const project = await loadProject(env, params.id);
  const [prep, stages, rehearsals, feedback, members, measures] = await Promise.all([
    env.DB.prepare(
      `SELECT pp.*, u.name AS updated_by_name FROM presentation_prep pp LEFT JOIN users u ON u.id = pp.updated_by WHERE pp.project_id = ?`
    ).bind(project.id).first(),
    env.DB.prepare("SELECT stage_no, start_date, due_date FROM project_stages WHERE project_id = ?").bind(project.id).all(),
    env.DB.prepare("SELECT * FROM rehearsals WHERE project_id = ? ORDER BY starts_at").bind(project.id).all(),
    env.DB.prepare(
      `SELECT f.*, o.name AS owner_name, m.title AS measure_title FROM feedback_items f
       LEFT JOIN users o ON o.id = f.owner_id LEFT JOIN measures m ON m.id = f.measure_id
       WHERE f.project_id = ? ORDER BY CASE f.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, f.created_at`
    ).bind(project.id).all(),
    env.DB.prepare(
      `SELECT u.id, u.name, u.avatar FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY u.name`
    ).bind(project.id).all(),
    env.DB.prepare("SELECT id, title FROM measures WHERE project_id = ? ORDER BY created_at").bind(project.id).all(),
  ]);
  const stageDue = (no) => stages.results.find((s) => s.stage_no === no)?.due_date || null;
  const presentationOn = stageDue(stageNo(project.type, "presentation"));
  return {
    project: { id: project.id, name: project.name, presentation_date: project.presentation_date, doc_url: project.doc_url },
    canEdit: await canEdit(env, user, project.id),
    prep: prep || EMPTY_PREP,
    // 目安の日付：発表日（未定なら工程の予定）、リハーサル開始（2週間前）、資料送付（前日）、最終提出（工程5の期限）
    dates: {
      presentation: presentationOn,
      presentationFixed: Boolean(project.presentation_date),
      rehearsalFrom: presentationOn ? addDays(presentationOn, -14) : null,
      materialsBy: presentationOn ? addDays(presentationOn, -1) : null,
      finalBy: stageDue(stageNo(project.type, "final")),
    },
    rehearsals: rehearsals.results,
    feedback: feedback.results,
    members: members.results,
    measures: measures.results,
  };
}

// 送られた項目だけ更新する（それぞれの欄を別々に保存できるように）
async function savePresentation({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  const body = await readJson(request);
  // 「発表する」画面の雑メモだけは誰でも書ける（発表を聞いている人もメモできるように）。ほかの項目はPJメンバーと管理者
  const onlyMemo = Object.keys(body).every((k) => k === "present_memo" || k === "version");
  if (!onlyMemo) await requireEditor(env, user, project.id);
  const cur = (await env.DB.prepare("SELECT * FROM presentation_prep WHERE project_id = ?").bind(project.id).first()) || EMPTY_PREP;
  const next = { ...cur };
  if ("abstract_status" in body) next.abstract_status = oneOf(body.abstract_status, ["todo", "done"], "アブストラクトの状態");
  if ("abstract_submitted_on" in body) next.abstract_submitted_on = optDate(body.abstract_submitted_on, "提出日");
  if ("abstract_url" in body) next.abstract_url = optUrl(body.abstract_url);
  if ("output_format" in body) next.output_format = body.output_format ? oneOf(body.output_format, ["document", "slides"], "アウトプットの形式") : "";
  if ("slide_url" in body) next.slide_url = optUrl(body.slide_url);
  for (const r of ROLES) if (r in body) next[r] = typeof body[r] === "string" && body[r] ? body[r] : null;
  if ("materials_sent_on" in body) next.materials_sent_on = optDate(body.materials_sent_on, "送付日");
  if ("final_status" in body) next.final_status = oneOf(body.final_status, ["todo", "done"], "最終提出の状態");
  if ("final_submitted_on" in body) next.final_submitted_on = optDate(body.final_submitted_on, "提出日");
  if ("final_url" in body) next.final_url = optUrl(body.final_url);
  if ("final_memo" in body) next.final_memo = clean(body.final_memo, 500);
  if ("present_memo" in body) next.present_memo = clean(body.present_memo, 5000);
  await assertUsers(env, ROLES.map((r) => next[r]));
  // 「提出済み」にしたのに日付がなければ、今日にする
  const today = todayJst();
  if (next.abstract_status === "done" && !next.abstract_submitted_on) next.abstract_submitted_on = today;
  if (next.final_status === "done" && !next.final_submitted_on) next.final_submitted_on = today;

  const version = int(body.version, { min: 0, label: "版" });
  const now = Date.now();
  const values = [next.abstract_status, next.abstract_submitted_on, next.abstract_url, next.output_format, next.slide_url,
    next.role_mc, next.role_slides, next.role_minutes, next.role_screenshots, next.materials_sent_on,
    next.final_status, next.final_submitted_on, next.final_url, next.final_memo, next.present_memo, user.id, now];
  let res;
  if (version === 0 && !cur.project_id) {
    res = await env.DB.prepare(
      `INSERT OR IGNORE INTO presentation_prep (abstract_status, abstract_submitted_on, abstract_url, output_format, slide_url,
         role_mc, role_slides, role_minutes, role_screenshots, materials_sent_on, final_status, final_submitted_on, final_url,
         final_memo, present_memo, updated_by, updated_at, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(...values, project.id).run();
  } else {
    res = await env.DB.prepare(
      `UPDATE presentation_prep SET abstract_status=?, abstract_submitted_on=?, abstract_url=?, output_format=?, slide_url=?,
         role_mc=?, role_slides=?, role_minutes=?, role_screenshots=?, materials_sent_on=?, final_status=?, final_submitted_on=?,
         final_url=?, final_memo=?, present_memo=?, updated_by=?, updated_at=?, version = version + 1 WHERE project_id = ? AND version = ?`
    ).bind(...values, project.id, version).run();
  }
  assertUpdated(res, "発表準備");
  return { ok: true };
}

// ---------- リハーサル ----------

async function createRehearsal({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const body = await readJson(request);
  const row = await env.DB.prepare(
    `INSERT INTO rehearsals (project_id, starts_at, duration_min, place, audience, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(project.id, reqDateTime(body.starts_at, "日時"), int(body.duration_min, { min: 15, max: 480, fallback: 60, label: "長さ" }),
    clean(body.place, 200), clean(body.audience, 200), user.id, Date.now()).first();
  return { id: row.id };
}

async function loadRehearsal(env, user, id) {
  const r = await env.DB.prepare("SELECT * FROM rehearsals WHERE id = ?").bind(id).first();
  if (!r) throw new HttpError(404, "リハーサルが見つかりません");
  await requireEditor(env, user, r.project_id);
  return r;
}

async function updateRehearsal({ request, env, user, params }) {
  const r = await loadRehearsal(env, user, params.id);
  const body = await readJson(request);
  const next = { ...r };
  if ("starts_at" in body) next.starts_at = reqDateTime(body.starts_at, "日時");
  if ("place" in body) next.place = clean(body.place, 200);
  if ("audience" in body) next.audience = clean(body.audience, 200);
  if ("done" in body) next.done = body.done ? 1 : 0;
  if ("note" in body) next.note = clean(body.note, 500);
  await env.DB.prepare("UPDATE rehearsals SET starts_at=?, place=?, audience=?, done=?, note=? WHERE id=?")
    .bind(next.starts_at, next.place, next.audience, next.done, next.note, r.id).run();
  return { ok: true };
}

async function deleteRehearsal({ env, user, params }) {
  const r = await loadRehearsal(env, user, params.id);
  await env.DB.prepare("DELETE FROM rehearsals WHERE id = ?").bind(r.id).run();
  return { ok: true };
}

// ---------- フィードバック ----------

async function feedbackFields(env, body, projectId) {
  const f = {
    content: required(body.content, 500, "フィードバックの内容"),
    source: clean(body.source, 60),
    status: oneOf(body.status || "todo", ["todo", "doing", "done"], "状態"),
    owner_id: typeof body.owner_id === "string" && body.owner_id ? body.owner_id : null,
    response: clean(body.response, 1000),
    measure_id: body.measure_id ? int(body.measure_id, { label: "施策" }) : null,
  };
  await assertUsers(env, [f.owner_id]);
  if (f.measure_id) {
    const m = await env.DB.prepare("SELECT 1 FROM measures WHERE id = ? AND project_id = ?").bind(f.measure_id, projectId).first();
    if (!m) throw new HttpError(400, "このPJの施策を選んでください");
  }
  return f;
}

// フィードバックの追加は誰でもできる（「発表する」画面から）。編集・削除・状態の変更はPJメンバーと管理者
async function createFeedback({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  const f = await feedbackFields(env, await readJson(request), project.id);
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO feedback_items (project_id, content, source, status, owner_id, response, measure_id, created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(project.id, f.content, f.source, f.status, f.owner_id, f.response, f.measure_id, user.id, user.id, now, now).first();
  await notifyProject(env, project, `フィードバックが追加されました：${f.content.slice(0, 40)}`, `#/projects/${project.id}?tab=present`, user.id);
  return { id: row.id };
}

async function loadFeedback(env, user, id) {
  const f = await env.DB.prepare("SELECT * FROM feedback_items WHERE id = ?").bind(id).first();
  if (!f) throw new HttpError(404, "フィードバックが見つかりません");
  await requireEditor(env, user, f.project_id);
  return f;
}

// 送られた項目だけ更新する（状態だけ変える、なども可）
async function updateFeedback({ request, env, user, params }) {
  const cur = await loadFeedback(env, user, params.id);
  const body = await readJson(request);
  const f = await feedbackFields(env, { ...cur, ...body }, cur.project_id);
  const version = body.version === undefined ? cur.version : int(body.version, { label: "版" });
  const res = await env.DB.prepare(
    `UPDATE feedback_items SET content=?, source=?, status=?, owner_id=?, response=?, measure_id=?, updated_by=?, updated_at=?,
       version = version + 1 WHERE id = ? AND version = ?`
  ).bind(f.content, f.source, f.status, f.owner_id, f.response, f.measure_id, user.id, Date.now(), cur.id, version).run();
  assertUpdated(res, "このフィードバック");
  return { ok: true };
}

async function deleteFeedback({ env, user, params }) {
  const f = await loadFeedback(env, user, params.id);
  await env.DB.prepare("DELETE FROM feedback_items WHERE id = ?").bind(f.id).run();
  return { ok: true };
}
