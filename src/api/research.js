// フェーズ2：資料管理・因果の樹形図・施策
import { HttpError, readJson, clean, required, int, oneOf, optUrl, assertUpdated } from "../util.js";
import { loadProject, requireEditor, canEdit, assertUsers } from "./common.js";

export const routes = [
  ["GET", "/api/sources", listSources],
  ["POST", "/api/sources", createSource],
  ["PATCH", "/api/sources/:id", updateSource],
  ["DELETE", "/api/sources/:id", deleteSource],
  ["GET", "/api/projects/:id/tree", getTree],
  ["POST", "/api/projects/:id/nodes", createNode],
  ["PATCH", "/api/nodes/:id", updateNode],
  ["DELETE", "/api/nodes/:id", deleteNode],
  ["POST", "/api/projects/:id/measures", createMeasure],
  ["PATCH", "/api/measures/:id", updateMeasure],
  ["DELETE", "/api/measures/:id", deleteMeasure],
];

export const SOURCE_KINDS = {
  paper: "論文", book: "書籍", whitepaper: "白書", statistics: "統計", news: "報道",
  hearing: "ヒアリング", government: "行政資料", other: "その他",
};

// ---------- 資料 ----------

function sourceFields(body) {
  return {
    title: required(body.title, 150, "資料のタイトル"),
    url: optUrl(body.url),
    kind: oneOf(body.kind, Object.keys(SOURCE_KINDS), "資料の種類"),
    publisher: clean(body.publisher, 100),
    published_on: clean(body.published_on, 20),
    summary: clean(body.summary, 1000),
    project_id: body.project_id ? int(body.project_id, { label: "PJ" }) : null,
  };
}

const SOURCE_SELECT = `SELECT s.*, p.name AS project_name, u.name AS created_by_name, c.name AS checked_by_name,
    (SELECT COUNT(*) FROM node_sources ns WHERE ns.source_id = s.id) AS node_count
  FROM sources s LEFT JOIN projects p ON p.id = s.project_id
  LEFT JOIN users u ON u.id = s.created_by LEFT JOIN users c ON c.id = s.checked_by`;

// 絞り込み：project（ID / 'none' = 共通）、kind、checked（1 / 0）、q（タイトル・出典・要点）
async function listSources({ env, url, user }) {
  const where = [];
  const binds = [];
  const project = url.searchParams.get("project");
  if (project === "none") where.push("s.project_id IS NULL");
  else if (project) { where.push("s.project_id = ?"); binds.push(int(project, { label: "PJ" })); }
  const kind = url.searchParams.get("kind");
  if (kind) { where.push("s.kind = ?"); binds.push(oneOf(kind, Object.keys(SOURCE_KINDS), "種類")); }
  const checked = url.searchParams.get("checked");
  if (checked === "1" || checked === "0") { where.push("s.primary_checked = ?"); binds.push(Number(checked)); }
  const q = clean(url.searchParams.get("q") || "", 50);
  if (q) {
    where.push("(s.title LIKE ? OR s.publisher LIKE ? OR s.summary LIKE ?)");
    const like = `%${q.replace(/[%_]/g, "")}%`;
    binds.push(like, like, like);
  }
  const { results } = await env.DB.prepare(
    `${SOURCE_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY s.created_at DESC LIMIT 500`
  ).bind(...binds).all();
  // 画面で編集ボタンを出すかどうか（実際の権限チェックは更新時にサーバーで行う）
  const { results: mine } = await env.DB.prepare("SELECT project_id FROM project_members WHERE user_id = ?").bind(user.id).all();
  const myProjects = new Set(mine.map((r) => r.project_id));
  return {
    sources: results.map((s) => ({ ...s, can_edit: s.created_by === user.id || user.isAdmin || myProjects.has(s.project_id) })),
    kinds: SOURCE_KINDS,
  };
}

// PJの資料はPJメンバーと管理者、共通の資料は誰でも登録できる
async function createSource({ request, env, user }) {
  const body = await readJson(request);
  const f = sourceFields(body);
  if (f.project_id) { await loadProject(env, f.project_id); await requireEditor(env, user, f.project_id); }
  const checked = body.primary_checked ? 1 : 0;
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO sources (project_id, title, url, kind, publisher, published_on, summary, primary_checked, checked_by, checked_at,
       created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(f.project_id, f.title, f.url, f.kind, f.publisher, f.published_on, f.summary, checked,
    checked ? user.id : null, checked ? now : null, user.id, now, now).first();
  return { id: row.id };
}

async function loadEditableSource(env, user, id) {
  const s = await env.DB.prepare("SELECT * FROM sources WHERE id = ?").bind(id).first();
  if (!s) throw new HttpError(404, "資料が見つかりません");
  const ok = s.created_by === user.id || user.isAdmin || (s.project_id && await canEdit(env, user, s.project_id));
  if (!ok) throw new HttpError(403, "この資料を変更できるのは、登録した人・PJメンバー・管理者です");
  return s;
}

// 送られた項目だけ更新する（「一次出典を確認済み」のチェックだけ、なども可）
async function updateSource({ request, env, user, params }) {
  const s = await loadEditableSource(env, user, params.id);
  const body = await readJson(request);
  const next = "title" in body ? sourceFields({ ...s, ...body }) : s;
  if (next.project_id && next.project_id !== s.project_id) await requireEditor(env, user, next.project_id);
  let checked = s.primary_checked, checkedBy = s.checked_by, checkedAt = s.checked_at;
  if ("primary_checked" in body && Boolean(body.primary_checked) !== Boolean(s.primary_checked)) {
    checked = body.primary_checked ? 1 : 0;
    checkedBy = checked ? user.id : null;
    checkedAt = checked ? Date.now() : null;
  }
  const version = body.version === undefined ? s.version : int(body.version, { label: "版" });
  const res = await env.DB.prepare(
    `UPDATE sources SET project_id=?, title=?, url=?, kind=?, publisher=?, published_on=?, summary=?, primary_checked=?,
       checked_by=?, checked_at=?, updated_at=?, version = version + 1 WHERE id = ? AND version = ?`
  ).bind(next.project_id, next.title, next.url, next.kind, next.publisher, next.published_on, next.summary,
    checked, checkedBy, checkedAt, Date.now(), s.id, version).run();
  assertUpdated(res, "この資料");
  return { ok: true };
}

async function deleteSource({ env, user, params }) {
  const s = await loadEditableSource(env, user, params.id);
  await env.DB.prepare("DELETE FROM sources WHERE id = ?").bind(s.id).run();
  return { ok: true };
}

// ---------- 樹形図 ----------

async function getTree({ env, user, params }) {
  const project = await loadProject(env, params.id);
  const [nodes, links, sources, measures] = await Promise.all([
    env.DB.prepare(
      `SELECT n.*, o.name AS owner_name, u.name AS updated_by_name FROM tree_nodes n
       LEFT JOIN users o ON o.id = n.owner_id LEFT JOIN users u ON u.id = n.updated_by
       WHERE n.project_id = ? ORDER BY n.sort, n.id`
    ).bind(project.id).all(),
    env.DB.prepare(
      `SELECT ns.node_id, ns.source_id FROM node_sources ns JOIN tree_nodes n ON n.id = ns.node_id WHERE n.project_id = ?`
    ).bind(project.id).all(),
    // 樹形図で選べる資料：このPJの資料と部門共通の資料
    env.DB.prepare(
      "SELECT id, title, kind, publisher, published_on, url, primary_checked, project_id FROM sources WHERE project_id = ? OR project_id IS NULL ORDER BY created_at DESC"
    ).bind(project.id).all(),
    env.DB.prepare(
      `SELECT m.*, o.name AS owner_name, u.name AS updated_by_name FROM measures m
       LEFT JOIN users o ON o.id = m.owner_id LEFT JOIN users u ON u.id = m.updated_by
       WHERE m.project_id = ? ORDER BY m.node_id IS NULL, m.created_at`
    ).bind(project.id).all(),
  ]);
  const byNode = {};
  for (const l of links.results) (byNode[l.node_id] ||= []).push(l.source_id);
  return {
    project: { id: project.id, name: project.name, type: project.type },
    canEdit: await canEdit(env, user, project.id),
    nodes: nodes.results.map((n) => ({ ...n, source_ids: byNode[n.id] || [] })),
    sources: sources.results,
    measures: measures.results,
    kinds: SOURCE_KINDS,
  };
}

async function nodeFields(env, body, projectId) {
  const f = {
    kind: oneOf(body.kind || "cause", ["issue", "cause"], "ノードの種類"),
    title: required(body.title, 120, "ノードのタイトル"),
    description: clean(body.description, 1000),
    evidence: clean(body.evidence, 1000),
    cases_domestic: clean(body.cases_domestic, 1000),
    cases_overseas: clean(body.cases_overseas, 1000),
    memo: clean(body.memo, 1000),
    owner_id: typeof body.owner_id === "string" && body.owner_id ? body.owner_id : null,
  };
  await assertUsers(env, [f.owner_id]);
  return f;
}

async function sourceIds(env, body, projectId) {
  if (!Array.isArray(body.source_ids)) return null;
  const ids = [...new Set(body.source_ids.map((x) => int(x, { label: "資料" })))].slice(0, 50);
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT id FROM sources WHERE (project_id = ? OR project_id IS NULL) AND id IN (${ids.map(() => "?").join(",")})`
  ).bind(projectId, ...ids).all();
  if (results.length !== ids.length) throw new HttpError(400, "このPJで使えない資料が含まれています");
  return ids;
}

function linkStatements(env, nodeId, ids) {
  return [
    env.DB.prepare("DELETE FROM node_sources WHERE node_id = ?").bind(nodeId),
    ...ids.map((sid) => env.DB.prepare("INSERT INTO node_sources (node_id, source_id) VALUES (?, ?)").bind(nodeId, sid)),
  ];
}

async function loadParent(env, projectId, parentId) {
  if (!parentId) return null;
  const parent = await env.DB.prepare("SELECT id FROM tree_nodes WHERE id = ? AND project_id = ?").bind(parentId, projectId).first();
  if (!parent) throw new HttpError(400, "親のノードが見つかりません");
  return parent.id;
}

async function createNode({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const body = await readJson(request);
  const f = await nodeFields(env, body, project.id);
  const parentId = await loadParent(env, project.id, body.parent_id ? int(body.parent_id, { label: "親" }) : null);
  if (!parentId) f.kind = "issue"; // 根は課題
  const ids = (await sourceIds(env, body, project.id)) || [];
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO tree_nodes (project_id, parent_id, kind, title, description, evidence, cases_domestic, cases_overseas, memo, owner_id,
       sort, created_by, updated_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
       (SELECT COALESCE(MAX(sort), 0) + 1 FROM tree_nodes WHERE project_id = ?1 AND parent_id IS ?2), ?11, ?11, ?12, ?12) RETURNING id`
  ).bind(project.id, parentId, f.kind, f.title, f.description, f.evidence, f.cases_domestic, f.cases_overseas, f.memo, f.owner_id,
    user.id, now).first();
  if (ids.length) await env.DB.batch(linkStatements(env, row.id, ids));
  return { id: row.id };
}

async function loadNode(env, user, id) {
  const node = await env.DB.prepare("SELECT * FROM tree_nodes WHERE id = ?").bind(id).first();
  if (!node) throw new HttpError(404, "ノードが見つかりません");
  await requireEditor(env, user, node.project_id);
  return node;
}

// 親を付け替えるとき、自分の子孫の下には入れない（輪になるため）
async function assertNotDescendant(env, nodeId, newParentId) {
  let cur = newParentId;
  for (let i = 0; cur && i < 200; i++) {
    if (cur === nodeId) throw new HttpError(400, "自分自身やその下のノードを親にはできません");
    cur = (await env.DB.prepare("SELECT parent_id FROM tree_nodes WHERE id = ?").bind(cur).first())?.parent_id;
  }
}

async function updateNode({ request, env, user, params }) {
  const node = await loadNode(env, user, params.id);
  const body = await readJson(request);
  const f = await nodeFields(env, { ...node, ...body }, node.project_id);
  let parentId = node.parent_id;
  if ("parent_id" in body) {
    parentId = await loadParent(env, node.project_id, body.parent_id ? int(body.parent_id, { label: "親" }) : null);
    await assertNotDescendant(env, node.id, parentId);
  }
  if (!parentId) f.kind = "issue";
  const ids = await sourceIds(env, body, node.project_id);
  // 楽観ロック：開いてから他の人が保存していたら、上書きせずに知らせる
  const res = await env.DB.prepare(
    `UPDATE tree_nodes SET parent_id=?, kind=?, title=?, description=?, evidence=?, cases_domestic=?, cases_overseas=?, memo=?,
       owner_id=?, updated_by=?, updated_at=?, version = version + 1 WHERE id = ? AND version = ?`
  ).bind(parentId, f.kind, f.title, f.description, f.evidence, f.cases_domestic, f.cases_overseas, f.memo, f.owner_id,
    user.id, Date.now(), node.id, int(body.version, { label: "版" })).run();
  assertUpdated(res, "このノード");
  if (ids) await env.DB.batch(linkStatements(env, node.id, ids));
  return { ok: true };
}

async function deleteNode({ env, user, params }) {
  const node = await loadNode(env, user, params.id);
  const child = await env.DB.prepare("SELECT 1 FROM tree_nodes WHERE parent_id = ?").bind(node.id).first();
  if (child) throw new HttpError(400, "下に原因のノードがあるので削除できません。先に下のノードを削除するか、別の親に移してください");
  await env.DB.batch([
    env.DB.prepare("UPDATE measures SET node_id = NULL WHERE node_id = ?").bind(node.id),
    env.DB.prepare("DELETE FROM tree_nodes WHERE id = ?").bind(node.id),
  ]);
  return { ok: true };
}

// ---------- 施策 ----------

async function measureFields(env, body, projectId) {
  const f = {
    title: required(body.title, 120, "施策の名前"),
    current_state: clean(body.current_state, 2000),
    problem: clean(body.problem, 2000),
    cases: clean(body.cases, 2000),
    what: clean(body.what, 2000),
    flow: clean(body.flow, 2000),
    budget: clean(body.budget, 1000),
    faq: clean(body.faq, 2000),
    owner_id: typeof body.owner_id === "string" && body.owner_id ? body.owner_id : null,
    node_id: body.node_id ? int(body.node_id, { label: "課題" }) : null,
  };
  await assertUsers(env, [f.owner_id]);
  if (f.node_id) await loadParent(env, projectId, f.node_id);
  return f;
}

async function createMeasure({ request, env, user, params }) {
  const project = await loadProject(env, params.id);
  await requireEditor(env, user, project.id);
  const f = await measureFields(env, await readJson(request), project.id);
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO measures (project_id, node_id, title, current_state, problem, cases, what, flow, budget, faq, owner_id,
       created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(project.id, f.node_id, f.title, f.current_state, f.problem, f.cases, f.what, f.flow, f.budget, f.faq, f.owner_id,
    user.id, user.id, now, now).first();
  return { id: row.id };
}

async function loadMeasure(env, user, id) {
  const m = await env.DB.prepare("SELECT * FROM measures WHERE id = ?").bind(id).first();
  if (!m) throw new HttpError(404, "施策が見つかりません");
  await requireEditor(env, user, m.project_id);
  return m;
}

async function updateMeasure({ request, env, user, params }) {
  const m = await loadMeasure(env, user, params.id);
  const body = await readJson(request);
  const f = await measureFields(env, { ...m, ...body }, m.project_id);
  const res = await env.DB.prepare(
    `UPDATE measures SET node_id=?, title=?, current_state=?, problem=?, cases=?, what=?, flow=?, budget=?, faq=?, owner_id=?,
       updated_by=?, updated_at=?, version = version + 1 WHERE id = ? AND version = ?`
  ).bind(f.node_id, f.title, f.current_state, f.problem, f.cases, f.what, f.flow, f.budget, f.faq, f.owner_id,
    user.id, Date.now(), m.id, int(body.version, { label: "版" })).run();
  assertUpdated(res, "この施策");
  return { ok: true };
}

async function deleteMeasure({ env, user, params }) {
  const m = await loadMeasure(env, user, params.id);
  await env.DB.prepare("DELETE FROM measures WHERE id = ?").bind(m.id).run();
  return { ok: true };
}
