// API 共通：PJの読み込み・権限・定例MTGの補充
import { HttpError, todayJst } from "../util.js";
import { addDays, computeStageDates } from "../project-types.js";
import { regularOccurrences, parseWeekdays } from "../schedule.js";

export async function loadProject(env, id) {
  const project = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
  if (!project) throw new HttpError(404, "PJが見つかりません");
  return project;
}

// 閲覧は部門全員。編集はPJメンバーと管理者
export async function canEdit(env, user, projectId) {
  if (user.isAdmin) return true;
  const row = await env.DB.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, user.id).first();
  return Boolean(row);
}

export function requireAdmin(user, message = "管理者だけができる操作です") {
  if (!user.isAdmin) throw new HttpError(403, message);
}

export async function requireEditor(env, user, projectId) {
  if (!(await canEdit(env, user, projectId))) {
    throw new HttpError(403, "このPJを編集できるのは、PJメンバーと管理者です");
  }
}

// 担当者などに指定されたIDが、ログインしたことのあるユーザーか確かめる
export async function assertUsers(env, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;
  const { results } = await env.DB.prepare(
    `SELECT id FROM users WHERE id IN (${unique.map(() => "?").join(",")})`
  ).bind(...unique).all();
  if (results.length !== unique.length) throw new HttpError(400, "存在しないメンバーが指定されています");
}

// 工程の予定期間を（手で変えたもの以外）計算し直す文を返す
export function stageDateStatements(env, project, { onlyAuto = true } = {}) {
  return computeStageDates(project.type, project.start_date, project.presentation_date).map((s) =>
    env.DB.prepare(
      `INSERT INTO project_stages (project_id, stage_no, start_date, due_date) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(project_id, stage_no) DO UPDATE SET start_date = ?3, due_date = ?4
       ${onlyAuto ? "WHERE due_manual = 0" : ""}`
    ).bind(project.id, s.stage_no, s.start_date, s.due_date)
  );
}

// 定例MTGを、今日から4週間先まで作っておく（同じ回は slot で重複しない）
const REGULAR_HORIZON_DAYS = 28;

// skipSlots: すでにある回（重複して作らない。INSERT OR IGNORE は保険）
export function regularMeetingStatements(env, project, now = Date.now(), skipSlots = new Set()) {
  if (project.meeting_mode !== "regular" || project.status !== "active") return [];
  const today = todayJst(now);
  const pjFrom = addDays(project.start_date, -7);
  const slots = regularOccurrences(
    {
      weekdays: parseWeekdays(project.meeting_weekdays),
      time: project.meeting_time,
      interval: project.meeting_interval,
      anchor: project.start_date,
    },
    pjFrom > today ? pjFrom : today,
    addDays(today, REGULAR_HORIZON_DAYS)
  );
  return slots.filter((slot) => !skipSlots.has(slot)).map((slot) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO meetings (project_id, starts_at, duration_min, kind, slot, place, created_at)
       VALUES (?1, ?2, ?3, 'regular', ?2, ?4, ?5)`
    ).bind(project.id, slot, project.meeting_duration, project.meeting_place, now)
  );
}

// 画面を開いたときに呼ぶ。足りない回だけ作る
export async function ensureRegularMeetings(env, projects) {
  const regular = projects.filter((p) => p.meeting_mode === "regular" && p.status === "active");
  if (!regular.length) return;
  const { results } = await env.DB.prepare(
    `SELECT project_id, slot FROM meetings WHERE slot >= ? AND project_id IN (${regular.map(() => "?").join(",")})`
  ).bind(`${todayJst()}T00:00`, ...regular.map((p) => p.id)).all();
  const stmts = regular.flatMap((p) =>
    regularMeetingStatements(env, p, Date.now(), new Set(results.filter((r) => r.project_id === p.id).map((r) => r.slot)))
  );
  if (stmts.length) await env.DB.batch(stmts);
}

export async function ensureAllRegularMeetings(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM projects WHERE status = 'active' AND meeting_mode = 'regular'"
  ).all();
  await ensureRegularMeetings(env, results);
}
