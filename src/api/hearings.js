// 外部ヒアリングの申請：申請 → 部門長の確認 → 代表の確認 → 渉外フォーラムにスレッド作成 → 実施後の要点
// 閲覧は政策立案部門のメンバー・代表・管理者（同じ相手への重複連絡を防ぐため）。外部の方の連絡先は保存しない
import { HttpError, readJson, clean, required, int, oneOf, idList, assertUpdated } from "../util.js";
import { createForumThread, threadUrl, mention, botConfigured } from "../discord.js";
import { notify } from "../notify.js";

export const routes = [
  ["GET", "/api/hearings", listHearings],
  ["POST", "/api/hearings", createHearing],
  ["GET", "/api/hearings/:id", getHearing],
  ["PUT", "/api/hearings/:id", updateHearing],
  ["POST", "/api/hearings/:id/review", reviewHearing],
  ["POST", "/api/hearings/:id/thread", retryThread],
  ["POST", "/api/hearings/:id/done", markDone],
  ["POST", "/api/hearings/:id/withdraw", withdrawHearing],
].map(([method, path, handler]) => [method, path, (ctx) => {
  // ツールは学生チーム全員が使えるが、外部の方の情報を扱うヒアリングは部門メンバー・代表・管理者だけ
  if (!ctx.user.canSeeHearings) throw new HttpError(403, "外部ヒアリングは、政策立案部門のメンバーだけが見られます");
  return handler(ctx);
}]);

// 相手の種類。approval=true は事前確認（部門長 → 代表）が必要
export const TARGET_TYPES = {
  political_org: { label: "政治関連の団体", approval: true },
  npo: { label: "NPO団体", approval: true },
  party_hq: { label: "チームみらいの党本部", approval: true },
  supporter: { label: "チームみらいのサポーター", approval: true },
  politician: { label: "政治家", approval: true },
  school: { label: "学校法人に属する人（教授・教員など）", approval: true },
  other: { label: "その他（判断に迷う場合）", approval: true },
  acquaintance: { label: "学生チームメンバーの知人・友人", approval: false },
};

export const STATUS = {
  pending: "申請中",
  head_ok: "部門長確認済",
  rep_ok: "代表確認済",
  done: "実施済",
  returned: "差し戻し",
  recorded: "記録のみ（承認不要）",
  withdrawn: "取り下げ",
};

const headIds = (env) => idList(env.HEAD_IDS);
const repIds = (env) => idList(env.REP_IDS);
const link = (id) => `#/hearings/${id}`;

// 連絡先（メールアドレス・電話番号）は保存しない
// 電話番号は、ハイフン区切り（03-1234-5678）か携帯の11桁（09012345678）だけを見る（金額などを誤検知しないため）
const CONTACT_RE = /[\w.+-]+@[\w-]+\.[\w.-]+|(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|(?<!\d)0[789]0\d{8}(?!\d)/;
function noContact(value, label) {
  if (CONTACT_RE.test(value)) throw new HttpError(400, `${label}に連絡先（メールアドレス・電話番号）は書かないでください`);
  return value;
}

function hearingFields(body) {
  const target_type = oneOf(body.target_type, Object.keys(TARGET_TYPES), "相手の種類");
  const f = {
    target_affiliation: noContact(required(body.target_affiliation, 80, "相手の所属"), "相手の所属"),
    target_name: noContact(required(body.target_name, 40, "相手の名前"), "相手の名前"),
    target_type,
    requires_approval: TARGET_TYPES[target_type].approval ? 1 : 0,
    purpose: noContact(required(body.purpose, 300, "目的"), "目的"),
    related_issue: noContact(clean(body.related_issue, 120), "関連する課題"),
    memo: noContact(clean(body.memo, 300), "メモ"),
    project_id: body.project_id ? int(body.project_id, { label: "PJ" }) : null,
    node_id: body.node_id ? int(body.node_id, { label: "関連する課題" }) : null,
  };
  return f;
}

// 関連する課題（樹形図のノード）は、選んだPJのものだけ
async function assertNode(env, f) {
  if (!f.node_id) return;
  const node = await env.DB.prepare("SELECT project_id FROM tree_nodes WHERE id = ?").bind(f.node_id).first();
  if (!node || node.project_id !== f.project_id) throw new HttpError(400, "関連する課題は、選んだPJの樹形図から選んでください");
}

function event(env, hearingId, actorId, action, comment = "") {
  return env.DB.prepare("INSERT INTO hearing_events (hearing_id, actor_id, action, comment, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(hearingId, actorId, action, comment, Date.now());
}

function targetLabel(h) {
  return `${h.target_affiliation} ${h.target_name}さん`;
}

async function loadHearing(env, id) {
  const h = await env.DB.prepare(
    `SELECT h.*, u.name AS applicant_name, u.avatar AS applicant_avatar, p.name AS project_name, n.title AS node_title
     FROM hearings h JOIN users u ON u.id = h.applicant_id LEFT JOIN projects p ON p.id = h.project_id
     LEFT JOIN tree_nodes n ON n.id = h.node_id WHERE h.id = ?`
  ).bind(id).first();
  if (!h) throw new HttpError(404, "申請が見つかりません");
  return h;
}

async function listHearings({ env, user }) {
  const { results } = await env.DB.prepare(
    `SELECT h.id, h.target_affiliation, h.target_name, h.target_type, h.purpose, h.status, h.requires_approval,
            h.thread_id, h.created_at, h.updated_at, h.applicant_id, u.name AS applicant_name, u.avatar AS applicant_avatar,
            p.name AS project_name
     FROM hearings h JOIN users u ON u.id = h.applicant_id LEFT JOIN projects p ON p.id = h.project_id
     ORDER BY h.updated_at DESC`
  ).all();
  return {
    hearings: results.map((h) => ({ ...h, thread_url: h.thread_id ? threadUrl(env, h.thread_id) : null })),
    // 自分が今、確認すべき件数
    toReview: results.filter((h) => (h.status === "pending" && user.isHead) || (h.status === "head_ok" && user.isRep)).length,
    types: Object.fromEntries(Object.entries(TARGET_TYPES).map(([k, v]) => [k, v])),
    statuses: STATUS,
    botReady: botConfigured(env) && Boolean(env.HEARING_FORUM_ID),
  };
}

async function getHearing({ env, user, params }) {
  const h = await loadHearing(env, params.id);
  const { results: events } = await env.DB.prepare(
    `SELECT e.action, e.comment, e.created_at, u.name AS actor_name FROM hearing_events e
     LEFT JOIN users u ON u.id = e.actor_id WHERE e.hearing_id = ? ORDER BY e.created_at, e.id`
  ).bind(h.id).all();
  // 同じ相手（所属か名前が同じ）への、ほかの申請
  const { results: related } = await env.DB.prepare(
    `SELECT h.id, h.status, h.purpose, h.created_at, u.name AS applicant_name FROM hearings h JOIN users u ON u.id = h.applicant_id
     WHERE h.id != ?1 AND h.status != 'withdrawn' AND (h.target_name = ?2 OR h.target_affiliation = ?3) ORDER BY h.created_at DESC LIMIT 10`
  ).bind(h.id, h.target_name, h.target_affiliation).all();
  const isApplicant = h.applicant_id === user.id;
  return {
    hearing: { ...h, thread_url: h.thread_id ? threadUrl(env, h.thread_id) : null },
    events,
    related,
    types: TARGET_TYPES,
    statuses: STATUS,
    can: {
      edit: isApplicant && ["pending", "returned"].includes(h.status),
      headReview: user.isHead && h.status === "pending",
      repReview: user.isRep && h.status === "head_ok",
      retryThread: (user.isHead || user.isRep) && h.status === "rep_ok" && !h.thread_id,
      done: isApplicant && ["rep_ok", "recorded", "done"].includes(h.status),
      withdraw: isApplicant && ["pending", "returned", "recorded", "head_ok"].includes(h.status),
    },
  };
}

async function createHearing({ request, env, user }) {
  const f = hearingFields(await readJson(request));
  await assertNode(env, f);
  const now = Date.now();
  const status = f.requires_approval ? "pending" : "recorded";
  const row = await env.DB.prepare(
    `INSERT INTO hearings (applicant_id, target_affiliation, target_name, target_type, requires_approval, purpose, related_issue,
       project_id, node_id, memo, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(user.id, f.target_affiliation, f.target_name, f.target_type, f.requires_approval, f.purpose, f.related_issue,
    f.project_id, f.node_id, f.memo, status, now, now).first();
  await event(env, row.id, user.id, "submit").run();
  if (f.requires_approval) {
    await notify(env, headIds(env),
      `【ヒアリング申請】${user.name}さんから、${targetLabel(f)}（${TARGET_TYPES[f.target_type].label}）へのヒアリング申請が届きました。確認をお願いします。`,
      link(row.id));
  }
  return { id: row.id, status };
}

// 申請者による修正。差し戻し後に直すと、部門長の確認からやり直す
async function updateHearing({ request, env, user, params }) {
  const h = await loadHearing(env, params.id);
  if (h.applicant_id !== user.id) throw new HttpError(403, "申請を修正できるのは申請者です");
  if (!["pending", "returned"].includes(h.status)) throw new HttpError(400, "確認が進んだ申請は修正できません");
  const body = await readJson(request);
  const f = hearingFields(body);
  await assertNode(env, f);
  const status = f.requires_approval ? "pending" : "recorded";
  const res = await env.DB.prepare(
    `UPDATE hearings SET target_affiliation=?, target_name=?, target_type=?, requires_approval=?, purpose=?, related_issue=?,
       project_id=?, node_id=?, memo=?, status=?, updated_at=?, version = version + 1 WHERE id = ? AND version = ?`
  ).bind(f.target_affiliation, f.target_name, f.target_type, f.requires_approval, f.purpose, f.related_issue, f.project_id,
    f.node_id, f.memo, status, Date.now(), h.id, int(body.version, { label: "版" })).run();
  assertUpdated(res, "この申請");
  const resubmitted = h.status === "returned";
  await event(env, h.id, user.id, resubmitted ? "resubmit" : "edit").run();
  if (resubmitted && f.requires_approval) {
    await notify(env, headIds(env), `【ヒアリング再申請】${user.name}さんが、差し戻された申請（${targetLabel(f)}）を修正して再申請しました。`, link(h.id));
  }
  return { ok: true, status };
}

// 部門長・代表の確認。差し戻しはコメント必須
async function reviewHearing({ request, env, user, params }) {
  const h = await loadHearing(env, params.id);
  const body = await readJson(request);
  const decision = oneOf(body.decision, ["approve", "return"], "判断");
  const comment = clean(body.comment, 500);
  if (decision === "return" && !comment) throw new HttpError(400, "差し戻すときは、理由をコメントに書いてください");

  let stage;
  if (h.status === "pending") {
    if (!user.isHead) throw new HttpError(403, "この段階で確認できるのは部門長です");
    stage = "head";
  } else if (h.status === "head_ok") {
    if (!user.isRep) throw new HttpError(403, "この段階で確認できるのは代表です");
    stage = "rep";
  } else {
    throw new HttpError(400, "この申請は確認待ちではありません");
  }

  const next = decision === "return" ? "returned" : stage === "head" ? "head_ok" : "rep_ok";
  // 同時に2人が押しても、状態が変わるのは1回だけ
  const res = await env.DB.prepare("UPDATE hearings SET status = ?, updated_at = ?, version = version + 1 WHERE id = ? AND status = ?")
    .bind(next, Date.now(), h.id, h.status).run();
  assertUpdated(res, "この申請");
  await event(env, h.id, user.id, `${stage}_${decision}`, comment).run();

  const who = stage === "head" ? "部門長" : "代表";
  if (decision === "return") {
    await notify(env, [h.applicant_id], `【ヒアリング申請】${targetLabel(h)}への申請が${who}から差し戻されました。\nコメント：${comment}\n内容を直して再申請してください。`, link(h.id));
    return { ok: true, status: next };
  }
  if (stage === "head") {
    await notify(env, [h.applicant_id], `【ヒアリング申請】${targetLabel(h)}への申請を部門長が確認しました。次は代表の確認です。`, link(h.id));
    await notify(env, repIds(env), `【ヒアリング申請】${h.applicant_name}さんの、${targetLabel(h)}へのヒアリング申請を部門長が確認しました。代表の確認をお願いします。`, link(h.id));
    return { ok: true, status: next };
  }
  const threadId = await openThread(env, h);
  await notify(env, [h.applicant_id], threadId
    ? `【ヒアリング申請】${targetLabel(h)}への申請を代表が確認しました。渉外フォーラムにスレッドを作りました。以降のやりとりはこのスレッドで行ってください。\n${threadUrl(env, threadId)}`
    : `【ヒアリング申請】${targetLabel(h)}への申請を代表が確認しました。渉外フォーラムのスレッドは、まだ作れていません（部門長・代表が作り直せます）。`,
  link(h.id));
  return { ok: true, status: next, threadCreated: Boolean(threadId) };
}

// 渉外フォーラムにスレッドを作る。最初の投稿は申請者・相手・目的
async function openThread(env, h) {
  const content = [
    `**外部ヒアリング**（部門長・代表 確認済み）`,
    `申請者：${mention(h.applicant_id) || h.applicant_name}`,
    `相手：${h.target_affiliation} ${h.target_name}さん（${TARGET_TYPES[h.target_type]?.label || ""}）`,
    `目的：${h.purpose}`,
    h.node_title || h.related_issue ? `関連する課題：${[h.node_title, h.related_issue].filter(Boolean).join("／")}` : "",
    h.project_name ? `PJ：${h.project_name}` : "",
    "",
    "以降の外部とのやりとり（メールの貼り付けなど）は、このスレッドで行ってください。",
  ].filter((l) => l !== "").join("\n");
  const threadId = await createForumThread(env, {
    name: `【ヒアリング】${h.target_affiliation} ${h.target_name}さん`,
    content,
    mentionUserIds: [h.applicant_id],
  });
  if (threadId) {
    await env.DB.batch([
      env.DB.prepare("UPDATE hearings SET thread_id = ?, updated_at = ? WHERE id = ?").bind(threadId, Date.now(), h.id),
      event(env, h.id, null, "thread_created"),
    ]);
  } else {
    await event(env, h.id, null, "thread_failed",
      botConfigured(env) && env.HEARING_FORUM_ID ? "Botの権限かフォーラムの設定を確認してください" : "Botまたは渉外フォーラムが未設定です").run();
  }
  return threadId;
}

async function retryThread({ env, user, params }) {
  const h = await loadHearing(env, params.id);
  if (!user.isHead && !user.isRep) throw new HttpError(403, "スレッドを作り直せるのは部門長と代表です");
  if (h.status !== "rep_ok" || h.thread_id) throw new HttpError(400, "この申請はスレッドを作る段階ではありません");
  const threadId = await openThread(env, h);
  if (!threadId) throw new HttpError(502, "スレッドを作れませんでした。Botの設定と権限を確認してください");
  await notify(env, [h.applicant_id], `【ヒアリング申請】渉外フォーラムにスレッドを作りました。\n${threadUrl(env, threadId)}`, link(h.id));
  return { ok: true };
}

// 実施後に、申請者が聞けた内容の要点を記入する（実施済のあとも直せる）
async function markDone({ request, env, user, params }) {
  const h = await loadHearing(env, params.id);
  if (h.applicant_id !== user.id) throw new HttpError(403, "実施済にできるのは申請者です");
  if (!["rep_ok", "recorded", "done"].includes(h.status)) throw new HttpError(400, "確認が済んでいない申請は実施済にできません");
  const body = await readJson(request);
  const summary = noContact(required(body.result_summary, 600, "聞けた内容の要点"), "要点");
  await env.DB.batch([
    env.DB.prepare("UPDATE hearings SET status = 'done', result_summary = ?, updated_at = ?, version = version + 1 WHERE id = ?")
      .bind(summary, Date.now(), h.id),
    event(env, h.id, user.id, "done"),
  ]);
  return { ok: true };
}

async function withdrawHearing({ env, user, params }) {
  const h = await loadHearing(env, params.id);
  if (h.applicant_id !== user.id) throw new HttpError(403, "取り下げられるのは申請者です");
  if (!["pending", "returned", "recorded", "head_ok"].includes(h.status)) throw new HttpError(400, "この申請は取り下げられません");
  await env.DB.batch([
    env.DB.prepare("UPDATE hearings SET status = 'withdrawn', updated_at = ?, version = version + 1 WHERE id = ?").bind(Date.now(), h.id),
    event(env, h.id, user.id, "withdraw"),
  ]);
  return { ok: true };
}
