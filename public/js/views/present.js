// 発表する：PJを選ぶ → 発表用のタイマー・概要・ドキュメント・発表の記録（メモとフィードバック）・発表時の注意点を映す
import { api, esc, state, avatar, fmtDate, fmtDateTime, jstDateTime, embedUrl, busy, toast, stageNoOf, pjPicker, pickItem, bindFold, ratioColor, fmtClock, copyForNotion, confirmDialog } from "../lib.js";
import { rolesSummary, FB_STATUS } from "./presentation.js";

export async function renderPresentList(el) {
  const { projects } = await api("/api/projects");
  const list = projects.filter((p) => p.status !== "archived");
  el.innerHTML = `
    <div class="page-heading left"><h1>🎤 どのPJを発表しますか？</h1></div>
    ${pjPicker(list, (p) => pickItem({ href: `#/present/${p.id}`, name: p.name, note: p.status === "done" ? "完了" : "" }), { empty: "まだPJがありません。" })}`;
}

// 発表の種類。政調MTGは「課題共有」か「政策発表」を選ぶ。目標時間の初期値は種類ごと（あとから変えられる）
const KINDS = { seicho: "政調MTG", other: "その他の発表" };
const SUBS = { share: "課題共有", policy: "政策発表" };
const TARGETS = { "seicho:share": [10, 10], "seicho:policy": [15, 15], other: [10, 10] };
const targetsFor = (kind, sub) => TARGETS[kind === "seicho" ? `seicho:${sub}` : "other"];
const kindLabel = (r) => (r.kind === "seicho" ? `${KINDS.seicho}・${SUBS[r.sub] || ""}` : KINDS.other);
const MINUTES = [3, 5, 7, 10, 15, 20, 25, 30, 40, 45, 60];
const FOUR_HOURS = 4 * 3600 * 1000;
// まだ記録を作っていないときの選択（PJごと。画面を開いているあいだだけ）
const drafts = new Map();

export async function renderPresent(el, id) {
  const [data, prepData, { records }] = await Promise.all([
    api(`/api/projects/${id}`), api(`/api/projects/${id}/presentation`), api(`/api/projects/${id}/presentations`),
  ]);
  const { prep } = prepData;
  const { project: p, members, stages, checklist, recentMinutes } = data;
  const type = state.types[p.type];
  const stage = type.stages.find((s) => s.no === p.current_stage);
  const presNo = stageNoOf(p.type, "presentation");
  const presentation = stages.find((s) => s.stage_no === presNo)?.due_date;
  const latest = recentMinutes.find((n) => n.summary.trim());
  const tips = checklist.filter((c) => c.stage_no === presNo);
  // 課題共有の資料・政調用の本文・台本。登録されているものを、切り替えて表示する
  const docs = [["share", "📊 課題共有", p.share_doc_url], ["doc", "📄 本文", p.doc_url], ["script", "🎤 台本", p.script_doc_url]].filter(([, , url]) => url);

  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/">ホーム</a> / <a href="#/present">発表する</a> / ${esc(p.name)}</nav>
    <p class="row-left cross-links">
      <a class="button small" href="#/projects/${p.id}">📁 PJ画面へ</a>
      <a class="button small" href="#/projects/${p.id}?tab=present">🗂 発表の準備・提出へ</a>
    </p>
    <div class="present" id="present">
      ${timerHtml()}
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
          : `<p class="muted">課題共有・政調用の本文・台本のドキュメントが登録されていません。<a href="#/projects/${p.id}/edit">PJの「編集」</a>から Google ドキュメントのURLを登録してください。</p>`}
      </section>

      <section class="card present-notes" id="record">
        <div class="notes-col">
          <div class="section-head"><h2>📝 発表の記録 <span class="live-badge" id="memo-badge"></span></h2>
            <button type="button" class="small" id="copy-record">📋 Notion用にコピー</button></div>
          <p class="muted small" id="record-info"></p>
          <textarea id="record-memo" rows="9" maxlength="10000"
            placeholder="発表中・質疑応答で気づいたことをメモ（自動で保存・みんなで同時に書けます）"></textarea>
          <p class="muted small"><span id="record-viewers"></span> <span id="record-status"></span></p>
        </div>
        <div class="notes-col">
          <div class="section-head"><h2>💬 フィードバック</h2>
            <a class="link small" href="#/projects/${p.id}?tab=present">反映状況を管理する</a></div>
          <form class="form" id="fb-quick">
            <textarea name="content" rows="2" maxlength="500" required placeholder="政調からの指摘（1件ずつ）"></textarea>
            <div class="inline-form">
              <input name="source" maxlength="60" value="政調" aria-label="誰から">
              <button class="primary small">追加</button>
            </div>
          </form>
          <div id="fb-list"></div>
        </div>
      </section>

      <details class="card past-records" id="past-records"></details>
      ${prep.present_memo ? `<details class="card"><summary class="small">以前の雑メモ</summary><p class="pre small">${esc(prep.present_memo)}</p></details>` : ""}

      ${tips.length ? `<section class="card">
        <h2>発表時の注意点</h2>
        <ul class="checklist">${tips.map((c) => `<li><span class="check"><span>${c.done_at ? "✅" : c.skipped_at ? "➖" : "⬜"}</span><span class="${c.skipped_at ? "skipped-label" : ""}">${esc(c.label)}</span></span></li>`).join("")}</ul>
        <a class="link small" href="#/projects/${p.id}?tab=present">発表準備（役割分担・リハーサル）を開く</a>
      </section>` : ""}
    </div>`;

  bindFold(el);
  const showDoc = (k) => {
    if (!el.querySelector(`[data-doc="${k}"]`) && !el.querySelector(`[data-doc-view="${k}"]`)) return;
    el.querySelectorAll("[data-doc]").forEach((x) => { const on = x.dataset.doc === k; x.classList.toggle("primary", on); x.setAttribute("aria-selected", on); });
    el.querySelectorAll("[data-doc-view]").forEach((v) => (v.hidden = v.dataset.docView !== k));
  };
  el.querySelectorAll("[data-doc]").forEach((b) => b.addEventListener("click", () => showDoc(b.dataset.doc)));
  el.querySelector("#fullscreen").addEventListener("click", () => {
    const box = el.querySelector("#present");
    if (document.fullscreenElement) document.exitFullscreen();
    else box.requestFullscreen?.();
  });

  bindRecord(el, p, records, showDoc);
}

// ---------- タイマー（いちばん上。スクロールしても残る） ----------
function timerHtml() {
  return `<div class="present-timer" id="ptimer">
    <span class="pt-kinds">
      <select class="pt-kind" aria-label="発表の種類">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
      <select class="pt-sub" aria-label="政調MTGの種類">${Object.entries(SUBS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    </span>
    ${[["present", "発表"], ["fb", "フィードバック"]].map(([k, label]) => `
      <div class="pt-phase" data-phase="${k}">
        <span class="pt-label">${label}</span>
        <b class="pt-time">0:00</b>
        <span class="pt-target">/ <select data-target="${k}" aria-label="${label}の目標時間">${MINUTES.map((m) => `<option value="${m}">${m}分</option>`).join("")}</select></span>
        <small class="pt-note"></small>
      </div>`).join("")}
    <span class="pt-actions">
      <button type="button" class="primary small pt-main"></button>
      <button type="button" class="small pt-new" title="新しい発表を始める">↺ 新しい発表</button>
    </span>
  </div>`;
}

// ---------- 発表の記録：タイマー・メモ（自動保存・同時編集）・フィードバック・コピー ----------
function bindRecord(el, p, records, showDoc) {
  const box = el.querySelector("#ptimer");
  const memo = el.querySelector("#record-memo");
  const status = (t) => { el.querySelector("#record-status").textContent = t; };
  let offset = 0; // サーバーとの時計のずれ
  const now = () => Date.now() + offset;
  // いまの発表：4時間以内に作った記録。なければ、まだ記録していない状態（選んだ種類だけ覚える）
  let rec = records[0] && Date.now() - records[0].created_at < FOUR_HOURS ? records[0] : null;
  let past = records.filter((r) => r !== rec);
  const draft = drafts.get(p.id) || { kind: "seicho", sub: "share", present_target: 10, fb_target: 10 };
  drafts.set(p.id, draft);
  const cur = () => rec || draft;
  const live = { focus: false, dirty: false, saving: false, timer: null, editor: null, busy: false };
  let dismissed = 0; // 「新しい発表」で閉じた記録（これ以前の記録は、いまの発表として開き直さない）

  const phase = () => !rec || !rec.present_start ? "idle" : !rec.present_end ? "present" : !rec.fb_end ? "fb" : "done";
  const spent = (start, end) => (start ? (end || now()) - start : 0);

  const drawTimer = () => {
    const c = cur();
    box.querySelector(".pt-kind").value = c.kind;
    const sub = box.querySelector(".pt-sub");
    sub.value = c.sub;
    sub.hidden = c.kind !== "seicho";
    const ph = phase();
    const times = { present: rec ? spent(rec.present_start, rec.present_end) : 0, fb: rec ? spent(rec.fb_start, rec.fb_end) : 0 };
    for (const k of ["present", "fb"]) {
      const ms = times[k];
      const target = c[`${k}_target`] * 60000;
      const row = box.querySelector(`[data-phase="${k}"]`);
      row.querySelector(`[data-target="${k}"]`).value = String(c[`${k}_target`]);
      row.querySelector(".pt-time").textContent = fmtClock(ms);
      row.style.setProperty("--pt-color", ratioColor(ms / target));
      row.classList.toggle("is-active", ph === k);
      row.classList.toggle("is-done", (k === "present" && ["fb", "done"].includes(ph)) || (k === "fb" && ph === "done"));
      row.querySelector(".pt-note").textContent = !ms ? "" : ms > target ? `${fmtClock(ms - target)} 超過` : `残り ${fmtClock(target - ms)}`;
    }
    const k = ph === "fb" ? "fb" : "present";
    box.style.setProperty("--pt-color", ratioColor(times[k] / (c[`${k}_target`] * 60000)));
    box.classList.toggle("is-running", ph === "present" || ph === "fb");
    const main = box.querySelector(".pt-main");
    main.textContent = { idle: "▶ 発表スタート", present: "✅ 発表終わり", fb: "✅ フィードバック終わり", done: "✓ 記録しました" }[ph];
    main.disabled = ph === "done";
    box.querySelector(".pt-new").hidden = !rec;
    el.querySelector("#record-info").textContent = rec
      ? `${fmtDateTime(jstDateTime(rec.created_at))}・${kindLabel(rec)}${rec.created_by_name ? `・記録：${rec.created_by_name}` : ""}`
      : "「発表スタート」を押すか、メモを書きはじめると記録ができます。";
  };

  const drawFeedback = () => {
    const list = rec?.feedback || [];
    el.querySelector("#fb-list").innerHTML = list.length ? `<ul class="fb-quick-list">${[...list].reverse().map((f) => `
      <li><span class="due ${f.status === "done" ? "" : "is-soon"}">${FB_STATUS[f.status]}</span>
        <span class="pre">${esc(f.content)}</span>${f.source ? `<small class="muted">${esc(f.source)}</small>` : ""}</li>`).join("")}</ul>`
      : `<p class="muted small">この発表のフィードバックはまだありません。</p>`;
  };

  const drawPast = () => {
    const box2 = el.querySelector("#past-records");
    box2.hidden = !past.length;
    box2.innerHTML = `<summary class="small"><strong>これまでの発表の記録</strong>（${past.length}件）</summary>
      <ul class="list past-list">${past.map((r) => `
        <li class="list-item"><span><strong>${fmtDateTime(jstDateTime(r.created_at))}</strong> ${esc(kindLabel(r))}
          <small class="muted">発表 ${fmtClock(spent(r.present_start, r.present_end))}・FB ${fmtClock(spent(r.fb_start, r.fb_end))}${r.feedback.length ? `・フィードバック ${r.feedback.length}件` : ""}</small></span>
          <div class="meta"><button type="button" class="small" data-copy-past="${r.id}">📋 コピー</button></div>
          ${r.memo ? `<details class="past-memo"><summary class="small">メモを見る</summary><p class="pre small">${esc(r.memo)}</p></details>` : ""}</li>`).join("")}</ul>`;
    box2.querySelectorAll("[data-copy-past]").forEach((b) => b.addEventListener("click", () =>
      copyForNotion(recordMarkdown(p, past.find((r) => r.id === Number(b.dataset.copyPast))))));
  };

  const drawAll = () => { drawTimer(); drawFeedback(); drawPast(); };

  // 記録を作る（まだなければ）。start：発表スタートも同時に
  const ensure = async (start = false) => {
    if (rec) return rec;
    const { id } = await api(`/api/projects/${p.id}/presentations`, { method: "POST", body: { ...draft, start } });
    await beat();
    return rec || { id };
  };
  const patch = (body) => api(`/api/presentations/${rec.id}`, { method: "PATCH", body }).then((r) => { offset = r.now - Date.now(); });

  // 種類・目標時間
  const setKind = async (changes) => {
    Object.assign(draft, changes);
    if (changes.kind || changes.sub) {
      const [pt, ft] = targetsFor(draft.kind, draft.sub);
      Object.assign(draft, { present_target: pt, fb_target: ft });
    }
    if (draft.kind === "seicho") showDoc(draft.sub === "share" ? "share" : "doc");
    if (rec) {
      Object.assign(rec, draft);
      drawTimer();
      await patch({ kind: draft.kind, sub: draft.sub, present_target: draft.present_target, fb_target: draft.fb_target }).catch((e) => toast(e.message, "error"));
    }
    drawTimer();
  };
  box.querySelector(".pt-kind").addEventListener("change", (e) => setKind({ kind: e.target.value }));
  box.querySelector(".pt-sub").addEventListener("change", (e) => setKind({ sub: e.target.value }));
  box.querySelectorAll("[data-target]").forEach((s) => s.addEventListener("change", () =>
    setKind({ [`${s.dataset.target}_target`]: Number(s.value) })));

  box.querySelector(".pt-main").addEventListener("click", (e) => busy(e.currentTarget, async () => {
    const ph = phase();
    if (ph === "idle") {
      if (rec) await patch({ action: "start" }); else await ensure(true);
    } else if (ph === "present") await patch({ action: "end_present" });
    else if (ph === "fb") await patch({ action: "end_fb" });
    await beat();
  }).catch(() => {}));

  box.querySelector(".pt-new").addEventListener("click", async () => {
    if (!await confirmDialog("新しい発表を始めますか？\n今の発表の記録は保存されていて、「これまでの発表の記録」から見られます。", { ok: "新しい発表を始める" })) return;
    await flush();
    if (rec) { past = [rec, ...past]; dismissed = rec.id; }
    rec = null;
    memo.value = "";
    Object.assign(draft, { present_target: targetsFor(draft.kind, draft.sub)[0], fb_target: targetsFor(draft.kind, draft.sub)[1] });
    drawAll();
  });

  // メモ：自動保存。書いている人がほかにいるあいだは書けない
  const flush = async () => {
    clearTimeout(live.timer);
    if (!live.dirty) return;
    live.dirty = false;
    live.saving = true;
    try {
      await ensure();
      await patch({ memo: memo.value });
      status(`✓ 自動で保存しました（${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}）`);
    } catch (err) {
      live.dirty = true;
      status(`⚠ 保存できませんでした：${err.message}`);
    } finally {
      live.saving = false;
    }
  };
  memo.addEventListener("input", () => {
    live.dirty = true;
    status("入力中…");
    clearTimeout(live.timer);
    live.timer = setTimeout(flush, 1000);
  });
  memo.addEventListener("focus", () => {
    if (live.editor) { toast(`${live.editor}さんが入力中です`); memo.blur(); return; }
    live.focus = true;
    beat();
  });
  memo.addEventListener("blur", () => { live.focus = false; flush().finally(beat); });

  // フィードバックの追加：この発表の記録に結び付ける
  el.querySelector("#fb-quick").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const button = e.submitter;
    if (!await confirmDialog("フィードバックを追加しますか？\nPJメンバーにお知らせが届きます。", { ok: "追加して知らせる" })) return;
    busy(button, async () => {
      const r = await ensure();
      await api(`/api/projects/${p.id}/feedback`, { method: "POST", body: { content: f.content.value, source: f.source.value, presentation_id: r.id } });
      toast("フィードバックを追加しました（未対応）");
      f.content.value = "";
      await beat();
      f.content.focus();
    }).catch(() => {});
  });

  el.querySelector("#copy-record").addEventListener("click", () => {
    if (!rec) return toast("まだ記録がありません", "error");
    copyForNotion(recordMarkdown(p, { ...rec, memo: memo.value }));
  });

  // 数秒ごとに、いまの記録（ほかの人の書いた内容・時間）を受け取る
  async function beat() {
    if (live.busy) return;
    live.busy = true;
    try {
      const r = await api(`/api/projects/${p.id}/presentations/live`, { method: "POST", body: { field: live.focus ? "memo" : null } });
      offset = r.now - Date.now();
      if (r.record && r.record.id > dismissed && (!rec || rec.id === r.record.id || r.record.id > rec.id)) {
        if (rec && rec.id !== r.record.id) past = [rec, ...past.filter((x) => x.id !== rec.id)];
        rec = r.record;
        Object.assign(draft, { kind: rec.kind, sub: rec.sub, present_target: rec.present_target, fb_target: rec.fb_target });
        if (!live.focus && !live.dirty && !live.saving && memo.value !== rec.memo) memo.value = rec.memo;
      }
      live.editor = r.editors.find((x) => x.field === "memo")?.name || null;
      memo.readOnly = Boolean(live.editor);
      el.querySelector("#memo-badge").textContent = live.editor ? `✏️ ${live.editor}さんが入力中` : "";
      el.querySelector("#record-viewers").textContent = r.viewers.length ? `👥 ${r.viewers.join("、")}さんも開いています` : "";
      drawAll();
    } catch { /* 通信が途切れても、次でやり直す */ } finally {
      live.busy = false;
    }
  }

  if (rec) memo.value = rec.memo;
  if (cur().kind === "seicho") showDoc(cur().sub === "share" ? "share" : "doc");
  drawAll();
  beat();
  let n = 0;
  const tick = setInterval(() => {
    if (!document.body.contains(box)) return clearInterval(tick);
    drawTimer();
    if (++n % 4 === 0 && !document.hidden) beat();
  }, 1000);
}

// Notionに貼ると見出し・箇条書き・チェックボックスになる形
function recordMarkdown(p, r) {
  const spent = (s, e) => (s ? fmtClock((e || Date.now()) - s) : "—");
  const lines = (text) => text.trim() ? text.trim().split("\n").map((l) => (/^\s*[-・]/.test(l) ? `- ${l.replace(/^\s*[-・]\s*/, "")}` : l)) : ["（なし）"];
  return [
    `## ${p.name} 発表の記録 ${fmtDateTime(jstDateTime(r.created_at))}（${kindLabel(r)}）`, "",
    `- 発表：${spent(r.present_start, r.present_end)}（目標 ${r.present_target}分）`,
    `- フィードバック：${spent(r.fb_start, r.fb_end)}（目標 ${r.fb_target}分）`, "",
    "### メモ", ...lines(r.memo || ""), "",
    "### フィードバック", ...(r.feedback?.length ? r.feedback.map((f) => `- [${f.status === "done" ? "x" : " "}] ${f.content}${f.source ? `（${f.source}）` : ""}`) : ["（なし）"]),
  ].join("\n");
}
