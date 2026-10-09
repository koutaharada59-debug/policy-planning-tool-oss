// 通知：notifications に残し（「確認する → お知らせ」に出る）、必要なものはDMでも送る
import { sendDm } from "./discord.js";

function appUrl(env, path = "") {
  return `${(env.APP_URL || "").replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

// link はツール内のパス（例：'#/hearings/3'）。dm=false ならお知らせにだけ残す
// 関わる人には、操作した本人にも届ける（自分でタスクを追加した・MTGを入れた、なども「お知らせ」に残る）。except は使わない
export async function notify(env, userIds, body, link = "", { dm = true } = {}) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  const now = Date.now();
  const rows = await Promise.all(unique.map(async (uid) => {
    const ok = dm ? await sendDm(env, uid, link ? `${body}\n${appUrl(env, link)}` : body).catch(() => false) : false;
    return env.DB.prepare("INSERT INTO notifications (user_id, body, link, dm_ok, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(uid, body, link, ok ? 1 : 0, now);
  }));
  await env.DB.batch(rows);
}

// PJの変更のお知らせ：そのPJのメンバーだけに知らせる。dm=true（MTGの変更）はBotがあればDMでも送る
export async function notifyProject(env, project, body, link, actorId, { dm = false } = {}) {
  const { results } = await env.DB.prepare("SELECT user_id FROM project_members WHERE project_id = ?").bind(project.id).all();
  await notify(env, results.map((r) => r.user_id), `【${project.name}】${body}`, link || `#/projects/${project.id}`, { dm });
}

// タスクの担当になった人に知らせる（自分で自分を担当にしたときも出す）。BotがあればDMでも送る
export async function notifyAssignee(env, project, task, actorId) {
  if (!task.assignee_id) return;
  // 誰に知らせたかを覚えておく（議事録では、まだ知らせていない担当だけにまとめて送る）
  if (task.id) await env.DB.prepare("UPDATE tasks SET notified_assignee = ? WHERE id = ?").bind(task.assignee_id, task.id).run();
  await notify(env, [task.assignee_id],
    `【${project.name}】タスク「${task.title}」の担当になりました${task.due_date ? `（期限 ${task.due_date.slice(5).replace("-", "/")}）` : ""}`,
    `#/projects/${project.id}?tab=tasks`, {});
}
