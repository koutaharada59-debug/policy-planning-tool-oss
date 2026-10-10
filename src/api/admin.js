// 管理者メニュー：管理者の追加・削除、役割と設定の確認（管理者だけ）
import { HttpError, readJson, idList } from "../util.js";
import { notify } from "../notify.js";
import { botConfigured } from "../discord.js";
import { requireAdmin as requireAdminFor } from "./common.js";

export const routes = [
  ["GET", "/api/admin", getAdmin],
  ["POST", "/api/admin/admins", addAdmin],
  ["POST", "/api/admin/admins/remove", removeAdmin],
  ["POST", "/api/admin/staffing", moveMember],
];

const requireAdmin = (user) => requireAdminFor(user, "管理者メニューは管理者だけが使えます");

async function getAdmin({ env, user }) {
  requireAdmin(user);
  const [users, admins, archived, staffing, errors] = await Promise.all([
    // updated_at：最後にこのツールへログインした時刻（希望PJアンケートから取り込んだだけで未ログインの人は 0）
    env.DB.prepare("SELECT id, name, avatar, updated_at AS last_login, is_dept FROM users ORDER BY name").all(),
    env.DB.prepare(
      `SELECT a.user_id, a.created_at, u.name, u.avatar, b.name AS added_by_name FROM admins a
       JOIN users u ON u.id = a.user_id LEFT JOIN users b ON b.id = a.added_by ORDER BY a.created_at`
    ).all(),
    env.DB.prepare("SELECT id, name FROM projects WHERE status = 'archived' ORDER BY updated_at DESC").all(),
    // 人事：アーカイブ以外のPJと、その配属メンバー
    env.DB.prepare(
      `SELECT p.id, p.name, p.type, p.status, p.current_stage, pm.user_id FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id
       WHERE p.status != 'archived' ORDER BY p.status, p.created_at`
    ).all(),
    // エラーの記録（新しい順に30件）
    env.DB.prepare(
      "SELECT e.id, e.source, e.message, e.stack, e.url, e.created_at, u.name AS user_name FROM error_logs e LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT 30"
    ).all(),
  ]);
  const projects = [];
  for (const r of staffing.results) {
    let p = projects.find((x) => x.id === r.id);
    if (!p) projects.push((p = { id: r.id, name: r.name, type: r.type, status: r.status, current_stage: r.current_stage, members: [] }));
    if (r.user_id) p.members.push(r.user_id);
  }
  const byId = Object.fromEntries(users.results.map((u) => [u.id, u]));
  // 設定ファイルで決めている人（ログイン前なら名前が分からないので、IDだけ出す）
  const fixed = (ids) => idList(ids).map((id) => byId[id] || { id, name: `（未ログイン：${id}）`, avatar: null });
  return {
    heads: fixed(env.HEAD_IDS),
    fixedAdmins: fixed(env.ADMIN_IDS),
    reps: fixed(env.REP_IDS),
    admins: admins.results,
    users: users.results,
    archived: archived.results,
    projects,
    errors: errors.results,
    settings: {
      bot: botConfigured(env),
      forum: Boolean(env.HEARING_FORUM_ID),
      deptRole: Boolean(env.DEPT_ROLE_ID),
      guild: env.DISCORD_GUILD_ID,
    },
  };
}

async function addAdmin({ request, env, user }) {
  requireAdmin(user);
  const { user_id } = await readJson(request);
  const target = typeof user_id === "string" && await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(user_id).first();
  if (!target) throw new HttpError(400, "一覧にいるメンバーを選んでください");
  if ([...idList(env.HEAD_IDS), ...idList(env.ADMIN_IDS)].includes(user_id)) throw new HttpError(400, "この人はもともと管理者です（設定ファイルで決まっています）");
  await env.DB.prepare("INSERT OR IGNORE INTO admins (user_id, added_by, created_at) VALUES (?, ?, ?)")
    .bind(user_id, user.id, Date.now()).run();
  return { ok: true };
}

// 部門長・ADMIN_IDS（設定ファイルで固定）は外せない。自分自身も外せる（その場合はすぐ権限がなくなる）
async function removeAdmin({ request, env, user }) {
  requireAdmin(user);
  const { user_id } = await readJson(request);
  if ([...idList(env.HEAD_IDS), ...idList(env.ADMIN_IDS)].includes(user_id)) {
    throw new HttpError(400, "部門長・副部門長など設定ファイルで決まっている管理者は、ここでは外せません");
  }
  await env.DB.prepare("DELETE FROM admins WHERE user_id = ?").bind(user_id).run();
  return { ok: true };
}

// 人事異動：from のPJから外して to のPJに入れる（from だけ＝外す、to だけ＝追加）。本人にお知らせを出す
async function moveMember({ request, env, user }) {
  requireAdmin(user);
  const body = await readJson(request);
  const uid = typeof body.user_id === "string" ? body.user_id : "";
  const fromId = body.from_project_id ? Number(body.from_project_id) : null;
  const toId = body.to_project_id ? Number(body.to_project_id) : null;
  if (!uid || (!fromId && !toId) || fromId === toId) throw new HttpError(400, "異動する人と、異動元・異動先を選んでください");
  if (!(await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(uid).first())) throw new HttpError(400, "一覧にいるメンバーを選んでください");
  const load = async (id) => {
    if (!id) return null;
    const p = await env.DB.prepare("SELECT id, name, status FROM projects WHERE id = ?").bind(id).first();
    if (!p || p.status === "archived") throw new HttpError(400, "異動元・異動先のPJが見つかりません");
    return p;
  };
  const [from, to] = await Promise.all([load(fromId), load(toId)]);
  if (from && !(await env.DB.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").bind(from.id, uid).first())) {
    throw new HttpError(409, "この人は異動元のPJに入っていません。画面を再読み込みしてください");
  }
  await env.DB.batch([
    ...(from ? [env.DB.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").bind(from.id, uid)] : []),
    ...(to ? [env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)").bind(to.id, uid)] : []),
  ]);
  const message = from && to ? `「${from.name}」から「${to.name}」に異動になりました`
    : to ? `「${to.name}」のメンバーになりました` : `「${from.name}」のメンバーから外れました`;
  await notify(env, [uid], message, to ? `#/projects/${to.id}` : "#/projects", { dm: false, except: user.id });
  return { ok: true };
}
