// タスク
import { HttpError, readJson, required, optDate, int, oneOf, assertUpdated } from "../util.js";
import { getType } from "../project-types.js";
import { loadProject, requireEditor, assertUsers } from "./common.js";
import { notifyAssignee } from "../notify.js";

export const routes = [
  ["POST", "/api/projects/:id/tasks", createTask],
  ["PATCH", "/api/tasks/:id", updateTask],
  ["DELETE", "/api/tasks/:id", deleteTask],
];

const STATUSES = ["todo", "doing", "done"];

function stageNo(value, project) {
  if (value === null || value === undefined || value === "") return null;
  return int(value, { min: 0, max: getType(project.type).stages.length - 1, label: "工程" });
}

async function createTask({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const body = await readJson(request);
  const assignee = typeof body.assignee_id === "string" && body.assignee_id ? body.assignee_id : null;
  await assertUsers(env, [assignee]);
  const now = Date.now();
  const task = { title: required(body.title, 120, "タスク名"), assignee_id: assignee, due_date: optDate(body.due_date, "期限") };
  const row = await env.DB.prepare(
    `INSERT INTO tasks (project_id, stage_no, title, assignee_id, due_date, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?) RETURNING id`
  ).bind(project.id, body.stage_no === undefined ? project.current_stage : stageNo(body.stage_no, project),
    task.title, task.assignee_id, task.due_date, user.id, now, now).first();
  await notifyAssignee(env, project, task, user.id);
  return { id: row.id };
}

async function loadTask(env, user, id, { statusOnly = false } = {}) {
  const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first();
  if (!task) throw new HttpError(404, "タスクが見つかりません");
  // 担当者は、PJメンバーでなくても自分のタスクの状態（完了など）だけは変えられる
  if (!(statusOnly && task.assignee_id === user.id)) await requireEditor(env, user, task.project_id);
  return task;
}

// 送られた項目だけ更新する（状態だけ変える、などに使う）
async function updateTask({ request, env, user, params }) {
  const body = await readJson(request);
  const task = await loadTask(env, user, params.id, { statusOnly: Object.keys(body).every((k) => k === "status" || k === "version") });
  const project = await loadProject(env, task.project_id);
  const next = { ...task };
  if ("title" in body) next.title = required(body.title, 120, "タスク名");
  if ("status" in body) next.status = oneOf(body.status, STATUSES, "状態");
  if ("due_date" in body) next.due_date = optDate(body.due_date, "期限");
  if ("stage_no" in body) next.stage_no = stageNo(body.stage_no, project);
  if ("assignee_id" in body) {
    next.assignee_id = typeof body.assignee_id === "string" && body.assignee_id ? body.assignee_id : null;
    await assertUsers(env, [next.assignee_id]);
  }
  // 版の指定がなければ（チェックだけの操作など）最新に対して更新する
  const version = body.version === undefined ? task.version : int(body.version, { label: "版" });
  const res = await env.DB.prepare(
    `UPDATE tasks SET title=?, status=?, due_date=?, stage_no=?, assignee_id=?, updated_at=?, version = version + 1
     WHERE id = ? AND version = ?`
  ).bind(next.title, next.status, next.due_date, next.stage_no, next.assignee_id, Date.now(), task.id, version).run();
  assertUpdated(res, "このタスク");
  if (next.assignee_id !== task.assignee_id) await notifyAssignee(env, project, next, user.id);
  return { ok: true };
}

async function deleteTask({ env, user, params }) {
  const task = await loadTask(env, user, params.id);
  await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(task.id).run();
  return { ok: true };
}
