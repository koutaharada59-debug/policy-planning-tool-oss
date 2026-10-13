// Notion にそのまま貼れる形：ツールの書き方（Markdown）→ HTML
// Notion は貼り付けた HTML の 見出し・箇条書き・番号・チェック・トグル（<details>）・引用・区切り線・太字・リンク を、そのブロックにする
// 字下げ（行頭の空白2つで1段）は、上の行の中（トグルの中身・箇条書きの子）に入れる
import { parseLine, inlineHtml } from "./rich.js";

export function notionHtml(md) {
  // 行 → 木（字下げで親子にする）
  const root = { children: [] };
  const stack = [{ node: root, indent: -1 }];
  for (const raw of String(md || "").replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;
    const [type, text, checked, indent = 0] = parseLine(raw);
    const node = { type, text, checked, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, indent });
  }
  return render(root.children);
}

function render(nodes) {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    // 続いている同じ種類の箇条書き・番号・チェックは、1つのリストにまとめる
    if (n.type === "ul" || n.type === "ol" || n.type === "todo") {
      const run = [n];
      while (nodes[i + 1]?.type === n.type) run.push(nodes[++i]);
      const tag = n.type === "ol" ? "ol" : "ul";
      out += `<${tag}>${run.map((x) => `<li>${x.type === "todo" ? `<input type="checkbox" ${x.checked ? "checked" : ""}> ` : ""}${inlineHtml(x.text)}${render(x.children)}</li>`).join("")}</${tag}>`;
      continue;
    }
    const kids = render(n.children);
    if (n.type === "toggle") out += `<details open><summary>${inlineHtml(n.text)}</summary>${kids}</details>`;
    else if (/^h[123]$/.test(n.type)) out += `<${n.type}>${inlineHtml(n.text)}</${n.type}>${kids}`;
    else if (n.type === "quote") out += `<blockquote>${inlineHtml(n.text)}</blockquote>${kids}`;
    else if (n.type === "callout") out += `<blockquote>💡 ${inlineHtml(n.text)}</blockquote>${kids}`;
    else if (n.type === "hr") out += "<hr>";
    else if (n.type === "embed") out += `<p><a href="${n.text.replace(/"/g, "&quot;")}">${inlineHtml(n.text)}</a></p>`;
    else out += `<p>${inlineHtml(n.text)}</p>${kids}`;
  }
  return out;
}
