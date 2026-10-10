// 議事録を探す：PJのMTGの議事録・定例の記録・発表の記録を、言葉・PJ・期間・種類で探す
// 何も入れていないときは、最近の記録を新しい順に出す（開いてすぐ使えるように）
import { api, esc, fmtDate, hashQuery, addDays } from "../lib.js";

const KINDS = [["all", "すべて"], ["meeting", "📝 MTGの議事録"], ["teirei", "🏛️ 定例の記録"], ["present", "🎤 発表の記録"]];
const ICON = { meeting: "📝", teirei: "🏛️", present: "🎤" };

// 期間のすぐ選べるボタン（週は日曜はじまり。カレンダーと同じ）
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const weekStart = (d) => addDays(d, -new Date(`${d}T00:00:00Z`).getUTCDay());
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const monthEnd = (d) => addDays(monthStart(addDays(monthStart(d), 32)), -1);
const PRESETS = [
  ["today", "今日", () => [today(), today()]],
  ["yesterday", "昨日", () => [addDays(today(), -1), addDays(today(), -1)]],
  ["week", "今週", () => [weekStart(today()), addDays(weekStart(today()), 6)]],
  ["lastweek", "先週", () => [addDays(weekStart(today()), -7), addDays(weekStart(today()), -1)]],
  ["month", "今月", () => [monthStart(today()), monthEnd(today())]],
  ["lastmonth", "先月", () => { const d = addDays(monthStart(today()), -1); return [monthStart(d), d]; }],
];

export async function renderMinutesSearch(el) {
  const q0 = hashQuery();
  let kind = q0.get("kind") || "all";
  const { projects } = await api("/api/projects");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/check">確認する</a> / 議事録を探す</nav>
    <div class="page-heading left"><h1>🔎 議事録を探す</h1>
      <p class="muted small">MTGの議事録・定例の記録・発表の記録から探します。言葉を空白で区切ると、すべて含むものだけ。</p></div>
    <form class="search-form" id="search-form" role="search">
      <input type="search" name="q" value="${esc(q0.get("q") || "")}" placeholder="言葉で探す（例：ヒアリング　出典）" aria-label="探す言葉" autofocus>
      <select name="project" aria-label="PJ"><option value="">すべてのPJ</option>
        ${projects.filter((p) => p.status !== "archived").map((p) => `<option value="${p.id}" ${String(p.id) === q0.get("project") ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <div class="search-period">
        <span class="chip-row" role="group" aria-label="期間">
          ${PRESETS.map(([k, l]) => `<button type="button" class="chip-btn" data-preset="${k}">${l}</button>`).join("")}
          <button type="button" class="chip-btn" data-preset="custom">日付を指定</button>
          <button type="button" class="link-btn" data-preset="clear" hidden>期間をはずす</button>
        </span>
        <span class="search-dates" hidden>
          <label class="search-date">いつから<input type="date" name="from" value="${esc(q0.get("from") || "")}"></label>
          <label class="search-date">いつまで<input type="date" name="to" value="${esc(q0.get("to") || "")}"></label>
        </span>
      </div>
    </form>
    <div class="chip-row kind-chips" id="kind-chips" role="tablist" aria-label="種類"></div>
    <p class="muted small" id="search-count"></p>
    <ul class="list search-results" id="search-results"></ul>`;

  const form = el.querySelector("#search-form");
  const list = el.querySelector("#search-results");
  const count = el.querySelector("#search-count");
  const dates = el.querySelector(".search-dates");
  let timer;
  let seq = 0;
  let results = [];
  let words = [];

  // 期間：いまの「いつから・いつまで」がどのボタンに当たるか
  const drawPeriod = () => {
    const from = form.from.value;
    const to = form.to.value;
    const hit = PRESETS.find(([, , f]) => { const [a, b] = f(); return a === from && b === to; });
    el.querySelectorAll("[data-preset]").forEach((b) => {
      const k = b.dataset.preset;
      b.classList.toggle("is-on", k === "custom" ? Boolean((from || to) && !hit) || !dates.hidden && !hit : hit?.[0] === k);
    });
    el.querySelector('[data-preset="clear"]').hidden = !from && !to;
    if ((from || to) && !hit) dates.hidden = false;
  };

  const drawList = () => {
    const counts = Object.fromEntries(KINDS.map(([k]) => [k, k === "all" ? results.length : results.filter((r) => r.kind === k).length]));
    el.querySelector("#kind-chips").innerHTML = results.length ? KINDS.map(([k, l]) =>
      `<button type="button" role="tab" class="chip-btn ${kind === k ? "is-on" : ""}" data-kind="${k}" aria-selected="${kind === k}" ${counts[k] || k === "all" ? "" : "disabled"}>${l} <small>${counts[k]}</small></button>`).join("") : "";
    const shown = results.filter((r) => kind === "all" || r.kind === kind);
    list.innerHTML = shown.map((r, i) => `
      <li class="list-item search-hit">
        <div class="search-top">
          <span class="search-date-big">${fmtDate(r.at)}${r.at.endsWith("T00:00") ? "" : ` <small>${r.at.slice(11, 16)}</small>`}</span>
          <a class="button small" href="${r.href}">開く →</a>
        </div>
        <span class="search-head">${ICON[r.kind]} <strong>${esc(r.title)}</strong>
          ${r.project_name ? `<span class="tag">${esc(r.project_name)}</span>` : ""}</span>
        <span class="search-snippet">${snippet(r.text, words)}</span>
        ${r.text && r.text.replace(/\s+/g, " ").length > 140 ? `<details class="search-full"><summary class="small">全文を見る</summary>
          <p class="pre small">${mark(esc(r.text), words)}</p></details>` : ""}
      </li>`).join("");
    el.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      kind = b.dataset.kind;
      saveUrl();
      drawList();
    }));
  };

  const params = () => {
    const p = new URLSearchParams();
    for (const k of ["q", "project", "from", "to"]) if (form[k].value.trim()) p.set(k, form[k].value.trim());
    return p;
  };
  // 戻ってきたときに同じ結果を出せるよう、条件を画面のURLに残す（履歴は増やさない）
  const saveUrl = () => {
    const p = params();
    if (kind !== "all") p.set("kind", kind);
    history.replaceState(null, "", `#/minutes-search${p.toString() ? `?${p}` : ""}`);
  };

  const run = async () => {
    saveUrl();
    drawPeriod();
    const p = params();
    const filtered = p.toString() !== "";
    const mine = ++seq;
    count.textContent = "探しています…";
    const res = await api(`/api/search/minutes?${p}`);
    if (mine !== seq) return; // 打ち直した後の結果だけを出す
    results = res.results;
    words = res.words || [];
    count.textContent = !filtered ? `最近の記録（新しい順）${results.length >= 60 ? "・60件まで" : ""}`
      : results.length ? `${results.length}件${results.length >= 60 ? "（新しい順に60件まで）" : ""}` : "見つかりませんでした。言葉を減らすか、期間を広げてみてください。";
    if (!results.some((r) => r.kind === kind)) kind = "all";
    drawList();
  };

  el.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.preset;
    if (k === "custom") {
      dates.hidden = !dates.hidden;
      if (!dates.hidden) form.from.focus();
      drawPeriod();
      return;
    }
    if (k === "clear") { form.from.value = ""; form.to.value = ""; dates.hidden = true; }
    else { const [a, c] = PRESETS.find(([key]) => key === k)[2](); form.from.value = a; form.to.value = c; dates.hidden = true; }
    run();
  }));
  form.addEventListener("submit", (e) => { e.preventDefault(); clearTimeout(timer); run(); });
  form.addEventListener("input", (e) => { if (e.target.name === "q") { clearTimeout(timer); timer = setTimeout(run, 400); } });
  form.addEventListener("change", (e) => { if (e.target.name !== "q") { clearTimeout(timer); run(); } });
  run();
}

const mark = (html, words) => words.reduce((h, w) =>
  h.replace(new RegExp(esc(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`), html);

// 最初に見つかった言葉のまわりを短く切り出し、言葉に印を付ける
function snippet(text, words) {
  const flat = (text || "").replace(/\s+/g, " ").trim();
  if (!flat) return `<span class="muted">（本文なし）</span>`;
  const lower = flat.toLowerCase();
  const hits = words.map((w) => lower.indexOf(w.toLowerCase())).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  const start = Math.max(0, at - 40);
  return `${start ? "…" : ""}${mark(esc(flat.slice(start, start + 140)), words)}${start + 140 < flat.length ? "…" : ""}`;
}

// PJ画面の「記録」タブ：このPJのMTGの議事録・定例の進捗共有・発表の記録を、日付順にまとめて見る
export async function renderProjectRecords(body, projectId) {
  const { results } = await api(`/api/search/minutes?project=${projectId}`);
  let kind = "all";
  const draw = () => {
    const shown = results.filter((r) => kind === "all" || r.kind === kind);
    const counts = Object.fromEntries(KINDS.map(([k]) => [k, k === "all" ? results.length : results.filter((r) => r.kind === k).length]));
    let month = "";
    body.innerHTML = `
      <div class="board-tools">
        <span class="chip-row">${KINDS.map(([k, l]) => `<button type="button" class="chip-btn ${kind === k ? "is-on" : ""}" data-kind="${k}" ${counts[k] || k === "all" ? "" : "disabled"}>${l} <small>${counts[k]}</small></button>`).join("")}</span>
        <a class="button small" href="#/minutes-search?project=${projectId}">🔎 言葉で探す</a>
      </div>
      ${shown.length ? `<ul class="list search-results">${shown.map((r) => {
        const m = r.at.slice(0, 7);
        const head = m !== month ? `<li class="record-month">${Number(m.slice(0, 4))}年${Number(m.slice(5))}月</li>` : "";
        month = m;
        return `${head}
        <li class="list-item search-hit">
          <div class="search-top">
            <span class="search-date-big">${fmtDate(r.at)}${r.at.endsWith("T00:00") ? "" : ` <small>${r.at.slice(11, 16)}</small>`}</span>
            <a class="button small" href="${r.href}">開く →</a>
          </div>
          <span class="search-head">${ICON[r.kind]} <strong>${esc(r.title)}</strong></span>
          <span class="search-snippet">${snippet(r.text, [])}</span>
          ${r.text && r.text.replace(/\s+/g, " ").length > 140 ? `<details class="search-full"><summary class="small">全文を見る</summary><p class="pre small">${esc(r.text)}</p></details>` : ""}
        </li>`;
      }).join("")}</ul>` : `<div class="empty"><p>まだ記録はありません。MTGの議事録・定例の進捗・発表の記録が、ここに日付順に並びます。</p></div>`}`;
    body.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { kind = b.dataset.kind; draw(); }));
  };
  draw();
}

