// 発表する：PJを選ぶ → 概要・本文ドキュメント・キーワード・発表時の注意点を映す
import { api, esc, state, avatar, fmtDate, embedUrl, busy, toast, stageNoOf, pjPicker, pickItem, bindFold, ratioColor, fmtClock } from "../lib.js";
import { rolesSummary, FB_STATUS } from "./presentation.js";

export async function renderPresentList(el) {
  const { projects } = await api("/api/projects");
  const list = projects.filter((p) => p.status !== "archived");
  el.innerHTML = `
    <div class="page-heading left"><h1>🎤 どのPJを発表しますか？</h1></div>
    ${pjPicker(list, (p) => pickItem({ href: `#/present/${p.id}`, name: p.name, note: p.status === "done" ? "完了" : "" }), { empty: "まだPJがありません。" })}`;
}

export async function renderPresent(el, id) {
  const [data, prepData] = await Promise.all([api(`/api/projects/${id}`), api(`/api/projects/${id}/presentation`)]);
  const { prep } = prepData;
  const { project: p, members, stages, checklist, recentMinutes } = data;
  const type = state.types[p.type];
  const stage = type.stages.find((s) => s.no === p.current_stage);
  const presNo = stageNoOf(p.type, "presentation");
  const presentation = stages.find((s) => s.stage_no === presNo)?.due_date;
  const latest = recentMinutes.find((n) => n.summary.trim());
  const tips = checklist.filter((c) => c.stage_no === presNo);
  // 政調用の本文と台本。登録されているほうを、切り替えて表示する
  const docs = [["doc", "📄 本文", p.doc_url], ["script", "🎤 台本", p.script_doc_url]].filter(([, , url]) => url);

  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/">ホーム</a> / <a href="#/present">発表する</a> / ${esc(p.name)}</nav>
    <div class="present" id="present">
      ${presentTimerHtml(p.id)}
      <header class="present-head card">
        <div class="row">
          <span class="stage-pill">${esc(type.label)}・工程${p.current_stage} ${esc(stage?.name || "")}</span>
          <span class="row-left">
            ${presentation ? `<span class="muted small">最終発表 ${fmtDate(presentation)}${p.presentation_date ? "" : "（仮）"}</span>` : ""}
            <button class="small" id="fullscreen">⛶ 全画面</button>
          </span>
        </div>
        <h1>${esc(p.name)}</h1>
        ${p.description ? `<p class="present-desc fold">${esc(p.description)}</p>` : `<p class="muted">概要はまだ書かれていません。<a href="#/projects/${p.id}/edit">PJの「編集」</a>から追加できます。</p>`}
        <div class="people-stack">${members.map((m) => avatar(m)).join("")}<span class="more">${members.map((m) => esc(m.name)).join("、")}</span></div>
        ${rolesSummary(prep, state.users)}
        ${prep.slide_url || prep.abstract_url ? `<div class="row-left" style="margin-top:10px">
          ${prep.slide_url ? `<a class="button small primary" href="${esc(prep.slide_url)}" target="_blank" rel="noopener">🖼 発表資料を開く</a>` : ""}
          ${prep.abstract_url ? `<a class="button small" href="${esc(prep.abstract_url)}" target="_blank" rel="noopener">📝 アブストラクト</a>` : ""}</div>` : ""}
      </header>

      ${latest ? `<section class="card">
        <h2>最近のMTGの概要 <small class="muted">${fmtDate(latest.starts_at)}</small></h2><p>${esc(latest.summary)}</p>
      </section>` : ""}

      <section class="card">
        <div class="section-head"><h2>ドキュメント</h2>
          ${docs.length > 1 ? `<span class="seg" role="tablist">${docs.map(([k, label], i) =>
            `<button type="button" class="small ${i ? "" : "primary"}" data-doc="${k}" aria-selected="${!i}">${label}</button>`).join("")}</span>` : ""}</div>
        ${docs.length ? docs.map(([k, label, url], i) => `<div class="doc-view" data-doc-view="${k}" ${i ? "hidden" : ""}>
          <p class="row-left"><strong>${label}</strong><a class="button small" href="${esc(url)}" target="_blank" rel="noopener">新しいタブで開く</a></p>
          ${embedUrl(url) ? `<div class="doc-frame"><iframe src="${esc(embedUrl(url))}" title="${label}" loading="lazy" allowfullscreen></iframe></div>`
            : `<p class="muted">このリンクは埋め込み表示できません。「新しいタブで開く」から開いてください。</p>`}</div>`).join("")
          + `<p class="muted small">表示されないときは、ドキュメントの共有設定を確認するか「新しいタブで開く」を使ってください。</p>`
          : `<p class="muted">政調用の本文・台本のドキュメントが登録されていません。<a href="#/projects/${p.id}/edit">PJの「編集」</a>から Google ドキュメントのURLを登録してください。</p>`}
      </section>

      ${notesSection(prepData)}

      ${tips.length ? `<section class="card">
        <h2>発表時の注意点</h2>
        <ul class="checklist">${tips.map((c) => `<li><span class="check"><span>${c.done_at ? "✅" : c.skipped_at ? "➖" : "⬜"}</span><span class="${c.skipped_at ? "skipped-label" : ""}">${esc(c.label)}</span></span></li>`).join("")}</ul>
        <a class="link small" href="#/projects/${p.id}?tab=present">発表準備（役割分担・リハーサル）を開く</a>
      </section>` : ""}
    </div>`;

  bindNotes(el, id, prepData);
  bindFold(el);
  bindPresentTimer(el, p.id);
  el.querySelectorAll("[data-doc]").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-doc]").forEach((x) => { x.classList.toggle("primary", x === b); x.setAttribute("aria-selected", x === b); });
    el.querySelectorAll("[data-doc-view]").forEach((v) => (v.hidden = v.dataset.docView !== b.dataset.doc));
  }));

  el.querySelector("#fullscreen").addEventListener("click", () => {
    const box = el.querySelector("#present");
    if (document.fullscreenElement) document.exitFullscreen();
    else box.requestFullscreen?.();
  });
}

// 発表中・質疑応答で使う：雑メモと、政調からのフィードバックの追加
function fbList(feedback) {
  return feedback.length ? `<ul class="fb-quick-list">${[...feedback].reverse().map((f) => `
    <li><span class="due ${f.status === "done" ? "" : "is-soon"}">${FB_STATUS[f.status]}</span>
      <span class="pre">${esc(f.content)}</span>${f.source ? `<small class="muted">${esc(f.source)}</small>` : ""}</li>`).join("")}</ul>`
    : `<p class="muted small">まだフィードバックはありません。</p>`;
}

// 雑メモとフィードバックの追加は、ログインしていれば誰でも使える
function notesSection({ prep, feedback, project }) {
  return `
    <section class="card present-notes">
      <div class="notes-col">
        <div class="section-head"><h2>📝 雑メモ</h2><span class="muted small" id="memo-status"></span></div>
        <textarea id="present-memo" rows="9" maxlength="5000"
          placeholder="発表中・質疑応答で気づいたことを自由にメモ（自動で保存されます）">${esc(prep.present_memo || "")}</textarea>
        <div id="memo-conflict"></div>
      </div>
      <div class="notes-col">
        <div class="section-head"><h2>💬 フィードバック</h2>
          <a class="link small" href="#/projects/${project.id}?tab=present">反映状況を管理する</a></div>
        <form class="form" id="fb-quick">
          <textarea name="content" rows="2" maxlength="500" required placeholder="政調からの指摘（1件ずつ）"></textarea>
          <div class="inline-form">
            <input name="source" maxlength="60" value="政調" aria-label="誰から">
            <button class="primary small">追加</button>
          </div>
        </form>
        <div id="fb-list">${fbList(feedback)}</div>
      </div>
    </section>`;
}

function bindNotes(el, projectId, prepData) {
  let version = prepData.prep.version;
  let base = prepData.prep.present_memo || ""; // 最後にサーバーと一致していた内容
  const memo = el.querySelector("#present-memo");
  const status = el.querySelector("#memo-status");
  let timer;

  const save = async () => {
    const text = memo.value;
    if (text === base) return;
    status.textContent = "保存中…";
    try {
      await api(`/api/projects/${projectId}/presentation`, { method: "PUT", body: { present_memo: text, version } });
      version += 1;
      base = text;
      status.textContent = "保存しました";
    } catch {
      // ほかの人が発表準備を保存していた。メモが変わっていなければ、最新の版で保存し直す
      const latest = (await api(`/api/projects/${projectId}/presentation`)).prep;
      version = latest.version;
      if ((latest.present_memo || "") === base) return save();
      status.textContent = "未保存";
      el.querySelector("#memo-conflict").innerHTML = `
        <div class="caution small">ほかの人もメモを書き換えました。あなたのメモはそのまま残しています。
          <button type="button" class="small" id="merge-memo">相手のメモを下に足して保存する</button>
          <p class="pre">${esc(latest.present_memo || "")}</p></div>`;
      el.querySelector("#merge-memo").addEventListener("click", () => {
        memo.value = `${memo.value}\n\n---\n${latest.present_memo || ""}`;
        base = latest.present_memo || "";
        el.querySelector("#memo-conflict").innerHTML = "";
        save();
      });
    }
  };
  memo.addEventListener("input", () => {
    status.textContent = "入力中…";
    clearTimeout(timer);
    timer = setTimeout(save, 1500);
  });
  memo.addEventListener("blur", () => { clearTimeout(timer); save(); });

  el.querySelector("#fb-quick")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    busy(e.submitter, () => api(`/api/projects/${projectId}/feedback`, {
      method: "POST", body: { content: f.content.value, source: f.source.value },
    })).then(async () => {
      toast("フィードバックを追加しました（未対応）");
      f.content.value = "";
      // 一覧だけ描き直す（雑メモの入力中の内容は消さない）
      const { feedback } = await api(`/api/projects/${projectId}/presentation`);
      el.querySelector("#fb-list").innerHTML = fbList(feedback);
      f.content.focus();
    }).catch(() => {});
  });
}

// ---------- 発表のタイマー：発表時間とフィードバック時間を分けて測る ----------
// 「発表スタート」→「発表終わり」でフィードバックの計測に切り替わる。目標時間に近づくと色が変わる（緑 → 青 → 赤 → 紫）
// 状態は画面を開いているあいだだけ覚える（PJごと。別の画面へ移って戻っても続きから）
const PRESENT_KINDS = {
  seicho: { label: "政調MTG", present: 15, fb: 15 },
  other: { label: "その他の発表", present: 10, fb: 10 },
};
const MINUTES = [3, 5, 7, 10, 15, 20, 25, 30, 40, 45, 60];
const presentTimers = new Map();

function presentTimerHtml(projectId) {
  return `<div class="present-timer" data-ptimer="${projectId}">
    <select class="pt-kind" aria-label="発表の種類">${Object.entries(PRESENT_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
    ${[["present", "発表"], ["fb", "フィードバック"]].map(([k, label]) => `
      <div class="pt-phase" data-phase="${k}">
        <span class="pt-label">${label}</span>
        <b class="pt-time">0:00</b>
        <span class="pt-target">/ <select data-target="${k}" aria-label="${label}の目標時間">${MINUTES.map((m) => `<option value="${m}">${m}分</option>`).join("")}</select></span>
        <small class="pt-note"></small>
      </div>`).join("")}
    <span class="pt-actions">
      <button type="button" class="primary small pt-main"></button>
      <button type="button" class="small pt-pause" aria-label="一時停止"></button>
      <button type="button" class="small pt-reset" aria-label="最初から">↺</button>
    </span>
  </div>`;
}

function bindPresentTimer(root, projectId) {
  const box = root.querySelector(`[data-ptimer="${projectId}"]`);
  if (!box) return;
  let t = presentTimers.get(projectId);
  if (!t) {
    t = { kind: "seicho", targets: { present: PRESENT_KINDS.seicho.present, fb: PRESENT_KINDS.seicho.fb },
      phase: "idle", present: { elapsed: 0, startedAt: null }, fb: { elapsed: 0, startedAt: null } };
    presentTimers.set(projectId, t);
  }
  const kindSel = box.querySelector(".pt-kind");
  const main = box.querySelector(".pt-main");
  const pause = box.querySelector(".pt-pause");
  const now = (c) => c.elapsed + (c.startedAt ? Date.now() - c.startedAt : 0);
  const running = () => Boolean(t.present.startedAt || t.fb.startedAt);
  const stop = (c) => { c.elapsed = now(c); c.startedAt = null; };

  const draw = () => {
    kindSel.value = t.kind;
    for (const k of ["present", "fb"]) {
      const c = t[k];
      const ms = now(c);
      const target = t.targets[k] * 60000;
      const ph = box.querySelector(`[data-phase="${k}"]`);
      ph.querySelector(`[data-target="${k}"]`).value = String(t.targets[k]);
      ph.querySelector(".pt-time").textContent = fmtClock(ms);
      ph.style.setProperty("--pt-color", ratioColor(ms / target));
      ph.classList.toggle("is-active", t.phase === k);
      ph.classList.toggle("is-done", (k === "present" && ["fb", "done"].includes(t.phase)) || (k === "fb" && t.phase === "done"));
      ph.querySelector(".pt-note").textContent = !ms ? "" : ms > target ? `${fmtClock(ms - target)} 超過` : `残り ${fmtClock(target - ms)}`;
    }
    const active = t.phase === "fb" ? t.fb : t.present;
    box.style.setProperty("--pt-color", ratioColor(now(active) / (t.targets[t.phase === "fb" ? "fb" : "present"] * 60000)));
    box.classList.toggle("is-running", running());
    main.textContent = { idle: "▶ 発表スタート", present: "✅ 発表終わり", fb: "✅ フィードバック終わり", done: "おつかれさまでした" }[t.phase];
    main.disabled = t.phase === "done";
    pause.hidden = !["present", "fb"].includes(t.phase);
    pause.textContent = running() ? "⏸" : "▶";
  };

  kindSel.addEventListener("change", () => {
    t.kind = kindSel.value;
    t.targets = { present: PRESENT_KINDS[t.kind].present, fb: PRESENT_KINDS[t.kind].fb };
    draw();
  });
  box.querySelectorAll("[data-target]").forEach((sel) => sel.addEventListener("change", () => {
    t.targets[sel.dataset.target] = Number(sel.value);
    draw();
  }));
  main.addEventListener("click", () => {
    if (t.phase === "idle") { t.phase = "present"; t.present.startedAt = Date.now(); }
    else if (t.phase === "present") { stop(t.present); t.phase = "fb"; t.fb.startedAt = Date.now(); }
    else if (t.phase === "fb") { stop(t.fb); t.phase = "done"; }
    draw();
  });
  pause.addEventListener("click", () => {
    const c = t.phase === "fb" ? t.fb : t.present;
    if (c.startedAt) stop(c); else c.startedAt = Date.now();
    draw();
  });
  box.querySelector(".pt-reset").addEventListener("click", () => {
    t.phase = "idle";
    t.present = { elapsed: 0, startedAt: null };
    t.fb = { elapsed: 0, startedAt: null };
    draw();
  });
  draw();
  const tick = setInterval(() => (document.body.contains(box) ? draw() : clearInterval(tick)), 1000);
}

