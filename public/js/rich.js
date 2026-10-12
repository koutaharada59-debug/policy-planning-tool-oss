// Notionのように書ける入力欄（議事録・定例の議事録・事務連絡など）
// 中身はMarkdown（Notionにそのまま貼れる形）で、元の textarea に入れる。保存・同時編集のしくみは textarea のまま使う
//
//   # 見出し大 / ## 見出し中 / ### 見出し小 / - 箇条書き / 1. 番号 / [ ] チェック / > 引用 / --- 区切り線
//   **太字** / *斜体* / ~~取り消し~~ / `コード` / [文字](URL) / URLだけの行はリンクのカード（Googleドキュメント・YouTubeなどは埋め込み）
//
// 書き方：行の頭で「# 」「- 」「[] 」などを打つと変わる。「/」でメニュー。文字を選ぶと太字・リンクなどのバー。
import { esc, embedUrl } from "./lib.js";

const TYPES = {
  p: { label: "本文", md: "" },
  h1: { label: "見出し（大）", md: "# " },
  h2: { label: "見出し（中）", md: "## " },
  h3: { label: "見出し（小）", md: "### " },
  ul: { label: "箇条書き", md: "- " },
  ol: { label: "番号付きリスト", md: "1. " },
  todo: { label: "チェックボックス", md: "[ ] " },
  quote: { label: "引用", md: "> " },
  hr: { label: "区切り線", md: "---" },
  embed: { label: "リンク・埋め込み", md: "" },
};
const SLASH = [["h1", "大", "見出し（大）"], ["h2", "中", "見出し（中）"], ["h3", "小", "見出し（小）"], ["ul", "•", "箇条書き"], ["ol", "1.", "番号付きリスト"],
  ["todo", "☑", "チェックボックス"], ["quote", "❝", "引用"], ["hr", "—", "区切り線"], ["embed", "🔗", "リンク・埋め込み（URL）"], ["p", "¶", "本文"]];

// ---------- Markdown → 表示用HTML ----------
const URL_RE = /https?:\/\/[^\s<>"'）)]+/g;
function inlineHtml(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // まだリンクになっていないURL
  s = s.replace(/(^|[^"'>=])(https?:\/\/[^\s<>"']+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s;
}
function parseLine(line) {
  const m = (re) => line.match(re);
  let r;
  if ((r = m(/^###\s+(.*)$/))) return ["h3", r[1]];
  if ((r = m(/^##\s+(.*)$/))) return ["h2", r[1]];
  if ((r = m(/^#\s+(.*)$/))) return ["h1", r[1]];
  if ((r = m(/^\s*\[( |x|X)\]\s?(.*)$/))) return ["todo", r[2], r[1].toLowerCase() === "x"];
  if ((r = m(/^\s*[-*・]\s?(.*)$/))) return ["ul", r[1]];
  if ((r = m(/^\s*\d+[.)]\s+(.*)$/))) return ["ol", r[1]];
  if ((r = m(/^>\s?(.*)$/))) return ["quote", r[1]];
  if (/^-{3,}$/.test(line.trim())) return ["hr", ""];
  if (/^https?:\/\/\S+$/.test(line.trim())) return ["embed", line.trim()];
  return ["p", line];
}
function embedHtml(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* そのまま */ }
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
  const frame = yt ? `https://www.youtube.com/embed/${yt[1]}` : embedUrl(url);
  return `<a class="rb-card" href="${esc(url)}" target="_blank" rel="noopener" contenteditable="false"><span class="rb-card-icon">🔗</span><span><strong>${esc(host || url)}</strong><small>${esc(url)}</small></span></a>${frame ? `<iframe class="rb-frame" src="${esc(frame)}" loading="lazy" allowfullscreen></iframe>` : ""}`;
}
function blockHtml([type, text, checked], editable) {
  const attrs = `class="rb rb-${type}" data-type="${type}"`;
  if (type === "hr") return `<div ${attrs} contenteditable="false"><hr></div>`;
  if (type === "embed") return `<div ${attrs} data-url="${esc(text)}" contenteditable="false">${embedHtml(text)}</div>`;
  const box = type === "todo" ? `<span class="rb-check" contenteditable="false"><input type="checkbox" ${checked ? "checked" : ""} ${editable ? "" : "disabled"} aria-label="完了"></span>` : "";
  return `<div ${attrs}${type === "todo" && checked ? ' data-checked="1"' : ""}>${box}<span class="rb-text">${inlineHtml(text) || "<br>"}</span></div>`;
}
// 読むだけの表示（議事録を見る・検索など）にも使う
export function richHtml(md) {
  const lines = String(md || "").split("\n");
  let n = 0;
  return lines.map((l) => {
    const b = parseLine(l);
    n = b[0] === "ol" ? n + 1 : 0;
    return blockHtml(b, false).replace('class="rb rb-ol"', `class="rb rb-ol" data-n="${n}"`);
  }).join("");
}

// ---------- 編集用HTML → Markdown ----------
function inlineMd(node) {
  let out = "";
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { out += c.nodeValue.replace(/ /g, " "); continue; }
    if (c.nodeType !== 1 || c.classList?.contains("rb-check")) continue;
    const t = c.tagName;
    const inner = inlineMd(c);
    if (t === "BR") continue;
    if (!inner) continue;
    if (t === "B" || t === "STRONG" || (t === "SPAN" && /bold|[6-9]00/.test(c.style.fontWeight))) out += `**${inner}**`;
    else if (t === "I" || t === "EM") out += `*${inner}*`;
    else if (t === "S" || t === "STRIKE" || t === "DEL") out += `~~${inner}~~`;
    else if (t === "CODE") out += `\`${inner}\``;
    else if (t === "A") out += inner === c.getAttribute("href") ? inner : `[${inner}](${c.getAttribute("href")})`;
    else out += inner;
  }
  return out;
}
function toMarkdown(editor) {
  const lines = [];
  for (const b of editor.children) {
    const type = b.dataset?.type || "p";
    if (type === "hr") { lines.push("---"); continue; }
    if (type === "embed") { lines.push(b.dataset.url || ""); continue; }
    const text = inlineMd(b.querySelector(".rb-text") || b).replace(/\n/g, " ");
    const prefix = type === "todo" ? (b.dataset.checked ? "[x] " : "[ ] ") : TYPES[type]?.md || "";
    lines.push(prefix + text);
  }
  // 末尾の空行は持たない
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join("\n");
}

// ---------- 入力欄 ----------
export function enhanceRich(root = document) {
  root.querySelectorAll("textarea[data-rich]:not([data-rich-ready])").forEach(attach);
}

function attach(ta) {
  ta.dataset.richReady = "1";
  const editable = !ta.disabled;
  const ed = document.createElement("div");
  ed.className = "rich-editor";
  ed.dataset.placeholder = (ta.getAttribute("placeholder") || "").replace(/\n/g, "  ");
  ed.setAttribute("role", "textbox");
  ed.setAttribute("aria-multiline", "true");
  ed.setAttribute("aria-label", ta.getAttribute("aria-label") || "本文");
  ta.after(ed);
  ta.hidden = true;
  ta.tabIndex = -1;

  const render = (md) => {
    ed.innerHTML = richHtml(md) || blockHtml(["p", ""], true);
    if (!ed.lastElementChild || ["hr", "embed"].includes(ed.lastElementChild.dataset.type)) ed.insertAdjacentHTML("beforeend", blockHtml(["p", ""], true));
    renumber();
  };
  const renumber = () => { let n = 0; for (const b of ed.children) { n = b.dataset.type === "ol" ? n + 1 : 0; if (n) b.dataset.n = n; } };
  const setEditable = () => { ed.contentEditable = String(editable && !ta.readOnly && !ta.disabled); ed.classList.toggle("is-readonly", ed.contentEditable === "false"); };

  // 外から（ほかの人の入力が届いたときなど）値が入ったら、描き直す
  const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  let syncing = false;
  Object.defineProperty(ta, "value", {
    get() { return proto.get.call(this); },
    set(v) { proto.set.call(this, v); if (!syncing) render(v); },
  });
  new MutationObserver(setEditable).observe(ta, { attributes: true, attributeFilter: ["readonly", "disabled"] });
  render(proto.get.call(ta));
  setEditable();

  const sync = () => {
    renumber();
    syncing = true;
    ta.value = toMarkdown(ed);
    syncing = false;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };
  ed.dataset.field = ta.name;

  const blockOf = (node) => { while (node && node.parentNode !== ed) node = node.parentNode; return node; };
  const caretBlock = () => { const s = getSelection(); return s.rangeCount ? blockOf(s.anchorNode) : null; };
  const textEl = (b) => b.querySelector(".rb-text") || b;
  const placeCaret = (el, atEnd = true) => { const r = document.createRange(); r.selectNodeContents(el); r.collapse(!atEnd); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  const newBlock = (type, after, text = "") => {
    after.insertAdjacentHTML("afterend", blockHtml([type, text], true));
    return after.nextElementSibling;
  };
  const setType = (b, type) => {
    if (!b) return;
    const text = inlineMd(textEl(b));
    const tmp = document.createElement("div");
    tmp.innerHTML = blockHtml([type, text, false], true);
    const nb = tmp.firstElementChild;
    b.replaceWith(nb);
    if (type === "hr") { const p = newBlock("p", nb); placeCaret(textEl(p)); }
    else placeCaret(textEl(nb));
    sync();
    return nb;
  };

  // 行の頭の書き方で変える（「# 」「- 」「[] 」など）
  ed.addEventListener("input", (e) => {
    const b = caretBlock();
    if (b && (b.dataset.type === "p" || !b.dataset.type)) {
      const t = textEl(b).textContent;
      const rules = [[/^#\s$/, "h1"], [/^##\s$/, "h2"], [/^###\s$/, "h3"], [/^[-*・]\s$/, "ul"], [/^1[.)]\s$/, "ol"], [/^\[\s?\]\s$/, "todo"], [/^>\s$/, "quote"], [/^---$/, "hr"]];
      const hit = rules.find(([re]) => re.test(t.replace(/ /g, " ")));
      if (hit) { textEl(b).textContent = ""; setType(b, hit[1]); return; }
      if (t === "/") openSlash(b);
    }
    // ブラウザが外に置いた文字は、段落に入れる
    for (const n of [...ed.childNodes]) if (n.nodeType === 3 || (n.nodeType === 1 && !n.dataset?.type)) {
      const p = document.createElement("div"); p.className = "rb rb-p"; p.dataset.type = "p"; p.innerHTML = `<span class="rb-text"></span>`;
      n.replaceWith(p); p.firstChild.append(n.nodeType === 3 ? n : n.textContent);
    }
    if (slash && !slash.block.isConnected) closeSlash();
    if (slash) filterSlash();
    sync();
  });

  ed.addEventListener("keydown", (e) => {
    if (slash && ["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) { e.preventDefault(); slashKey(e.key); return; }
    const b = caretBlock();
    if (!b) return;
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const type = b.dataset.type;
      const s = getSelection();
      const r = s.getRangeAt(0);
      // 空の箇条書き・チェックで Enter → ふつうの段落に戻す（Notionと同じ）
      if (["ul", "ol", "todo", "quote"].includes(type) && !textEl(b).textContent.trim()) { setType(b, "p"); return; }
      // カーソルより後ろの文字を、次の行に持っていく
      const tail = r.cloneRange(); tail.selectNodeContents(textEl(b)); tail.setStart(r.endContainer, r.endOffset);
      const frag = tail.extractContents();
      const holder = document.createElement("span"); holder.append(frag);
      const nextType = ["ul", "ol", "todo"].includes(type) ? type : "p";
      const nb = newBlock(nextType, b, inlineMd(holder));
      if (!textEl(b).textContent) textEl(b).innerHTML = "<br>";
      placeCaret(textEl(nb), false);
      sync();
      return;
    }
    if (e.key === "Backspace") {
      const s = getSelection();
      if (!s.isCollapsed) return;
      const r = s.getRangeAt(0); const pre = r.cloneRange(); pre.selectNodeContents(textEl(b)); pre.setEnd(r.startContainer, r.startOffset);
      if (pre.toString().length) return;
      // 行の頭で Backspace：見出し・箇条書きなどは本文に戻す。本文なら前の行とつなげる
      if (b.dataset.type !== "p") { e.preventDefault(); setType(b, "p"); return; }
      const prev = b.previousElementSibling;
      if (!prev) return;
      e.preventDefault();
      if (["hr", "embed"].includes(prev.dataset.type)) { prev.remove(); sync(); return; }
      const keep = textEl(b).innerHTML.replace(/^<br>$/, "");
      const pt = textEl(prev);
      if (pt.innerHTML === "<br>") pt.innerHTML = "";
      const marker = document.createElement("span"); pt.append(marker); pt.insertAdjacentHTML("beforeend", keep);
      b.remove();
      const rr = document.createRange(); rr.setStartBefore(marker); rr.collapse(true); s.removeAllRanges(); s.addRange(rr); marker.remove();
      sync();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ["b", "i", "k"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (e.key.toLowerCase() === "k") askLink(); else { document.execCommand(e.key.toLowerCase() === "b" ? "bold" : "italic"); sync(); }
    }
  });

  // チェックボックス
  ed.addEventListener("change", (e) => {
    const cb = e.target.closest(".rb-check input");
    if (!cb) return;
    const b = blockOf(cb);
    if (cb.checked) b.dataset.checked = "1"; else delete b.dataset.checked;
    sync();
  });

  // 貼り付け：書式は持ち込まず、行ごとにブロックにする。文字を選んでURLを貼るとリンク
  ed.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const s = getSelection();
    if (/^https?:\/\/\S+$/.test(text.trim()) && !s.isCollapsed) { document.execCommand("createLink", false, text.trim()); ed.querySelectorAll("a:not([target])").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; }); sync(); return; }
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines.length === 1 && !/^https?:\/\/\S+$/.test(text.trim())) { document.execCommand("insertText", false, text); return; }
    let b = caretBlock();
    if (b && !textEl(b).textContent.trim() && b.dataset.type === "p") { const prev = b.previousElementSibling; b.remove(); b = prev; }
    let last = b;
    for (const l of lines) {
      const tmp = document.createElement("div"); tmp.innerHTML = blockHtml(parseLine(l), true);
      const nb = tmp.firstElementChild;
      if (last) last.after(nb); else ed.prepend(nb);
      last = nb;
    }
    if (["hr", "embed"].includes(last.dataset.type)) last = newBlock("p", last);
    placeCaret(textEl(last));
    sync();
  });

  // ---------- 「/」のメニュー ----------
  let slash = null;
  const openSlash = (block) => {
    closeSlash();
    const menu = document.createElement("div");
    menu.className = "rb-slash";
    menu.innerHTML = SLASH.map(([t, icon, label]) => `<button type="button" data-t="${t}"><span class="rb-slash-icon">${icon}</span>${label}</button>`).join("");
    document.body.append(menu);
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    menu.style.left = `${Math.min(r.left + scrollX, scrollX + innerWidth - 260)}px`;
    menu.style.top = `${r.bottom + scrollY + 6}px`;
    slash = { menu, block, i: 0 };
    menu.addEventListener("mousedown", (e) => { e.preventDefault(); const t = e.target.closest("[data-t]")?.dataset.t; if (t) applySlash(t); });
    filterSlash();
  };
  const slashItems = () => [...slash.menu.querySelectorAll("button:not([hidden])")];
  const filterSlash = () => {
    const q = textEl(slash.block).textContent.replace(/^\//, "").trim();
    slash.menu.querySelectorAll("button").forEach((b) => { b.hidden = q && !b.textContent.includes(q); });
    slash.i = 0;
    slashItems().forEach((b, i) => b.classList.toggle("is-active", i === 0));
    if (!slashItems().length) closeSlash();
  };
  const slashKey = (k) => {
    const items = slashItems();
    if (k === "Escape") return closeSlash();
    if (k === "Enter") return applySlash(items[slash.i]?.dataset.t);
    slash.i = (slash.i + (k === "ArrowDown" ? 1 : items.length - 1)) % items.length;
    items.forEach((b, i) => b.classList.toggle("is-active", i === slash.i));
  };
  const applySlash = (t) => {
    const b = slash.block;
    closeSlash();
    if (!t) return;
    textEl(b).innerHTML = "<br>";
    if (t === "embed") {
      const url = prompt("リンク・埋め込みのURL（Googleドキュメント・スライド・YouTube・Figmaなど）");
      if (!url || !/^https?:\/\//.test(url.trim())) { placeCaret(textEl(b)); return; }
      const tmp = document.createElement("div"); tmp.innerHTML = blockHtml(["embed", url.trim()], true);
      const nb = tmp.firstElementChild; b.replaceWith(nb);
      placeCaret(textEl(newBlock("p", nb)));
      sync();
      return;
    }
    setType(b, t);
  };
  const closeSlash = () => { slash?.menu.remove(); slash = null; };
  ed.addEventListener("blur", () => setTimeout(closeSlash, 150));

  // ---------- 文字を選んだときのバー（太字・斜体・取り消し・コード・リンク・見出し） ----------
  let bar = null;
  const askLink = () => {
    const url = prompt("リンクのURL");
    if (url && /^https?:\/\//.test(url.trim())) {
      document.execCommand("createLink", false, url.trim());
      ed.querySelectorAll("a:not([target])").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
      sync();
    }
  };
  const showBar = () => {
    const s = getSelection();
    if (ed.contentEditable !== "true" || !s.rangeCount || s.isCollapsed || !ed.contains(s.anchorNode)) { bar?.remove(); bar = null; return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "rb-bar";
      bar.innerHTML = `<button type="button" data-a="bold" title="太字"><b>B</b></button><button type="button" data-a="italic" title="斜体"><i>I</i></button>
        <button type="button" data-a="strikeThrough" title="取り消し線"><s>S</s></button><button type="button" data-a="code" title="コード">&lt;/&gt;</button>
        <button type="button" data-a="link" title="リンク">🔗</button><span class="rb-bar-sep"></span>
        <button type="button" data-a="h1" title="見出し（大）">大</button><button type="button" data-a="h2" title="見出し（中）">中</button><button type="button" data-a="h3" title="見出し（小）">小</button><button type="button" data-a="p" title="本文">本文</button>`;
      document.body.append(bar);
      bar.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const a = e.target.closest("[data-a]")?.dataset.a;
        if (!a) return;
        if (a === "link") askLink();
        else if (a === "code") { const t = getSelection().toString(); document.execCommand("insertHTML", false, `<code>${esc(t)}</code>`); sync(); }
        else if (["h1", "h2", "h3", "p"].includes(a)) { setType(caretBlock(), a); }
        else { document.execCommand(a); sync(); }
      });
    }
    const r = s.getRangeAt(0).getBoundingClientRect();
    bar.style.left = `${Math.max(8, Math.min(r.left + scrollX + r.width / 2 - 170, scrollX + innerWidth - 350))}px`;
    bar.style.top = `${r.top + scrollY - 46}px`;
  };
  document.addEventListener("selectionchange", () => { if (!ed.isConnected) { bar?.remove(); return; } showBar(); });
}
