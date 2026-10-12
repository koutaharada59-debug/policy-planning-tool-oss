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
const heading = (text) => ({ object: "block", type: "heading_3", heading_3: { rich_text: rich(text) } });
const bullet = (text) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(text) } });
const todo = (text, checked = false) => ({ object: "block", type: "to_do", to_do: { rich_text: rich(text), checked } });
const para = (text) => ({ object: "block", type: "paragraph", paragraph: { rich_text: rich(text) } });

// 文章を行ごとの箇条書きにする（先頭の「・」「-」は取る）
const lines = (text) => String(text || "").split("\n").map((l) => l.replace(/^\s*[-・]\s*/, "").trim()).filter(Boolean);

// 議事録の中身 → Notionのブロック（見出し・箇条書き・チェックボックス）
export function minutesBlocks({ homework = [], agenda = "", summary = "", todos = [], appUrl = "" }) {
  const blocks = [];
  if (homework.length) {
    blocks.push(heading("前回の宿題"));
    for (const t of homework) blocks.push(todo(`${t.title}（${t.assignee_name || "担当未定"}）`, t.status === "done"));
  }
  blocks.push(heading("今回話し合うこと"));
  blocks.push(...(lines(agenda).length ? lines(agenda).map(bullet) : [para("（なし）")]));
  blocks.push(heading("概要"));
  blocks.push(...(lines(summary).length ? lines(summary).map(bullet) : [para("（なし）")]));
  blocks.push(heading("次回までにやること"));
  blocks.push(...(todos.length ? todos.map((t) => todo(`${t.title}（${t.assignee_name || "担当未定"}${t.due_date ? `・${t.due_date.slice(5).replace("-", "/")}まで` : ""}）`, t.status === "done")) : [para("（なし）")]));
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
