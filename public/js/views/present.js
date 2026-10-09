// 発表する：PJを選ぶ → 概要・本文ドキュメント・キーワード・発表時の注意点を映す
import { api, esc, state, avatar, fmtDate, embedUrl, busy, toast, stageNoOf, pjPicker, pickItem, timerHtml, bindTimer, bindFold } from "../lib.js";
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
        ${timerHtml(`present-${p.id}`, { target: true })}
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
  bindTimer(el, `present-${p.id}`);
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
