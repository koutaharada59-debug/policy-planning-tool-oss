// 定例の議事録の「枠」：事務連絡・各PJの進捗共有・ニュース勉強会・意見交換会と、部門長・副部門長が足した枠
// 並び順と足した枠（題名と中身）は layout（JSON）に入れる：{ order: ["notice", "reports", "news", "exchange", "c1ab"], custom: { c1ab: { title, body } } }
import { esc, confirmDialog } from "./lib.js";
import { enhanceRich } from "./rich.js";
import { iconText } from "./icons.js";

export const FIXED = { notice: "📢 事務連絡", reports: "📊 各PJの進捗共有", news: "📰 ニュース勉強会", exchange: "💬 意見交換会" };
const DEFAULT_ORDER = Object.keys(FIXED);

export function parseLayout(text) {
  let raw = {};
  try { raw = JSON.parse(text || "{}") || {}; } catch { raw = {}; }
  const custom = {};
  for (const [id, c] of Object.entries(raw.custom || {})) if (/^c[a-z0-9]{1,16}$/.test(id)) custom[id] = { title: String(c?.title || ""), body: String(c?.body || "") };
  const order = (Array.isArray(raw.order) ? raw.order : []).filter((k, i, a) => (FIXED[k] || custom[k]) && a.indexOf(k) === i);
  // 決まった枠・足した枠で、並びに入っていないものは、元の位置あたりに足す
  DEFAULT_ORDER.forEach((k, i) => { if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k); });
  for (const id of Object.keys(custom)) if (!order.includes(id)) order.push(id);
  return { order, custom };
}

// 枠の右上：↑ ↓（並べ替え）と、足した枠の ✕
export function secTools(key, canEdit) {
  if (!canEdit) return "";
  return `<span class="sec-tools">
    <button type="button" class="sec-btn" data-sec-up title="上へ" aria-label="この枠を上へ">↑</button>
    <button type="button" class="sec-btn" data-sec-down title="下へ" aria-label="この枠を下へ">↓</button>
    ${FIXED[key] ? "" : `<button type="button" class="sec-btn danger" data-sec-del title="この枠を消す" aria-label="この枠を消す">✕</button>`}</span>`;
}

// 足した枠のHTML（中身は Notion のように書ける欄）
export function customSection(id, c, canEdit, viewHtml) {
  return `<section class="card" data-sec="${id}">
    <div class="section-head"><h2>${iconText(c.title)}</h2>${secTools(id, canEdit)}</div>
    ${canEdit ? `<textarea name="sec_${id}" data-rich rows="3" maxlength="5000" aria-label="${esc(c.title)}">${esc(c.body)}</textarea>`
      : c.body ? viewHtml(c.body) : `<p class="muted">なし</p>`}
  </section>`;
}

// 「＋ 枠を追加」：題名を書いて追加。↑↓で並べ替え、✕で消す（DOMを動かすだけなので、書きかけの中身はそのまま）
export function addSectionBox() {
  return `<div class="sec-add">
    <button type="button" class="small" data-sec-open>＋ 枠を追加</button>
    <div class="sec-add-form" hidden>
      <input data-sec-title maxlength="40" placeholder="枠の題名（例：🎉 イベントのお知らせ）" aria-label="枠の題名">
      <button type="button" class="primary small" data-sec-make>追加する</button>
      <button type="button" class="small" data-sec-cancel>やめる</button>
    </div>
  </div>`;
}

export function bindLayout(box, layout, { onChange }) {
  const sections = () => [...box.querySelectorAll(":scope > [data-sec]")];
  const sync = () => { layout.order = sections().map((s) => s.dataset.sec); onChange(); };
  box.addEventListener("click", async (e) => {
    const sec = e.target.closest("[data-sec]");
    if (e.target.closest("[data-sec-up]") && sec?.previousElementSibling?.dataset.sec) {
      sec.previousElementSibling.before(sec); sec.scrollIntoView({ block: "nearest", behavior: "smooth" }); sync();
    } else if (e.target.closest("[data-sec-down]") && sec?.nextElementSibling?.dataset.sec) {
      sec.nextElementSibling.after(sec); sec.scrollIntoView({ block: "nearest", behavior: "smooth" }); sync();
    } else if (e.target.closest("[data-sec-del]") && sec) {
      if (!await confirmDialog(`「${layout.custom[sec.dataset.sec]?.title}」の枠を消しますか？中身も消えます。`)) return;
      delete layout.custom[sec.dataset.sec];
      sec.remove(); sync();
    } else if (e.target.closest("[data-sec-open]")) {
      const f = box.querySelector(".sec-add-form");
      f.hidden = false; f.querySelector("[data-sec-title]").focus();
    } else if (e.target.closest("[data-sec-cancel]")) {
      box.querySelector(".sec-add-form").hidden = true;
    } else if (e.target.closest("[data-sec-make]")) {
      const input = box.querySelector("[data-sec-title]");
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      const id = `c${Date.now().toString(36)}`;
      layout.custom[id] = { title, body: "" };
      box.querySelector(".sec-add").insertAdjacentHTML("beforebegin", customSection(id, layout.custom[id], true, () => ""));
      const added = box.querySelector(`[data-sec="${id}"]`);
      enhanceRich(added);
      input.value = "";
      box.querySelector(".sec-add-form").hidden = true;
      added.scrollIntoView({ block: "center", behavior: "smooth" });
      sync();
    }
  });
  box.querySelector("[data-sec-title]")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); box.querySelector("[data-sec-make]").click(); }
  });
}

// 保存する layout（足した枠の中身は、その欄から読む）
export function layoutValue(form, layout) {
  const custom = {};
  for (const [id, c] of Object.entries(layout.custom)) custom[id] = { title: c.title, body: form[`sec_${id}`]?.value ?? c.body };
  return JSON.stringify({ order: layout.order, custom });
}
