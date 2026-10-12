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
  await call(env, `/blocks/${id}/children`, "PATCH", { children });
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
