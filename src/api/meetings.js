// MTG日程・議事録・ICS
import { HttpError, readJson, clean, reqDateTime, optDate, int, nowJst, shortDateTime } from "../util.js";
import { notifyProject, notifyAssignee } from "../notify.js";
import { addDays } from "../project-types.js";
import { regularOccurrences, parseWeekdays } from "../schedule.js";
import { buildIcs, icsResponse, weeklyRule } from "../ics.js";
import { loadProject, requireEditor, assertUsers, canEdit } from "./common.js";

export const routes = [
  ["POST", "/api/projects/:id/meetings", createMeeting],
  ["GET", "/api/projects/:id/regular.ics", regularIcs],
  ["GET", "/api/meetings/:id", getMeeting],
  ["PATCH", "/api/meetings/:id", updateMeeting],
  ["DELETE", "/api/meetings/:id", deleteMeeting],
  ["PUT", "/api/meetings/:id/minutes", saveMinutes],
  ["POST", "/api/meetings/:id/live", liveMinutes],
];

async function createMeeting({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const body = await readJson(request);
  const row = await env.DB.prepare(
    `INSERT INTO meetings (project_id, starts_at, duration_min, kind, place, created_by, created_at)
     VALUES (?, ?, ?, 'adhoc', ?, ?, ?) RETURNING id`
  ).bind(project.id, reqDateTime(body.starts_at, "日時"),
    int(body.duration_min, { min: 15, max: 480, fallback: project.meeting_duration, label: "MTGの長さ" }),
    clean(body.place, 200) || project.meeting_place, user.id, Date.now()).first();
  await notifyProject(env, project, `MTGが入りました：${shortDateTime(body.starts_at)}`, `#/meetings/${row.id}`, user.id, { dm: true });
  return { id: row.id };
}

async function loadMeeting(env, id) {
  const meeting = await env.DB.prepare("SELECT * FROM meetings WHERE id = ?").bind(id).first();
  if (!meeting) throw new HttpError(404, "MTGが見つかりません");
  return meeting;
}

async function updateMeeting({ request, env, user, params }) {
  const meeting = await loadMeeting(env, params.id);
  await requireEditor(env, user, meeting.project_id);
  const body = await readJson(request);
  const next = { ...meeting };
  if ("starts_at" in body) next.starts_at = reqDateTime(body.starts_at, "日時");
  if ("duration_min" in body) next.duration_min = int(body.duration_min, { min: 15, max: 480, label: "MTGの長さ" });
  if ("place" in body) next.place = clean(body.place, 200);
  if ("cancelled" in body) next.cancelled = body.cancelled ? 1 : 0;
  await env.DB.prepare("UPDATE meetings SET starts_at=?, duration_min=?, place=?, cancelled=? WHERE id=?")
    .bind(next.starts_at, next.duration_min, next.place, next.cancelled, meeting.id).run();
  const project = await loadProject(env, meeting.project_id);
  if (next.cancelled !== meeting.cancelled) {
    await notifyProject(env, project, `${shortDateTime(meeting.starts_at)} のMTGを${next.cancelled ? "中止にしました" : "やることに戻しました"}`, "", user.id, { dm: true });
  } else if (next.starts_at !== meeting.starts_at) {
    await notifyProject(env, project, `MTGの日時が変わりました：${shortDateTime(meeting.starts_at)} → ${shortDateTime(next.starts_at)}`, `#/meetings/${meeting.id}`, user.id, { dm: true });
  }
  return { ok: true };
}

async function deleteMeeting({ env, user, params }) {
  const meeting = await loadMeeting(env, params.id);
  await requireEditor(env, user, meeting.project_id);
  const minute = await env.DB.prepare("SELECT 1 FROM minutes WHERE meeting_id = ?").bind(meeting.id).first();
  if (minute) throw new HttpError(400, "議事録のあるMTGは削除できません");
  // 定例の回は消すと作り直されるので、中止扱いにする
  if (meeting.kind === "regular") {
    await env.DB.prepare("UPDATE meetings SET cancelled = 1 WHERE id = ?").bind(meeting.id).run();
  } else {
    await env.DB.prepare("DELETE FROM meetings WHERE id = ?").bind(meeting.id).run();
  }
  const project = await loadProject(env, meeting.project_id);
  await notifyProject(env, project, `${shortDateTime(meeting.starts_at)} のMTGは${meeting.kind === "regular" ? "中止" : "取りやめ"}になりました`, "", user.id, { dm: true });
  return { ok: true };
}

const TASK_COLUMNS = `t.id, t.title, t.status, t.due_date, t.assignee_id, t.version, u.name AS assignee_name`;

async function getMeeting({ env, user, params }) {
  const meeting = await loadMeeting(env, params.id);
  const project = await loadProject(env, meeting.project_id);
  const minute = await env.DB.prepare(
    `SELECT n.*, u.name AS updated_by_name FROM minutes n LEFT JOIN users u ON u.id = n.updated_by WHERE n.meeting_id = ?`
  ).bind(meeting.id).first();

  // 前回の議事録の「次回までにやること」＝今回の宿題
  const prev = await env.DB.prepare(
    `SELECT n.id, m.starts_at FROM minutes n JOIN meetings m ON m.id = n.meeting_id
     WHERE n.project_id = ? AND m.starts_at < ? ORDER BY m.starts_at DESC LIMIT 1`
  ).bind(project.id, meeting.starts_at).first();
  const tasksOf = (minuteId) =>
    env.DB.prepare(`SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
      WHERE t.source_minute_id = ? ORDER BY t.id`).bind(minuteId).all().then((r) => r.results);

  const [members, homework, todos, nextMeeting, checklist] = await Promise.all([
    env.DB.prepare(
      `SELECT u.id, u.name, u.avatar FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? ORDER BY u.name`
    ).bind(project.id).all().then((r) => r.results),
    prev ? tasksOf(prev.id) : [],
    minute ? tasksOf(minute.id) : [],
    nextMeetingAfter(env, project.id, meeting.starts_at),
    // いまの工程のチェックリストと、このMTGに結び付いた項目（ほかの工程のものも）
    env.DB.prepare(
      `SELECT c.id, c.stage_no, c.label, c.hint, c.done_at, c.skipped_at, c.meeting_id, m.starts_at AS meeting_starts_at
       FROM checklist_items c LEFT JOIN meetings m ON m.id = c.meeting_id
       WHERE c.project_id = ?1 AND (c.stage_no = ?2 OR c.meeting_id = ?3) ORDER BY c.stage_no, c.sort, c.id`
    ).bind(project.id, project.current_stage, meeting.id).all().then((r) => r.results),
  ]);
  const canEdit = user.isAdmin || members.some((m) => m.id === user.id);
  return {
    meeting, minute, members, canEdit,
    project: { id: project.id, name: project.name, type: project.type, memo_doc_url: project.memo_doc_url, meeting_mode: project.meeting_mode, current_stage: project.current_stage },
    previous: prev ? { starts_at: prev.starts_at, homework } : null,
    todos,
    nextMeeting,
    checklist,
  };
}

function nextMeetingAfter(env, projectId, startsAt) {
  return env.DB.prepare(
    "SELECT id, starts_at, place, kind FROM meetings WHERE project_id = ? AND cancelled = 0 AND starts_at > ? ORDER BY starts_at LIMIT 1"
  ).bind(projectId, startsAt).first();
}

// ---------- 議事録の同時編集 ----------
// 書いた内容は数秒ごとに自動で保存され、同じ議事録を開いているほかの人の画面にも数秒で出る。
// 同じ項目を2人が同時に書いて内容がぶつからないよう、項目ごとに「いま書いている人」を1人にする
const LIVE_FIELDS = ["agenda", "summary", "todos"];
const LIVE_TTL = 12000; // この時間、合図がなければ「もう書いていない／開いていない」とみなす

// 自分が書ける項目なら押さえる（すでに自分のもの・空き・古いものは取れる）。取れなければ、書いている人を返す
async function claimField(env, meetingId, field, user, now) {
  await env.DB.prepare(
    `INSERT INTO minute_editors (meeting_id, field, user_id, seen_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(meeting_id, field) DO UPDATE SET user_id = excluded.user_id, seen_at = excluded.seen_at
     WHERE minute_editors.user_id = excluded.user_id OR minute_editors.seen_at < ?5`
  ).bind(meetingId, field, user.id, now, now - LIVE_TTL).run();
  const holder = await env.DB.prepare(
    "SELECT e.user_id, u.name FROM minute_editors e LEFT JOIN users u ON u.id = e.user_id WHERE e.meeting_id = ? AND e.field = ?"
  ).bind(meetingId, field).first();
  return holder && holder.user_id !== user.id ? holder : null;
}

// 議事録を保存する。送られてきた項目だけを書き換える（自動保存は1項目ずつ送る）
async function saveMinutes({ request, env, user, params }) {
  const meeting = await loadMeeting(env, params.id);
  await requireEditor(env, user, meeting.project_id);
  const project = await loadProject(env, meeting.project_id);
  const body = await readJson(request);
  const now = Date.now();
  const sent = LIVE_FIELDS.filter((f) => f in body);
  for (const f of sent) {
    const holder = await claimField(env, meeting.id, f, user, now);
    if (holder) throw new HttpError(409, `${holder.name || "ほかの人"}さんが入力中です。書き終わるまで待ってください`);
  }
  const cols = [];
  if ("agenda" in body) cols.push(["agenda", clean(body.agenda, 300)]);
  if ("summary" in body) cols.push(["summary", clean(body.summary, 400)]);

  // 議事録がなければ作り、あれば送られた項目だけを書き換える
  const names = cols.map(([c]) => c);
  const row = await env.DB.prepare(
    `INSERT INTO minutes (meeting_id, project_id, ${names.map((c) => `${c}, `).join("")}created_by, updated_by, created_at, updated_at)
     VALUES (?, ?, ${names.map(() => "?, ").join("")}?, ?, ?, ?)
     ON CONFLICT(meeting_id) DO UPDATE SET ${names.map((c) => `${c} = excluded.${c}, `).join("")}
       updated_by = excluded.updated_by, updated_at = excluded.updated_at, version = version + 1
     RETURNING id`
  ).bind(meeting.id, project.id, ...cols.map(([, v]) => v), user.id, user.id, now, now).first();
  const minuteId = row.id;

  // 「次回までにやること」をタスクとして同期する（この議事録から作ったタスクだけが対象）
  // key：画面の行の目印。新しく作ったタスクの id を、どの行のものか返す（次の自動保存で同じタスクを二重に作らないため）
  const ids = {};
  if ("todos" in body) {
    const todos = (Array.isArray(body.todos) ? body.todos : []).slice(0, 30).map((t) => ({
      key: typeof t.key === "string" ? t.key.slice(0, 40) : "",
      id: t.id ? int(t.id, { label: "タスク" }) : null,
      title: clean(t.title, 120),
      assignee_id: typeof t.assignee_id === "string" && t.assignee_id ? t.assignee_id : null,
      due_date: optDate(t.due_date, "期限"),
    })).filter((t) => t.title);
    await assertUsers(env, todos.map((t) => t.assignee_id));
    const { results: current } = await env.DB.prepare("SELECT id, assignee_id FROM tasks WHERE source_minute_id = ?").bind(minuteId).all();
    const keep = new Set(todos.filter((t) => t.id).map((t) => t.id));
    const currentIds = new Set(current.map((r) => r.id));
    const stmts = [];
    for (const r of current) {
      if (!keep.has(r.id)) stmts.push(env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(r.id));
    }
    for (const t of todos) {
      if (t.id && currentIds.has(t.id)) {
        stmts.push(env.DB.prepare(
          "UPDATE tasks SET title=?, assignee_id=?, due_date=?, updated_at=?, version = version + 1 WHERE id = ?"
        ).bind(t.title, t.assignee_id, t.due_date, now, t.id));
      }
    }
    if (stmts.length) await env.DB.batch(stmts);
    for (const t of todos) {
      if (t.id && currentIds.has(t.id)) continue;
      const created = await env.DB.prepare(
        `INSERT INTO tasks (project_id, stage_no, title, assignee_id, due_date, status, source_minute_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'todo', ?, ?, ?, ?) RETURNING id`
      ).bind(project.id, project.current_stage, t.title, t.assignee_id, t.due_date, minuteId, user.id, now, now).first();
      if (t.key) ids[t.key] = created.id;
      t.id = created.id;
    }
    // 「次回までにやること」で新しく担当になった人へ
    const before = new Map(current.map((r) => [r.id, r.assignee_id]));
    for (const t of todos) {
      if (t.assignee_id && before.get(t.id) !== t.assignee_id) await notifyAssignee(env, project, t, user.id);
    }
  }

  // 毎回決めるPJ：議事録と一緒に送られた次回の日程を登録する（すでに次回があれば、その日時・場所を直す）
  let nextStartsAt = null;
  if (body.next_meeting && body.next_meeting.starts_at) {
    nextStartsAt = reqDateTime(body.next_meeting.starts_at, "次回の日時");
    if (nextStartsAt <= meeting.starts_at) throw new HttpError(400, "次回の日時は、このMTGより後にしてください");
    const place = clean(body.next_meeting.place, 200);
    const next = await nextMeetingAfter(env, project.id, meeting.starts_at);
    if (next && next.kind === "adhoc") {
      await env.DB.prepare("UPDATE meetings SET starts_at = ?, place = ? WHERE id = ?").bind(nextStartsAt, place, next.id).run();
      if (next.starts_at !== nextStartsAt) {
        await notifyProject(env, project, `次回MTGの日時が変わりました：${shortDateTime(next.starts_at)} → ${shortDateTime(nextStartsAt)}`, "", user.id, { dm: true });
      }
    } else if (!next || next.starts_at !== nextStartsAt) {
      await env.DB.prepare(
        `INSERT INTO meetings (project_id, starts_at, duration_min, kind, place, created_by, created_at) VALUES (?, ?, ?, 'adhoc', ?, ?, ?)`
      ).bind(project.id, nextStartsAt, project.meeting_duration, place, user.id, now).run();
      await notifyProject(env, project, `次回MTGが決まりました：${shortDateTime(nextStartsAt)}`, "", user.id, { dm: true });
    }
  }
  return { ok: true, nextMeeting: nextStartsAt, ids };
}

// 議事録を開いているあいだ、数秒ごとに呼ぶ。field：いま自分が書いている項目（なければ null）
// 返すもの：議事録の最新の内容・宿題の完了状況・項目ごとに書いている人・開いている人
async function liveMinutes({ request, env, user, params }) {
  const meeting = await loadMeeting(env, params.id);
  const body = await readJson(request);
  const now = Date.now();
  const editable = await canEdit(env, user, meeting.project_id);
  const field = editable && LIVE_FIELDS.includes(body.field) ? body.field : null;
  // MTGを始めた時刻（タイマーの起点）。書く画面で開いたときに記録し、4時間たっていたら始め直しとみなす
  if (editable && body.start) {
    await env.DB.prepare("UPDATE meetings SET started_at = ?1 WHERE id = ?2 AND (started_at IS NULL OR started_at < ?1 - 14400000)")
      .bind(now, meeting.id).run();
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO minute_viewers (meeting_id, user_id, seen_at) VALUES (?, ?, ?)
       ON CONFLICT(meeting_id, user_id) DO UPDATE SET seen_at = excluded.seen_at`
    ).bind(meeting.id, user.id, now),
    // 書くのをやめた項目は手放す
    env.DB.prepare("DELETE FROM minute_editors WHERE meeting_id = ? AND user_id = ? AND field != ?").bind(meeting.id, user.id, field || ""),
    env.DB.prepare("DELETE FROM minute_viewers WHERE meeting_id = ? AND seen_at < ?").bind(meeting.id, now - 86400000),
  ]);
  const blockedBy = field ? await claimField(env, meeting.id, field, user, now) : null;

  const fresh = now - LIVE_TTL;
  const [minute, editors, viewers, prev] = await Promise.all([
    env.DB.prepare(
      `SELECT n.id, n.agenda, n.summary, n.updated_at, u.name AS updated_by_name FROM minutes n LEFT JOIN users u ON u.id = n.updated_by WHERE n.meeting_id = ?`
    ).bind(meeting.id).first(),
    env.DB.prepare(
      `SELECT e.field, e.user_id, u.name FROM minute_editors e LEFT JOIN users u ON u.id = e.user_id WHERE e.meeting_id = ? AND e.seen_at >= ?`
    ).bind(meeting.id, fresh).all().then((r) => r.results),
    env.DB.prepare(
      `SELECT v.user_id, u.name FROM minute_viewers v LEFT JOIN users u ON u.id = v.user_id WHERE v.meeting_id = ? AND v.seen_at >= ? ORDER BY u.name`
    ).bind(meeting.id, fresh).all().then((r) => r.results),
    env.DB.prepare(
      `SELECT n.id FROM minutes n JOIN meetings m ON m.id = n.meeting_id
       WHERE n.project_id = ? AND m.starts_at < ? ORDER BY m.starts_at DESC LIMIT 1`
    ).bind(meeting.project_id, meeting.starts_at).first(),
  ]);
  const tasksOf = (minuteId) => env.DB.prepare(
    `SELECT ${TASK_COLUMNS} FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.source_minute_id = ? ORDER BY t.id`
  ).bind(minuteId).all().then((r) => r.results);
  const [todos, homework] = await Promise.all([minute ? tasksOf(minute.id) : [], prev ? tasksOf(prev.id) : []]);
  return {
    minute: minute ? { agenda: minute.agenda, summary: minute.summary, updated_at: minute.updated_at, updated_by_name: minute.updated_by_name } : null,
    todos,
    homework: homework.map((t) => ({ id: t.id, status: t.status })),
    editors: editors.filter((e) => e.user_id !== user.id),
    viewers: viewers.filter((v) => v.user_id !== user.id).map((v) => v.name),
    blocked: blockedBy ? blockedBy.name || "ほかの人" : null,
    started_at: body.start ? (await env.DB.prepare("SELECT started_at FROM meetings WHERE id = ?").bind(meeting.id).first())?.started_at : null,
  };
}

// 定例MTGを繰り返し予定として1件で入れるためのICS
async function regularIcs({ env, params }) {
  const project = await loadProject(env, params.id);
  const weekdays = parseWeekdays(project.meeting_weekdays);
  if (project.meeting_mode !== "regular" || !weekdays.length) throw new HttpError(400, "このPJは定例MTGが設定されていません");
  const today = nowJst().slice(0, 10);
  const from = project.start_date > today ? project.start_date : today;
  const [first] = regularOccurrences(
    { weekdays, time: project.meeting_time, interval: project.meeting_interval, anchor: project.start_date },
    from, addDays(from, 7 * project.meeting_interval + 6)
  );
  const body = buildIcs([{
    uid: `regular-${project.id}@policy-planning`,
    start: first,
    durationMin: project.meeting_duration,
    title: `${project.name} 定例MTG`,
    location: project.meeting_place,
    rrule: weeklyRule(weekdays, project.meeting_interval),
  }]);
  return icsResponse(body, `regular-${project.id}.ics`);
}
