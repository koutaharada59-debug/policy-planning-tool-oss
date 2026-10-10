// 議事録を探す：PJのMTGの議事録・定例の記録・発表の記録を、言葉・PJ・種類で探す
import { api, esc, fmtDate, fmtDateTime, hashQuery } from "../lib.js";

const KINDS = [["all", "すべて"], ["meeting", "MTGの議事録"], ["teirei", "定例の記録"], ["present", "発表の記録"]];
const ICON = { meeting: "📝", teirei: "🏛️", present: "🎤" };

export async function renderMinutesSearch(el) {
  const q0 = hashQuery();
  const { projects } = await api("/api/projects");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/check">確認する</a> / 議事録を探す</nav>
    <div class="page-heading left"><h1>🔎 議事録を探す</h1>
      <p>PJのMTGの議事録・定例の記録・発表の記録から探します。言葉を空白で区切ると、すべて含むものを探します。</p></div>
    <form class="search-form" id="search-form" role="search">
      <input type="search" name="q" value="${esc(q0.get("q") || "")}" placeholder="例：ヒアリング　出典" aria-label="探す言葉" autofocus>
      <select name="project" aria-label="PJ"><option value="">すべてのPJ</option>
        ${projects.filter((p) => p.status !== "archived").map((p) => `<option value="${p.id}" ${String(p.id) === q0.get("project") ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <select name="kind" aria-label="種類">${KINDS.map(([k, l]) => `<option value="${k}" ${k === (q0.get("kind") || "all") ? "selected" : ""}>${l}</option>`).join("")}</select>
    </form>
    <p class="muted small" id="search-count"></p>
    <ul class="list search-results" id="search-results"></ul>`;

  const form = el.querySelector("#search-form");
  const list = el.querySelector("#search-results");
  const count = el.querySelector("#search-count");
  let timer;
  let seq = 0;

  const run = async () => {
    const params = new URLSearchParams();
    for (const k of ["q", "project", "kind"]) if (form[k].value.trim() && !(k === "kind" && form[k].value === "all")) params.set(k, form[k].value.trim());
    // 戻ってきたときに同じ結果を出せるよう、条件を画面のURLに残す（履歴は増やさない）
    history.replaceState(null, "", `#/minutes-search${params.toString() ? `?${params}` : ""}`);
    if (!params.get("q") && !params.get("project")) {
      count.textContent = "言葉を入れるか、PJを選んでください。";
      list.innerHTML = "";
      return;
    }
    const mine = ++seq;
    count.textContent = "探しています…";
    const { results, words = [] } = await api(`/api/search/minutes?${params}`);
    if (mine !== seq) return; // 打ち直した後の結果だけを出す
    count.textContent = results.length ? `${results.length}件${results.length >= 60 ? "（新しい順に60件まで）" : ""}` : "見つかりませんでした。";
    list.innerHTML = results.map((r) => `
      <li class="list-item search-hit">
        <a href="${r.href}">
          <span class="search-head">${ICON[r.kind]} <strong>${esc(r.title)}</strong>
            ${r.project_name ? `<span class="tag">${esc(r.project_name)}</span>` : ""}
            <small class="muted">${r.at.endsWith("T00:00") ? fmtDate(r.at) : fmtDateTime(r.at)}</small></span>
          <span class="search-snippet">${snippet(r.text, words)}</span>
        </a>
      </li>`).join("");
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(timer); run(); });
  form.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 400); });
  form.addEventListener("change", () => { clearTimeout(timer); run(); });
  run();
}

// 最初に見つかった言葉のまわりを短く切り出し、言葉に印を付ける
function snippet(text, words) {
  const flat = (text || "").replace(/\s+/g, " ").trim();
  if (!flat) return `<span class="muted">（本文なし）</span>`;
  const lower = flat.toLowerCase();
  const hits = words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, at - 40);
  const part = flat.slice(start, start + 140);
  let html = esc(part);
  for (const w of words) {
    const re = new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return `${start ? "…" : ""}${html}${start + 140 < flat.length ? "…" : ""}`;
}
