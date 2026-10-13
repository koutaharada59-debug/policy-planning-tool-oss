// 管理者メニュー：管理者の追加・削除、役割と設定の確認（管理者だけ）
import { HttpError, readJson, idList, headIds } from "../util.js";
import { notify } from "../notify.js";
import { botConfigured } from "../discord.js";
import { notionConfigured, listNotionUsers } from "../notion.js";
import { syncPeopleLater } from "../notion-people.js";
import { requireAdmin as requireAdminFor, loadSchedule, stageDateStatements } from "./common.js";
import { getType, effectiveSchedule } from "../project-types.js";

export const routes = [
  ["GET", "/api/admin", getAdmin],
  ["POST", "/api/admin/admins", addAdmin],
  ["POST", "/api/admin/admins/remove", removeAdmin],
  ["POST", "/api/admin/reps", (c) => addRole(c, "reps")],
  ["POST", "/api/admin/reps/remove", (c) => removeRole(c, "reps")],
  ["POST", "/api/admin/heads", (c) => addRole(c, "heads")],
  ["POST", "/api/admin/heads/remove", (c) => removeRole(c, "heads")],
  ["POST", "/api/admin/staffing", moveMember],
  ["GET", "/api/admin/schedule", getSchedule],
  ["GET", "/api/admin/accounts", getAccounts],
  ["PUT", "/api/admin/accounts", saveAccount],
  ["PUT", "/api/admin/schedule", saveSchedule],
];

const requireAdmin = (user) => requireAdminFor(user, "管理者メニューは管理者だけが使えます");

async function getAdmin({ env, user }) {
  requireAdmin(user);
  const [users, admins, archived, staffing, errors, reps, heads] = await Promise.all([
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
    // 管理者メニューで選んだ代表
    env.DB.prepare(
      `SELECT r.user_id, r.created_at, u.name, u.avatar, b.name AS added_by_name FROM reps r
       JOIN users u ON u.id = r.user_id LEFT JOIN users b ON b.id = r.added_by ORDER BY r.created_at`
    ).all(),
    // 管理者メニューで選んだ部門長
    env.DB.prepare(
      `SELECT r.user_id, r.created_at, u.name, u.avatar, b.name AS added_by_name FROM heads r
       JOIN users u ON u.id = r.user_id LEFT JOIN users b ON b.id = r.added_by ORDER BY r.created_at`
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
    addedReps: reps.results,
    addedHeads: heads.results,
    admins: admins.results,
    users: users.results,
    archived: archived.results,
    projects,
    errors: errors.results,
    settings: {
      bot: botConfigured(env),
      forum: Boolean(env.HEARING_FORUM_ID),
      notion: Boolean(env.NOTION_TOKEN),
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
  if ([...(await headIds(env)), ...idList(env.ADMIN_IDS)].includes(user_id)) throw new HttpError(400, "この人はもともと管理者です（部門長は管理者を兼ねます）");
  await env.DB.prepare("INSERT OR IGNORE INTO admins (user_id, added_by, created_at) VALUES (?, ?, ?)")
    .bind(user_id, user.id, Date.now()).run();
  return { ok: true };
}

// 部門長・ADMIN_IDS（設定ファイルで固定）は外せない。自分自身も外せる（その場合はすぐ権限がなくなる）
async function removeAdmin({ request, env, user }) {
  requireAdmin(user);
  const { user_id } = await readJson(request);
  if ([...(await headIds(env)), ...idList(env.ADMIN_IDS)].includes(user_id)) {
    throw new HttpError(400, "部門長・副部門長など設定ファイルで決まっている管理者は、ここでは外せません");
  }
  await env.DB.prepare("DELETE FROM admins WHERE user_id = ?").bind(user_id).run();
  return { ok: true };
}

// 代表を選ぶ・外す（設定ファイルの REP_IDS で決めた代表は、ここでは外せない）
const ROLE = {
  heads: { label: "部門長", envIds: (env) => env.HEAD_IDS },
  reps: { label: "代表", envIds: (env) => env.REP_IDS },
};

async function addRole({ request, env, user }, table) {
  requireAdmin(user);
  const role = ROLE[table];
  const { user_id } = await readJson(request);
  const target = typeof user_id === "string" && await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(user_id).first();
  if (!target) throw new HttpError(400, "一覧にいるメンバーを選んでください");
  if (idList(role.envIds(env)).includes(user_id)) throw new HttpError(400, `この人はもともと${role.label}です（設定ファイルで決まっています）`);
  await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (user_id, added_by, created_at) VALUES (?, ?, ?)`).bind(user_id, user.id, Date.now()).run();
  return { ok: true };
}

async function removeRole({ request, env, user }, table) {
  requireAdmin(user);
  const role = ROLE[table];
  const { user_id } = await readJson(request);
  if (idList(role.envIds(env)).includes(user_id)) throw new HttpError(400, `設定ファイルで決まっている${role.label}は、ここでは外せません`);
  // 部門長がいなくなると、ヒアリングの一次確認と管理ができなくなるので、最後の1人は外せない
  if (table === "heads" && (await headIds(env)).filter((id) => id !== user_id).length === 0) {
    throw new HttpError(400, "部門長が1人もいなくなるので外せません。先にほかの人を部門長にしてください");
  }
  await env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user_id).run();
  return { ok: true };
}

// 人事異動：from のPJから外して to のPJに入れる（from だけ＝外す、to だけ＝追加）。本人にお知らせを出す
// メンバーのアカウントの対応（Discord ↔ Google・Notion）。Notionの人は、Notionのワークスペースのメンバーから選ぶ
async function getAccounts({ env, user }) {
  requireAdmin(user);
  const { results } = await env.DB.prepare(
    "SELECT id, name, avatar, google_email, notion_user_id, notion_name FROM users WHERE updated_at > 0 OR is_dept = 1 ORDER BY name"
  ).all();
  let notionUsers = [];
  let notionError = "";
  if (notionConfigured(env)) {
    const { results: pages } = await env.DB.prepare("SELECT notion_url FROM projects WHERE notion_url IS NOT NULL AND notion_url != '' ORDER BY id DESC").all();
    notionUsers = await listNotionUsers(env, { sampleUrls: pages.map((p) => p.notion_url) }).catch((err) => { notionError = `Notionのメンバーを読めませんでした（${err.status || "通信"}）`; return []; });
  }
  return { users: results, notionUsers, notion: notionConfigured(env), notionError };
}

async function saveAccount({ request, env, user, ctx }) {
  requireAdmin(user);
  const body = await readJson(request);
  const uid = typeof body.user_id === "string" ? body.user_id : "";
  if (!await env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(uid).first()) throw new HttpError(404, "メンバーが見つかりません");
  const email = String(body.google_email || "").trim().toLowerCase().slice(0, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Googleアカウントのメールアドレスを入れてください");
  const notionId = String(body.notion_user_id || "").trim();
  if (notionId && !/^[0-9a-f-]{32,36}$/i.test(notionId)) throw new HttpError(400, "Notionのアカウントを選び直してください");
  await env.DB.prepare("UPDATE users SET google_email = ?, notion_user_id = ?, notion_name = ? WHERE id = ?")
    .bind(email, notionId, notionId ? String(body.notion_name || "").slice(0, 80) : "", uid).run();
  // Notionアカウントを対応づけたら、その人が入っているPJのNotionページの参加者を合わせる
  const { results: pjs } = await env.DB.prepare("SELECT project_id FROM project_members WHERE user_id = ?").bind(uid).all();
  syncPeopleLater(env, ctx, pjs.map((r) => r.project_id));
  return { ok: true };
}

async function moveMember({ request, env, user, ctx }) {
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
  syncPeopleLater(env, ctx, [from?.id, to?.id]);
  return { ok: true };
}

// ---------- 期日を設定する：工程の目安日程（部門の基本）。PJごとに手で変えた期限はそのまま ----------
const TYPE = "teigen";

async function getSchedule({ env, user }) {
  requireAdmin(user);
  const custom = await loadSchedule(env, TYPE);
  const base = effectiveSchedule(TYPE, null);
  const now = effectiveSchedule(TYPE, custom);
  const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE status = 'active' AND type = ?").bind(TYPE).first();
  const row = custom ? await env.DB.prepare(
    "SELECT s.updated_at, u.name FROM schedule_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.type = ?"
  ).bind(TYPE).first() : null;
  const view = (sch) => ({
    presentationDay: sch.presentationDay,
    stages: sch.stages.map((x) => ({ no: x.no, name: x.name, period: x.period, schedule: x.schedule })),
  });
  return { base: view(base), current: view(now), customized: Boolean(custom), activeProjects: active.n, updated: row };
}

// 保存したら、進行中のPJの「手で変えていない期限」を新しい目安で計算し直す。reset=true で既定に戻す
async function saveSchedule({ request, env, user }) {
  requireAdmin(user);
  const body = await readJson(request);
  let custom = null;
  if (!body.reset) {
    const day = (v, label, min, max) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label}は${min + 1}〜${max + 1}日目の範囲で入れてください`);
      return n;
    };
    const t = getType(TYPE);
    const stages = {};
    for (const s of t.stages) {
      if (!s.schedule.fromStart || s.schedule.fromStart[0] < 0) continue;
      const v = body.stages?.[s.no];
      if (!v) continue;
      const a = day(v[0], `「${s.name}」の開始`, 0, 180);
      const b = s.schedule.beforePresentation ? null : day(v[1], `「${s.name}」の期限`, 0, 180);
      if (b !== null && b < a) throw new HttpError(400, `「${s.name}」の期限が開始より前になっています`);
      stages[s.no] = [a, b];
    }
    const presentationDay = day(body.presentationDay, "最終発表の日", 7, 200);
    const finalDays = Number(body.finalDays);
    if (!Number.isInteger(finalDays) || finalDays < 7 || finalDays > 120) throw new HttpError(400, "修正・最終提出の期間は7〜120日で入れてください");
    custom = { stages, presentationDay, finalDays };
  }
  await env.DB.prepare(custom
    ? "INSERT INTO schedule_settings (type, value, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(type) DO UPDATE SET value = ?2, updated_by = ?3, updated_at = ?4"
    : "DELETE FROM schedule_settings WHERE type = ?1"
  ).bind(...(custom ? [TYPE, JSON.stringify(custom), user.id, Date.now()] : [TYPE])).run();
  // 進行中のPJの、手で変えていない期限を計算し直す
  const { results: projects } = await env.DB.prepare("SELECT * FROM projects WHERE status = 'active' AND type = ?").bind(TYPE).all();
  const stmts = [];
  for (const p of projects) stmts.push(...(await stageDateStatements(env, p, { custom })));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { ok: true, updatedProjects: projects.length };
}
