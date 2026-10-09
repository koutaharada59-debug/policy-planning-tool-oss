// 部門の定例：事務連絡（部門長・副部門長）・各PJの進捗共有（PJメンバー）・メモ・定例のあとのイベント
import { HttpError, readJson, clean, int, oneOf, assertUpdated, todayJst, reqDate, reqDateTime } from "../util.js";
import { addDays } from "../project-types.js";
import { regularOccurrences } from "../schedule.js";
import { loadProject, requireAdmin, requireEditor } from "./common.js";

export const routes = [
  ["GET", "/api/dept-meetings", listDeptMeetings],
  ["POST", "/api/dept-meetings", startDeptMeeting],
  ["GET", "/api/dept-meetings/:id", getDeptMeeting],
  ["PATCH", "/api/dept-meetings/:id", updateDeptMeeting],
  ["GET", "/api/dept-reports", listReportTargets],
  ["GET", "/api/projects/:id/dept-report", getReport],
  ["PUT", "/api/projects/:id/dept-report", saveReport],
  ["GET", "/api/dept-notice", getNotice],
  ["PUT", "/api/dept-notice", saveNotice],
  ["GET", "/api/dept-schedules", listSchedules],
  ["POST", "/api/dept-schedules", createSchedule],
  ["DELETE", "/api/dept-schedules/:id", deleteSchedule],
];

const EVENTS = ["news", "exchange"]; // ニュース勉強会・意見交換会

// 定例の「日付」：夜の定例（22時〜翌1時など）が日付をまたいでも同じ日の定例として続くよう、朝6時で切り替える
const TEIREI_DAY_STARTS_AT = 6;
const teireiDay = () => todayJst(Date.now() - TEIREI_DAY_STARTS_AT * 3600 * 1000);

// 進行中の定例（または「定例を始める」で前もって作った次回の定例）：終えていない、今日以降でいちばん近いもの
// 進捗共有はここに入る。なければ次の定例に向けたもの（始めたときにまとめる）
async function openMeeting(env) {
  return env.DB.prepare("SELECT id, held_on FROM dept_meetings WHERE held_on >= ? AND ended_at IS NULL ORDER BY held_on LIMIT 1")
    .bind(teireiDay()).first();
}

// 状態：進行中（今日の定例）／準備中（前もって作った先の定例）
const withState = (m, today) => ({ ...m, is_open: !m.ended_at && m.held_on === today, is_ready: !m.ended_at && m.held_on > today });

async function listDeptMeetings({ env }) {
  const [{ results }, drafts] = await Promise.all([
    env.DB.prepare(
      `SELECT d.id, d.held_on, d.starts_at, d.event, d.ended_at, (SELECT COUNT(*) FROM dept_reports r WHERE r.dept_meeting_id = d.id) AS reports
       FROM dept_meetings d ORDER BY d.held_on DESC LIMIT 50`
    ).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM dept_reports WHERE dept_meeting_id IS NULL").first(),
  ]);
  // 進行中＝今日の定例で、まだ「定例を終わる」を押していないもの（押し忘れた過去の定例は終わった扱い）
  const today = teireiDay();
  return { today, meetings: results.map((m) => withState(m, today)), drafts: drafts.n };
}

// 定例を作る（すでにあればそれを開く）。starts_at があれば予定の日時、なければ予定外で今日。
// 次の定例に向けて書かれていた進捗共有・事務連絡を、この定例にまとめる
async function startDeptMeeting({ request, env, user }) {
  requireAdmin(user, "定例を始められるのは、部門長・副部門長です");
  const body = await readJson(request).catch(() => ({}));
  const startsAt = body.starts_at ? reqDateTime(body.starts_at, "定例の日時") : null;
  const heldOn = startsAt ? startsAt.slice(0, 10) : teireiDay();
  if (heldOn < teireiDay()) throw new HttpError(400, "過ぎた日の定例は始められません");
  const now = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO dept_meetings (held_on, starts_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(heldOn, startsAt, user.id, now, now).run();
  const meeting = await env.DB.prepare("SELECT id, ended_at FROM dept_meetings WHERE held_on = ?").bind(heldOn).first();
  if (!meeting.ended_at) await env.DB.batch(collectStatements(env, meeting.id, heldOn, now));
  return { id: meeting.id };
}

// 次の定例に向けて書かれていた進捗共有と事務連絡を、この定例にまとめる（定例を始める・再開するとき）
function collectStatements(env, meetingId, heldOn, now) {
  // 書き置きの事務連絡を、この定例の事務連絡に移して空にする（定例側にすでに書いてあれば後ろに足す）
  const moveNotice = (from) => env.DB.prepare(
    `UPDATE dept_meetings SET notice = CASE WHEN notice = '' THEN (${from})
       ELSE notice || char(10) || (${from}) END, version = version + 1
     WHERE id = ?1 AND COALESCE((${from}), '') != ''`
  );
  const dayNotice = "SELECT notice FROM dept_notice_days WHERE held_on = ?2";
  const draftNotice = "SELECT notice FROM dept_notice_draft WHERE id = 1";
  return [
    // 再開したとき：定例を終えたあとに書き直したPJは、新しいほうを残す
    env.DB.prepare(
      `DELETE FROM dept_reports WHERE dept_meeting_id = ?1
       AND project_id IN (SELECT project_id FROM dept_reports WHERE dept_meeting_id IS NULL)`
    ).bind(meetingId),
    env.DB.prepare("UPDATE dept_reports SET dept_meeting_id = ? WHERE dept_meeting_id IS NULL").bind(meetingId),
    // その日の定例に向けて書いた事務連絡 → 日付を決めずに書いた事務連絡、の順に移す
    moveNotice(dayNotice).bind(meetingId, heldOn),
    env.DB.prepare("DELETE FROM dept_notice_days WHERE held_on = ?").bind(heldOn),
    moveNotice(draftNotice).bind(meetingId),
    env.DB.prepare("UPDATE dept_notice_draft SET notice = '', version = version + 1, updated_at = ? WHERE id = 1 AND notice != ''").bind(now),
  ];
}

async function getDeptMeeting({ env, user, params }) {
  const meeting = await env.DB.prepare(
    "SELECT d.*, u.name AS updated_by_name FROM dept_meetings d LEFT JOIN users u ON u.id = d.updated_by WHERE d.id = ?"
  ).bind(params.id).first();
  if (!meeting) throw new HttpError(404, "定例が見つかりません");
  const { results: reports } = await env.DB.prepare(
    `SELECT r.*, p.name AS project_name, p.type, p.current_stage, u.name AS updated_by_name
     FROM dept_reports r JOIN projects p ON p.id = r.project_id LEFT JOIN users u ON u.id = r.updated_by
     WHERE r.dept_meeting_id = ? ORDER BY p.created_at`
  ).bind(meeting.id).all();
  // 進行中の定例なら、まだ書いていない進行中のPJも「未記入」として並べる
  Object.assign(meeting, withState(meeting, teireiDay()), { is_today: meeting.held_on === teireiDay() });
  let missing = [];
  if (meeting.is_open || meeting.is_ready) {
    const { results } = await env.DB.prepare(
      `SELECT id, name, type, current_stage FROM projects p WHERE status = 'active'
       AND NOT EXISTS (SELECT 1 FROM dept_reports r WHERE r.project_id = p.id AND r.dept_meeting_id = ?) ORDER BY created_at`
    ).bind(meeting.id).all();
    missing = results;
  }
  return { meeting, reports, missing, canEdit: user.isAdmin };
}

// 議事録の保存（事務連絡・メモ・イベント）。end: true なら「定例を終わる」
async function updateDeptMeeting({ request, env, user, params }) {
  requireAdmin(user, "定例の議事録を変えられるのは、管理者です");
  const body = await readJson(request);
  const cur = await env.DB.prepare("SELECT * FROM dept_meetings WHERE id = ?").bind(params.id).first();
  if (!cur) throw new HttpError(404, "定例が見つかりません");
  const notice = "notice" in body ? clean(body.notice, 5000) : cur.notice;
  const memo = "memo" in body ? clean(body.memo, 10000) : cur.memo;
  const event = "event" in body ? (body.event ? oneOf(body.event, EVENTS, "イベント") : "") : cur.event;
  const now = Date.now();
  // 再開できるのは、今日の定例だけ（終えたあとに書かれた進捗共有・事務連絡もまとめ直す）
  if (body.reopen && cur.held_on !== teireiDay()) throw new HttpError(400, "再開できるのは今日の定例だけです");
  const endedAt = body.reopen ? null : body.end ? cur.ended_at || now : cur.ended_at;
  const version = int(body.version, { min: 1, label: "版" });
  const res = await env.DB.prepare(
    `UPDATE dept_meetings SET notice = ?, memo = ?, event = ?, ended_at = ?, updated_by = ?, updated_at = ?, version = version + 1
     WHERE id = ? AND version = ?`
  ).bind(notice, memo, event, endedAt, user.id, now, cur.id, version).run();
  assertUpdated(res, "定例の議事録");
  if (body.reopen && cur.ended_at) await env.DB.batch(collectStatements(env, cur.id, cur.held_on, now));
  return { ok: true, version: version + 1 };
}

// 「定例の議事録を書く」で選べるPJ（自分が参加している進行中のPJ。管理者はすべて）
async function listReportTargets({ env, user }) {
  const meeting = await openMeeting(env);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.type, p.current_stage,
            EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ?1) AS is_mine,
            (SELECT r.updated_at FROM dept_reports r WHERE r.project_id = p.id AND COALESCE(r.dept_meeting_id, 0) = ?2) AS written_at
     FROM projects p WHERE p.status = 'active' ORDER BY is_mine DESC, p.created_at DESC`
  ).bind(user.id, meeting?.id || 0).all();
  return { projects: results.filter((p) => p.is_mine || user.isAdmin), todayMeetingId: meeting?.id || null };
}

// 進行中の定例があればその進捗共有、なければ次の定例に向けたものを書く
async function getReport({ env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const meeting = await openMeeting(env);
  const [report, previous] = await Promise.all([
    env.DB.prepare(
      `SELECT r.*, u.name AS updated_by_name FROM dept_reports r LEFT JOIN users u ON u.id = r.updated_by
       WHERE r.project_id = ? AND COALESCE(r.dept_meeting_id, 0) = ?`
    ).bind(project.id, meeting?.id || 0).first(),
    env.DB.prepare(
      `SELECT r.done, r.next, r.issues, d.held_on FROM dept_reports r JOIN dept_meetings d ON d.id = r.dept_meeting_id
       WHERE r.project_id = ? AND d.id != ? ORDER BY d.held_on DESC LIMIT 1`
    ).bind(project.id, meeting?.id || 0).first(),
  ]);
  return {
    project: { id: project.id, name: project.name, type: project.type, current_stage: project.current_stage },
    meeting,
    report: report || { done: "", next: "", issues: "", version: 0 },
    previous,
  };
}

async function saveReport({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const body = await readJson(request);
  const meetingId = (await openMeeting(env))?.id || null;
  const values = [clean(body.done, 3000), clean(body.next, 3000), clean(body.issues, 3000), user.id, Date.now()];
  const version = int(body.version, { min: 0, label: "版" });
  const res = version === 0
    ? await env.DB.prepare(
        `INSERT OR IGNORE INTO dept_reports (done, next, issues, updated_by, updated_at, project_id, dept_meeting_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(...values, project.id, meetingId).run()
    : await env.DB.prepare(
        `UPDATE dept_reports SET done = ?, next = ?, issues = ?, updated_by = ?, updated_at = ?, version = version + 1
         WHERE project_id = ? AND COALESCE(dept_meeting_id, 0) = ? AND version = ?`
      ).bind(...values, project.id, meetingId || 0, version).run();
  assertUpdated(res, "進捗共有");
  return { ok: true, version: version + 1 };
}

// ---------- 事務連絡を書く（部門長・副部門長＝管理者） ----------
// 進行中の定例があればその定例の事務連絡、なければ次の定例に向けて書いておく（定例を始めると移る）
async function noticeTarget(env, day) {
  if (day) {
    const meeting = await env.DB.prepare("SELECT id, held_on FROM dept_meetings WHERE held_on = ?").bind(day).first();
    return meeting ? { target: "meeting", meeting } : { target: "day" };
  }
  const meeting = await openMeeting(env);
  return meeting ? { target: "meeting", meeting } : { target: "next" };
}

async function getNotice({ env, user, url }) {
  requireAdmin(user, "事務連絡を書けるのは、部門長・副部門長です");
  const day = url.searchParams.get("day") ? reqDate(url.searchParams.get("day"), "定例の日") : null;
  const t = await noticeTarget(env, day);
  const by = (table, where) => env.DB.prepare(
    `SELECT d.notice, d.version, d.updated_at, u.name AS updated_by_name FROM ${table} d LEFT JOIN users u ON u.id = d.updated_by WHERE ${where}`
  );
  const row = t.target === "meeting" ? await by("dept_meetings", "d.id = ?").bind(t.meeting.id).first()
    : t.target === "day" ? await by("dept_notice_days", "d.held_on = ?").bind(day).first()
    : await by("dept_notice_draft", "d.id = 1").first();
  return {
    target: t.target, day: day || t.meeting?.held_on || null, meeting: t.meeting || null,
    notice: row?.notice || "", version: row?.version ?? 0, updated_at: row?.updated_at || 0, updated_by_name: row?.updated_by_name || "",
  };
}

async function saveNotice({ request, env, user }) {
  requireAdmin(user, "事務連絡を書けるのは、部門長・副部門長です");
  const body = await readJson(request);
  const day = body.day ? reqDate(body.day, "定例の日") : null;
  const notice = clean(body.notice, 5000);
  const version = int(body.version, { min: 0, label: "版" });
  const now = Date.now();
  const t = await noticeTarget(env, day);
  // 開いたときと保存するときで行き先が変わった（そのあいだに定例が始まった・終わった）なら、読み込み直してもらう
  if (body.target !== t.target) throw new HttpError(409, "定例の状態が変わりました。画面を再読み込みしてください");
  const res = t.target === "meeting"
    ? await env.DB.prepare("UPDATE dept_meetings SET notice = ?, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?")
      .bind(notice, user.id, now, t.meeting.id, version).run()
    : t.target === "day"
      ? version === 0
        ? await env.DB.prepare("INSERT OR IGNORE INTO dept_notice_days (held_on, notice, updated_by, updated_at) VALUES (?, ?, ?, ?)")
          .bind(day, notice, user.id, now).run()
        : await env.DB.prepare("UPDATE dept_notice_days SET notice = ?, updated_by = ?, updated_at = ?, version = version + 1 WHERE held_on = ? AND version = ?")
          .bind(notice, user.id, now, day, version).run()
      : await env.DB.prepare("UPDATE dept_notice_draft SET notice = ?, updated_by = ?, updated_at = ?, version = version + 1 WHERE id = 1 AND version = ?")
        .bind(notice, user.id, now, version).run();
  assertUpdated(res, "事務連絡");
  return { ok: true, version: version + 1 };
}

// ---------- 定例の予定（部門長・副部門長） ----------
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 予定から、今日以降の定例の日時を近い順に（すでに作った定例があれば、その状態も付ける）
async function upcomingSlots(env, limit) {
  const today = teireiDay();
  const { results: schedules } = await env.DB.prepare("SELECT * FROM dept_schedules WHERE to_date >= ?").bind(today).all();
  const slots = new Set();
  for (const s of schedules) {
    const from = s.from_date > today ? s.from_date : today;
    const to = s.to_date < addDays(today, 90) ? s.to_date : addDays(today, 90);
    for (const slot of regularOccurrences({ weekdays: [s.weekday], time: s.time, interval: 1, anchor: s.from_date }, from, to)) slots.add(slot);
  }
  const list = [...slots].sort().slice(0, limit);
  if (!list.length) return [];
  const { results: meetings } = await env.DB.prepare(
    `SELECT id, held_on, ended_at FROM dept_meetings WHERE held_on IN (${list.map(() => "?").join(",")})`
  ).bind(...list.map((x) => x.slice(0, 10))).all();
  const { results: notes } = await env.DB.prepare(
    `SELECT held_on FROM dept_notice_days WHERE notice != '' AND held_on IN (${list.map(() => "?").join(",")})`
  ).bind(...list.map((x) => x.slice(0, 10))).all();
  return list.map((starts_at) => {
    const m = meetings.find((x) => x.held_on === starts_at.slice(0, 10));
    return { starts_at, meeting: m ? withState(m, today) : null, has_notice: notes.some((n) => n.held_on === starts_at.slice(0, 10)) };
  });
}

async function listSchedules({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT s.*, u.name AS created_by_name FROM dept_schedules s LEFT JOIN users u ON u.id = s.created_by ORDER BY s.to_date DESC, s.weekday"
  ).all();
  return { today: teireiDay(), schedules: results, upcoming: await upcomingSlots(env, 3) };
}

async function createSchedule({ request, env, user }) {
  requireAdmin(user, "定例を予定できるのは、部門長・副部門長です");
  const body = await readJson(request);
  const weekday = int(body.weekday, { min: 0, max: 6, label: "曜日" });
  const time = typeof body.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : null;
  if (!time) throw new HttpError(400, "時刻を入力してください");
  const from = reqDate(body.from_date, "開始日");
  const to = reqDate(body.to_date, "終了日");
  if (to < from) throw new HttpError(400, "終了日は開始日より後にしてください");
  if (to > addDays(from, 366)) throw new HttpError(400, "期間は1年以内にしてください");
  await env.DB.prepare(
    "INSERT INTO dept_schedules (weekday, time, from_date, to_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(weekday, time, from, to, user.id, Date.now()).run();
  return { ok: true, label: `毎週${WEEKDAYS[weekday]}曜 ${time}` };
}

async function deleteSchedule({ env, user, params }) {
  requireAdmin(user, "定例の予定を消せるのは、部門長・副部門長です");
  const res = await env.DB.prepare("DELETE FROM dept_schedules WHERE id = ?").bind(params.id).run();
  if (!res.meta.changes) throw new HttpError(404, "予定が見つかりません");
  return { ok: true };
}

// カレンダー用：from〜to の部門の定例。予定（毎週◯曜◯時）から出し、実際に開いた定例があればそれに結び付ける
// weekday・to_date はカレンダーで「定例をまとめて追加（くり返し）」に使う
export async function teireiEvents(env, from, to) {
  const [{ results: schedules }, { results: meetings }] = await Promise.all([
    env.DB.prepare("SELECT * FROM dept_schedules WHERE to_date >= ? AND from_date <= ?").bind(from, to).all(),
    env.DB.prepare("SELECT id, held_on, starts_at, ended_at FROM dept_meetings WHERE held_on >= ? AND held_on <= ?").bind(from, to).all(),
  ]);
  const byDay = new Map();
  for (const s of schedules) {
    const a = s.from_date > from ? s.from_date : from;
    const b = s.to_date < to ? s.to_date : to;
    for (const slot of regularOccurrences({ weekdays: [s.weekday], time: s.time, interval: 1, anchor: s.from_date }, a, b)) {
      byDay.set(slot.slice(0, 10), { starts_at: slot, weekday: s.weekday, until: s.to_date, meeting_id: null, ended: false });
    }
  }
  for (const m of meetings) {
    const cur = byDay.get(m.held_on);
    byDay.set(m.held_on, {
      ...(cur || { weekday: null, until: null }),
      starts_at: m.starts_at || cur?.starts_at || `${m.held_on}T22:00`,
      meeting_id: m.id,
      ended: Boolean(m.ended_at),
    });
  }
  return [...byDay.values()].sort((x, y) => x.starts_at.localeCompare(y.starts_at));
}
