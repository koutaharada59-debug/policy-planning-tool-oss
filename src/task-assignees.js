// タスクの担当（複数人）：task_assignees 表。tasks.assignee_id は「1人目の担当」として合わせておく
import { notify } from "./notify.js";

// 一覧に出す担当：名前は「A・B」、id は「id1,id2」
export const ASSIGNEE_COLUMNS = `
  COALESCE((SELECT GROUP_CONCAT(ua.name, '・') FROM task_assignees ta JOIN users ua ON ua.id = ta.user_id WHERE ta.task_id = t.id), '') AS assignee_name,
  COALESCE((SELECT GROUP_CONCAT(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id), '') AS assignee_ids`;

// 「この人が担当のタスク」の条件（? にユーザーID）
export const ASSIGNED_TO = "EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)";

// 送られた担当：assignee_ids（配列）、なければ assignee_id（1人）
export function readAssignees(body) {
  const list = Array.isArray(body.assignee_ids) ? body.assignee_ids : body.assignee_id ? [body.assignee_id] : [];
  return [...new Set(list.filter((x) => typeof x === "string" && x))].slice(0, 30);
}
export const hasAssignees = (body) => "assignee_ids" in body || "assignee_id" in body;

// 担当を入れ替える文（外れた人は消し、新しい人は「まだ知らせていない」で足す）
export function setAssigneeStatements(env, taskId, ids) {
  const stmts = [
    ids.length
      ? env.DB.prepare(`DELETE FROM task_assignees WHERE task_id = ? AND user_id NOT IN (${ids.map(() => "?").join(",")})`).bind(taskId, ...ids)
      : env.DB.prepare("DELETE FROM task_assignees WHERE task_id = ?").bind(taskId),
    ...ids.map((uid) => env.DB.prepare("INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)").bind(taskId, uid)),
    env.DB.prepare("UPDATE tasks SET assignee_id = ? WHERE id = ?").bind(ids[0] || null, taskId),
  ];
  return stmts;
}

// まだ知らせていない担当に「担当になりました」を送る（BotがあればDMでも）
export async function notifyNewAssignees(env, project, taskId) {
  const task = await env.DB.prepare("SELECT id, title, due_date FROM tasks WHERE id = ?").bind(taskId).first();
  if (!task) return [];
  const { results } = await env.DB.prepare("SELECT user_id FROM task_assignees WHERE task_id = ? AND notified = 0").bind(taskId).all();
  if (!results.length) return [];
  const ids = results.map((r) => r.user_id);
  await env.DB.prepare(`UPDATE task_assignees SET notified = 1 WHERE task_id = ? AND user_id IN (${ids.map(() => "?").join(",")})`).bind(taskId, ...ids).run();
  await notify(env, ids,
    `【${project.name}】タスク「${task.title}」の担当になりました${task.due_date ? `（期限 ${task.due_date.slice(5).replace("-", "/")}）` : ""}`,
    `#/projects/${project.id}?tab=tasks`, {});
  return ids;
}
