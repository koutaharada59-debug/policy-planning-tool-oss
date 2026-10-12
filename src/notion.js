// Notion との連携：MTGの議事録を、PJのNotionページ（見出し「議事録」の下）に新しいページとして作る
// NOTION_TOKEN（Notionのインテグレーションのトークン。シークレット）が必要。PJのページをそのインテグレーションに「接続」しておく
import { HttpError } from "./util.js";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

export function notionConfigured(env) {
  return Boolean(env.NOTION_TOKEN);
}

// NotionのページのURLから、ページID（32桁）を取り出す
export function notionPageId(url) {
  const m = String(url || "").replace(/-/g, "").match(/([0-9a-f]{32})(?:[?#]|$)/i);
  return m ? m[1] : null;
}

const rich = (text) => [{ type: "text", text: { content: String(text).slice(0, 1900) } }];
// **太字** *斜体* ~~取り消し~~ `コード` [文字](URL) とURLを、Notionの書式つき文字にする（リンクはNotionでもクリックで開ける）
const INLINE = /\*\*([^*]+)\*\*|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"']+)|(?<![*])\*([^*\s][^*]*)\*/g;
function inline(text) {
  const out = [];
  const push = (content, annotations = {}, link = null) => {
    if (!content) return;
    out.push({ type: "text", text: { content: content.slice(0, 1900), ...(link ? { link: { url: link } } : {}) }, annotations });
  };
  let last = 0;
  const s = String(text);
  for (const m of s.matchAll(INLINE)) {
    push(s.slice(last, m.index));
    if (m[1]) push(m[1], { bold: true });
    else if (m[2]) push(m[2], { strikethrough: true });
    else if (m[3]) push(m[3], { code: true });
    else if (m[4]) push(m[4], {}, m[5]);
    else if (m[6]) push(m[6], {}, m[6]);
    else if (m[7]) push(m[7], { italic: true });
    last = m.index + m[0].length;
  }
  push(s.slice(last));
  return out.length ? out.slice(0, 100) : rich("");
}
const heading = (text) => ({ object: "block", type: "heading_3", heading_3: { rich_text: rich(text) } });
const bullet = (text) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(text) } });
const todo = (text, checked = false) => ({ object: "block", type: "to_do", to_do: { rich_text: rich(text), checked } });
const para = (text) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich(text) } });

// 書式つきの文章（Markdown）を、行ごとにNotionのブロックにする
const lines = (text) => String(text || "").split("\n").filter((l) => l.trim());
const block = (type, text, extra = {}) => ({ object: "block", type, [type]: { rich_text: inline(text), ...extra } });
function mdBlock(line) {
  let m;
  if ((m = line.match(/^▶\s?(.*)$/))) return block("toggle", m[1]);
  if ((m = line.match(/^💡\s?(.*)$/u))) return block("callout", m[1], { icon: { type: "emoji", emoji: "💡" }, color: "gray_background" });
  if ((m = line.match(/^###\s+(.*)$/))) return block("heading_3", m[1]);
  if ((m = line.match(/^##\s+(.*)$/))) return block("heading_2", m[1]);
  if ((m = line.match(/^#\s+(.*)$/))) return block("heading_1", m[1]);
  if ((m = line.match(/^\s*\[( |x|X)\]\s?(.*)$/))) return block("to_do", m[2], { checked: m[1].toLowerCase() === "x" });
  if ((m = line.match(/^\s*[-*・]\s?(.*)$/))) return block("bulleted_list_item", m[1]);
  if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) return block("numbered_list_item", m[1]);
  if ((m = line.match(/^>\s?(.*)$/))) return block("quote", m[1]);
  if (/^-{3,}$/.test(line.trim())) return { object: "block", type: "divider", divider: {} };
  if (/^https?:\/\/\S+$/.test(line.trim())) return { object: "block", type: "bookmark", bookmark: { url: line.trim() } };
  return block("bulleted_list_item", line.trim());
}

// 字下げ（行頭の空白2つで1段）を、Notionの入れ子（トグルの中身など）にする。1回で作れるのは2段まで
const CAN_NEST = ["toggle", "callout", "bulleted_list_item", "numbered_list_item", "to_do", "quote", "paragraph"];
function nest(text) {
  const out = [];
  const stack = [];
  for (const raw of lines(text)) {
    const indent = Math.min(2, Math.floor(raw.match(/^ */)[0].length / 2));
    const b = mdBlock(raw.trim());
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent && CAN_NEST.includes(parent.block.type)) (parent.block[parent.block.type].children ||= []).push(b);
    else out.push(b);
    stack.push({ indent, block: b });
  }
  return out;
}

// 議事録の中身 → Notionのブロック（見出し・箇条書き・チェックボックス）
export function minutesBlocks({ homework = [], agenda = "", summary = "", todos = [], appUrl = "" }) {
  const blocks = [];
  if (homework.length) {
    blocks.push(heading("前回の宿題"));
    for (const t of homework) blocks.push(todo(`${t.title}（${t.assignee_name || "担当未定"}）`, t.status === "done"));
  }
  blocks.push(heading("今回話し合うこと"));
  blocks.push(...(lines(agenda).length ? nest(agenda) : [para("（なし）")]));
  blocks.push(heading("概要"));
  blocks.push(...(lines(summary).length ? nest(summary) : [para("（なし）")]));
  blocks.push(heading("次回までにやること"));
  blocks.push(...(todos.length ? todos.map((t) => todo(`${t.title}（${t.assignee_name || "担当未定"}${t.due_date ? `・${t.due_date.slice(5).replace("-", "/")}まで` : ""}）`, t.status === "done")) : [para("（なし）")]));
  if (appUrl) blocks.push(para(`政策立案ツールの議事録：${appUrl}`));
  return blocks.slice(0, 100);
}

const headers = (env) => ({ Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": VERSION, "Content-Type": "application/json" });
async function call(env, path, method, body) {
  const res = await fetch(`${API}${path}`, { method, headers: headers(env), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("notion api failed", method, path.replace(/[0-9a-f-]{32,36}/g, "…"), res.status, data.code);
    throw Object.assign(new Error("notion"), { status: res.status, code: data.code });
  }
  return data;
}

// 作ってあるNotionの議事録ページを、いまの内容で書き直す（題名と中身を入れ替える）
export async function replaceNotionPage(env, pageUrl, title, children) {
  const id = notionPageId(pageUrl);
  if (!id) return;
  await call(env, `/pages/${id}`, "PATCH", { properties: { title: { title: rich(title) } } });
  let cursor;
  const old = [];
  do {
    const r = await call(env, `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`, "GET");
    old.push(...r.results.map((b) => b.id));
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor);
  for (const b of old) await call(env, `/blocks/${b}`, "DELETE");
  await call(env, `/blocks/${id}/children`, "PATCH", { children: children.slice(0, 100) });
}

// ---------- メンバー（Notionのワークスペースに入っている人） ----------
export async function listNotionUsers(env) {
  const out = [];
  let cursor;
  do {
    const r = await call(env, `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`, "GET");
    for (const u of r.results) if (u.type === "person") out.push({ id: u.id, name: u.name || "", avatar: u.avatar_url || "" });
    cursor = r.has_more ? r.next_cursor : null;
  } while (cursor && out.length < 1000);
  return out.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

// ---------- PJのページ：今あるPJページと同じデータベースに「PJ名」のページを作り、参加者を入れ、見出し「議事録」を置く ----------
// データベースは、前のPJのNotionページ（sampleUrl）の親から調べる（NOTION_PJ_DB があればそれを使う）
export async function createProjectPage(env, { name, notionUserIds, sampleUrl }) {
  let dbId = env.NOTION_PJ_DB || "";
  if (!dbId && sampleUrl) {
    const sample = await call(env, `/pages/${notionPageId(sampleUrl)}`, "GET");
    dbId = sample.parent?.type === "database_id" ? sample.parent.database_id : "";
  }
  if (!dbId) return null;
  const db = await call(env, `/databases/${dbId}`, "GET");
  const props = {};
  const entries = Object.entries(db.properties || {});
  const title = entries.find(([, p]) => p.type === "title")?.[0];
  if (title) props[title] = { title: rich(name) };
  // 参加者の欄：人を入れる欄（名前に「参加」「メンバー」があればそれ、なければ最初の欄）
  const people = entries.filter(([, p]) => p.type === "people");
  const who = (people.find(([n]) => /参加|メンバー|member/i.test(n)) || people[0])?.[0];
  if (who && notionUserIds.length) props[who] = { people: notionUserIds.map((id) => ({ object: "user", id })) };
  const page = await call(env, "/pages", "POST", {
    parent: { database_id: dbId }, properties: props,
    children: [{ object: "block", type: "heading_2", heading_2: { rich_text: rich("議事録") } }],
  });
  return page.url;
}

// ---------- 定例の議事録 → 部門の「議事録」データベース ----------
// データベースの欄（タイトル・日付・種類・部門へのリンク）は名前が変わってもいいように、欄の種類で探す
export async function createTeireiPage(env, { title, date, children }) {
  const db = await call(env, `/databases/${env.NOTION_TEIREI_DB}`, "GET");
  const props = {};
  for (const [name, p] of Object.entries(db.properties || {})) {
    if (p.type === "title") props[name] = { title: rich(title) };
    else if (p.type === "date" && !props.__date) { props[name] = { date: { start: date } }; props.__date = true; }
    else if (p.type === "select" && p.select.options.some((o) => o.name === "定例会議")) props[name] = { select: { name: "定例会議" } };
    else if (p.type === "relation" && env.NOTION_DEPT_PAGE) props[name] = { relation: [{ id: env.NOTION_DEPT_PAGE }] };
  }
  delete props.__date;
  const page = await call(env, "/pages", "POST", { parent: { database_id: env.NOTION_TEIREI_DB }, properties: props, children });
  return page.url;
}

// 同じ題名のページがもうあるか（手で作った回を二重に作らない）
export async function findTeireiPage(env, title) {
  const db = await call(env, `/databases/${env.NOTION_TEIREI_DB}`, "GET");
  const titleProp = Object.entries(db.properties || {}).find(([, p]) => p.type === "title")?.[0];
  if (!titleProp) return null;
  const r = await call(env, `/databases/${env.NOTION_TEIREI_DB}/query`, "POST", { filter: { property: titleProp, title: { equals: title } }, page_size: 1 });
  return r.results?.[0]?.url || null;
}

// 定例の議事録の中身：事務連絡／各PJの進捗共有（PJごとのトグル）／ニュース勉強会／意見交換会
export function teireiBlocks({ notice, reports, missing, news, exchange, memo, appUrl }) {
  const section = (label, text) => [heading(label), ...(lines(text).length ? nest(text) : [para("（なし）")])];
  const blocks = [...section("📢 事務連絡", notice), heading("📊 各PJの進捗共有")];
  for (const r of reports) {
    // トグルの中は1段だけ（Notionに一度に作れる深さのため、字下げはなくす）
    const kids = [];
    for (const [k, label] of [["done", "前回の定例からやったこと"], ["next", "次の定例までにやること"], ["issues", "困っていること・相談したいこと"]]) {
      if (!lines(r[k]).length) continue;
      kids.push(block("paragraph", `**${label}**`));
      kids.push(...lines(r[k]).map((l) => mdBlock(l.trim())));
    }
    blocks.push({ object: "block", type: "toggle", toggle: { rich_text: inline(r.project_name), children: kids.length ? kids.slice(0, 90) : [para("（空欄）")] } });
  }
  for (const p of missing) blocks.push({ object: "block", type: "toggle", toggle: { rich_text: inline(`${p.name}（未記入）`), children: [para("まだ記入されていません")] } });
  if (!reports.length && !missing.length) blocks.push(para("（なし）"));
  blocks.push(...section("📰 ニュース勉強会", news), ...section("💬 意見交換会", exchange));
  if (lines(memo).length) blocks.push(...section("📝 メモ", memo));
  if (appUrl) blocks.push(para(`政策立案ツールの議事録：${appUrl}`));
  return blocks.slice(0, 100);
}

// parentUrl のページの最後（見出し「議事録」の下）に、新しいページを作る。作ったページのURLを返す
export async function createNotionPage(env, parentUrl, title, children) {
  const parent = notionPageId(parentUrl);
  if (!parent) throw new HttpError(400, "NotionのページのURLが正しくありません");
  const res = await fetch(`${API}/pages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({ parent: { page_id: parent }, properties: { title: { title: rich(title) } }, children }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("notion create page failed", res.status, data.code);
    if (res.status === 404 || data.code === "object_not_found") {
      throw new HttpError(400, "NotionのPJページが見つかりません。そのページの「…」→「接続」に、政策立案ツールのインテグレーションを追加してください");
    }
    if (res.status === 401) throw new HttpError(500, "Notionのトークンが正しくありません。管理者に連絡してください");
    throw new HttpError(502, "Notionにページを作れませんでした。少し待ってからもう一度試してください");
  }
  return data.url;
}
