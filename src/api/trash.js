// 最近削除した項目：消したMTG（議事録・そこで作ったタスクごと）とタスクを30日残し、元に戻せるようにする
import { HttpError } from "../util.js";
import { loadProject, requireEditor } from "./common.js";

export const routes = [
  ["GET", "/api/trash", listTrash],
  ["POST", "/api/trash/:id/restore", restoreTrash],
];

const KEEP_MS = 30 * 86400000;
const COL = /^[a-z_]+$/;

// 消す前に呼ぶ：中身を残しておく文（消す文と一緒に batch に入れる）
export function trashStatement(env, { kind, projectId, title, data, userId }) {
  return env.DB.prepare("INSERT INTO trash (kind, project_id, title, data, deleted_by, deleted_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(kind, projectId, title.slice(0, 120), JSON.stringify(data), userId, Date.now());
}

// MTGを消すときに残す中身：MTG・議事録・そこで作ったタスク（担当つき）
export async function meetingSnapshot(env, meeting) {
  const minute = await env.DB.prepare("SELECT * FROM minutes WHERE meeting_id = ?").bind(meeting.id).first();
  const tasks = minute ? (await env.DB.prepare("SELECT * FROM tasks WHERE source_minute_id = ?").bind(minute.id).all()).results : [];
  for (const t of tasks) t.assignees = (await env.DB.prepare("SELECT user_id, notified FROM task_assignees WHERE task_id = ?").bind(t.id).all()).results;
  return { meeting, minute, tasks };
}
export async function taskSnapshot(env, task) {
  const assignees = (await env.DB.prepare("SELECT user_id, notified FROM task_assignees WHERE task_id = ?").bind(task.id).all()).results;
  return { task: { ...task, assignees } };
}

// 自分が入っているPJ（管理者は全部）の、30日以内に消したもの
async function listTrash({ env, user }) {
  await env.DB.prepare("DELETE FROM trash WHERE deleted_at < ?").bind(Date.now() - KEEP_MS).run();
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.kind, t.project_id, t.title, t.deleted_at, p.name AS project_name, u.name AS deleted_by_name
     FROM trash t JOIN projects p ON p.id = t.project_id LEFT JOIN users u ON u.id = t.deleted_by
     WHERE ?1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = ?2)
     ORDER BY t.deleted_at DESC LIMIT 100`
  ).bind(user.isAdmin ? 1 : 0, user.id).all();
  return { items: results, keepDays: 30 };
}

// 行をそのまま入れ直す（id は新しく振る）
async function reinsert(env, table, row, override = {}) {
  const r = { ...row, ...override };
  delete r.id;
  delete r.assignees;
  const cols = Object.keys(r).filter((c) => COL.test(c));
  const res = await env.DB.prepare(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING id`
  ).bind(...cols.map((c) => r[c])).first();
  return res.id;
}
async function restoreTask(env, task, override) {
  const id = await reinsert(env, "tasks", task, override);
  for (const a of task.assignees || []) {
    await env.DB.prepare("INSERT OR IGNORE INTO task_assignees (task_id, user_id, notified) VALUES (?, ?, ?)").bind(id, a.user_id, a.notified).run();
  }
  return id;
}

async function restoreTrash({ env, user, params }) {
  const item = await env.DB.prepare("SELECT * FROM trash WHERE id = ?").bind(params.id).first();
  if (!item) throw new HttpError(404, "もう元に戻せません（30日を過ぎたか、すでに戻しました）");
  const project = await loadProject(env, item.project_id);
  await requireEditor(env, user, project.id);
  const data = JSON.parse(item.data);
  let link = `#/projects/${project.id}`;
  if (item.kind === "task") {
    await restoreTask(env, data.task);
    link = `#/projects/${project.id}?tab=tasks`;
  } else if (item.kind === "meeting") {
    // 定例の回は消さずに「中止」にしていたので、中止を戻す。臨時の回は作り直す
    const still = await env.DB.prepare("SELECT id FROM meetings WHERE id = ?").bind(data.meeting.id).first();
    let meetingId;
    if (still) {
      meetingId = still.id;
      await env.DB.prepare("UPDATE meetings SET cancelled = 0 WHERE id = ?").bind(meetingId).run();
    } else {
      meetingId = await reinsert(env, "meetings", data.meeting);
    }
    if (data.minute && !(await env.DB.prepare("SELECT 1 FROM minutes WHERE meeting_id = ?").bind(meetingId).first())) {
      const minuteId = await reinsert(env, "minutes", data.minute, { meeting_id: meetingId });
      for (const t of data.tasks || []) await restoreTask(env, t, { source_minute_id: minuteId });
    }
    link = `#/meetings/${meetingId}`;
  } else {
    throw new HttpError(400, "この項目は元に戻せません");
  }
  await env.DB.prepare("DELETE FROM trash WHERE id = ?").bind(item.id).run();
  return { ok: true, link };
}
