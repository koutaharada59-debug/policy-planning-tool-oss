// フェーズ3：発表・提出タブ（発表準備／政調からのフィードバック／最終提出）
import { api, esc, state, busy, toast, formData, memberOptions, fmtDate, fmtDateTime, dueBadge, gcalEventUrl, gcalLink, membersFirst, confirmDialog, guardForm, markSaved } from "../lib.js";

export const FB_STATUS = { todo: "未対応", doing: "対応中", done: "反映済み" };
const ROLE_LABELS = [
  ["role_mc", "司会"],
  ["role_slides", "スライド係"],
  ["role_minutes", "議事録係", "発表しないメンバーが担当"],
  ["role_screenshots", "スクショ係"],
];

export async function renderPresentationTab(body, projectId) {
  const data = await api(`/api/projects/${projectId}/presentation`);
  const { prep, dates, rehearsals, feedback, canEdit } = data;
  const ro = canEdit ? "" : "disabled";
  const reload = () => renderPresentationTab(body, projectId);
  const people = membersFirst(data.members);
  const roleCount = ROLE_LABELS.filter(([k]) => prep[k]).length;
  const doneRehearsals = rehearsals.filter((r) => r.done).length;
  const fbDone = feedback.filter((f) => f.status === "done").length;
  const early = rehearsals.length && dates.rehearsalFrom && rehearsals[0].starts_at.slice(0, 10) <= dates.rehearsalFrom;
  const chip = (ok, label) => `<span class="prep-chip ${ok ? "ok" : ""}">${ok ? "✓" : "・"} ${label}</span>`;

  body.innerHTML = `
    <section class="card present-summary">
      <div class="row">
        <div><span class="muted small">政調での最終発表</span>
          <h2>${dates.presentation ? fmtDate(dates.presentation) : "未定"}${dates.presentationFixed ? "" : `<small class="muted">（仮）</small>`}
            ${dates.presentation ? dueBadge(dates.presentation) : ""}</h2>
          ${dates.presentationFixed ? "" : `<p class="muted small">発表日が決まったら、<a href="#/projects/${projectId}/edit">PJの「編集」</a>で登録してください。各期限が組み直されます。</p>`}</div>
        <div class="prep-chips">
          ${chip(prep.abstract_status === "done", "アブストラクト")}
          ${chip(roleCount === 4, `役割 ${roleCount}/4`)}
          ${chip(rehearsals.length >= 2, `リハーサル ${rehearsals.length}回`)}
          ${chip(Boolean(prep.materials_sent_on), "資料送付")}
          ${chip(feedback.length && fbDone === feedback.length, `FB反映 ${fbDone}/${feedback.length}`)}
          ${chip(prep.final_status === "done", "最終提出")}
        </div>
      </div>
    </section>

    <h2 class="section-title">① 発表準備</h2>
    <form class="card form" id="prep-form">
      <fieldset>
        <legend>アブストラクト（A4・1ページの要約）</legend>
        <p class="muted small">本文の完成を待たずに、発表するPJが決まった段階で先に提出します。どんな課題があり、どう解決する提案かがひと目で分かるように。</p>
        <div class="grid-3">
          <label>状態<select name="abstract_status" ${ro}>
            <option value="todo" ${prep.abstract_status !== "done" ? "selected" : ""}>未提出</option>
            <option value="done" ${prep.abstract_status === "done" ? "selected" : ""}>提出済み</option></select></label>
          <label>提出日<input type="date" name="abstract_submitted_on" value="${esc(prep.abstract_submitted_on || "")}" ${ro}></label>
          <label>アブストラクトのURL<input type="url" name="abstract_url" value="${esc(prep.abstract_url)}" placeholder="https://docs.google.com/..." ${ro}></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>アウトプットと発表資料</legend>
        <div class="grid-2">
          <label>形式<select name="output_format" ${ro}>
            <option value="">未定</option>
            <option value="document" ${prep.output_format === "document" ? "selected" : ""}>ドキュメント</option>
            <option value="slides" ${prep.output_format === "slides" ? "selected" : ""}>スライド（Figma）</option></select></label>
          <label>発表資料のURL<input type="url" name="slide_url" value="${esc(prep.slide_url)}" placeholder="Figma・スライドなど" ${ro}></label>
        </div>
        <p class="muted small">スライドは基本的に政策立案部門でテンプレートから作成。外に発信するものはデザイン部門への相談もアリ。</p>
      </fieldset>
      <fieldset>
        <legend>役割分担</legend>
        <div class="grid-2">${ROLE_LABELS.map(([k, label, hint]) => `
          <label>${label}${hint ? `<small class="muted">（${hint}）</small>` : ""}
            <select name="${k}" ${ro}>${memberOptions(people, prep[k], { empty: "（未定）" })}</select></label>`).join("")}</div>
      </fieldset>
      <fieldset>
        <legend>発表資料の送付（党本部へ）</legend>
        <div class="grid-2">
          <label>送付した日<input type="date" name="materials_sent_on" value="${esc(prep.materials_sent_on || "")}" ${ro}></label>
          <p class="small">${dates.materialsBy ? `期限：<strong>${fmtDate(dates.materialsBy)}</strong>（発表の前日まで） ${prep.materials_sent_on ? "" : dueBadge(dates.materialsBy)}` : ""}</p>
        </div>
      </fieldset>
      ${canEdit ? `<div class="form-actions">${prep.updated_by_name ? `<span class="muted small">最終更新：${esc(prep.updated_by_name)}</span>` : ""}<button class="primary">発表準備を保存</button></div>` : ""}
    </form>

    <section class="card">
      <div class="section-head"><h3>リハーサル</h3>
        <span class="muted small">${dates.rehearsalFrom ? `${fmtDate(dates.rehearsalFrom)}（発表の2週間前）から複数回` : "発表の2週間前から複数回"}</span></div>
      <p class="muted small">PJメンバー以外、他部門の人にも見てもらいましょう。</p>
      ${rehearsals.length < 2 ? `<p class="caution small">リハーサルは2回以上を目安に入れましょう（いま${rehearsals.length}回）。</p>` : ""}
      ${rehearsals.length && !early ? `<p class="caution small">最初のリハーサルが、発表の2週間前より後になっています。</p>` : ""}
      ${rehearsals.length ? `<ul class="list">${rehearsals.map((r) => `
        <li class="list-item ${r.done ? "is-done" : ""}">
          <label class="check"><input type="checkbox" data-rh-done="${r.id}" ${r.done ? "checked" : ""} ${ro}>
            <span><strong>${fmtDateTime(r.starts_at)}</strong> ${r.place ? `<small>${esc(r.place)}</small>` : ""}${r.audience ? `<small>見てもらう人：${esc(r.audience)}</small>` : ""}</span></label>
          <div class="meta">
            ${gcalLink(gcalEventUrl({ title: `${data.project.name} 発表リハーサル`, start: r.starts_at, durationMin: r.duration_min, location: r.place }), "")}
            ${canEdit ? `<button class="link-btn danger" data-rh-del="${r.id}">削除</button>` : ""}
          </div>
          <input class="rh-note" data-rh-note="${r.id}" maxlength="500" placeholder="出た指摘（短く）" value="${esc(r.note)}" ${ro}>
        </li>`).join("")}</ul>` : ""}
      ${canEdit ? `<form class="inline-form" id="rh-form">
        <input type="datetime-local" name="starts_at" required aria-label="日時">
        <input name="place" maxlength="200" placeholder="場所・URL">
        <input name="audience" maxlength="200" placeholder="見てもらう人（例：広報部門の〇〇さん）">
        <button class="small primary">追加</button>
      </form>` : ""}
    </section>

    <h2 class="section-title">② 政調からのフィードバック</h2>
    <section class="card">
      <p class="muted small">発表後すぐにレビュー会を開き、指摘を項目ごとに登録して、反映状況を管理します。詳しい内容は本文ドキュメントへ。</p>
      ${feedback.length ? `<div class="progress"><span style="width:${Math.round((fbDone / feedback.length) * 100)}%"></span></div>
        <p class="small">反映済み ${fbDone} ／ 対応中 ${feedback.filter((f) => f.status === "doing").length} ／ 未対応 ${feedback.filter((f) => f.status === "todo").length}</p>` : ""}
      ${feedback.length ? `<ul class="list fb-list">${feedback.map((f) => `
        <li class="list-item fb-${f.status}">
          <div class="fb-main">
            <select class="status-select s-${f.status === "todo" ? "todo" : f.status}" data-fb-status="${f.id}" ${ro} aria-label="状態">
              ${Object.entries(FB_STATUS).map(([k, l]) => `<option value="${k}" ${k === f.status ? "selected" : ""}>${l}</option>`).join("")}</select>
            <span class="pre">${esc(f.content)}</span>
          </div>
          <div class="meta">
            ${f.source ? `<span class="tag">${esc(f.source)}</span>` : ""}
            ${f.owner_name ? `<span>担当：${esc(f.owner_name)}</span>` : ""}
            ${f.measure_title ? `<a href="#/projects/${projectId}?tab=measures&open=${f.measure_id}">施策：${esc(f.measure_title)}</a>` : ""}
            ${canEdit ? `<button class="link-btn" data-fb-edit="${f.id}">編集</button><button class="link-btn danger" data-fb-del="${f.id}">削除</button>` : ""}
          </div>
          ${f.response ? `<p class="fb-response pre small">反映：${esc(f.response)}</p>` : ""}
          <div class="fb-edit"></div>
        </li>`).join("")}</ul>` : `<p class="muted">まだフィードバックはありません。</p>`}
      ${canEdit ? `<details class="add-fb"><summary class="small"><strong>＋ フィードバックを追加</strong></summary>${fbForm({}, people, data.measures)}</details>` : ""}
    </section>

    <h2 class="section-title">③ 最終提出</h2>
    <form class="card form" id="final-form">
      <p class="small">${dates.finalBy ? `提出期限：<strong>${fmtDate(dates.finalBy)}</strong>（発表から約1カ月） ${prep.final_status === "done" ? "" : dueBadge(dates.finalBy)}` : ""}</p>
      <p class="muted small">フィードバックをもとに改めてリサーチし、提言書に直接修正を加え、読み合わせてから改訂版を党本部へ提出します。状態を「提出済み」にして保存すると、部門長・副部門長に完了の承認を依頼します（部門長・副部門長が保存したときは、そのままPJが完了になります）。</p>
      ${feedback.some((f) => f.status !== "done") ? `<p class="caution small">まだ反映していないフィードバックが ${feedback.filter((f) => f.status !== "done").length}件 あります。</p>` : ""}
      <div class="grid-3">
        <label>状態<select name="final_status" ${ro}>
          <option value="todo" ${prep.final_status !== "done" ? "selected" : ""}>準備中</option>
          <option value="done" ${prep.final_status === "done" ? "selected" : ""}>提出済み</option></select></label>
        <label>提出日<input type="date" name="final_submitted_on" value="${esc(prep.final_submitted_on || "")}" ${ro}></label>
        <label>提出した改訂版のURL<input type="url" name="final_url" value="${esc(prep.final_url)}" ${ro}></label>
      </div>
      <label>メモ<textarea name="final_memo" rows="2" maxlength="500" ${ro}>${esc(prep.final_memo)}</textarea></label>
      ${prep.final_status !== "done" ? "" : data.project.status === "done" ? `<p class="notice small">🎉 最終提出が済み、PJは完了しています。</p>`
        : data.project.completion_requested_at ? `<p class="notice small">⏳ 最終提出が済み、部門長・副部門長の承認待ちです。</p>`
        : `<p class="caution small">まだ部門長・副部門長に完了の承認を依頼していません。「最終提出を保存」を押すと依頼します。</p>`}
      ${canEdit ? `<div class="form-actions"><button class="primary">最終提出を保存</button></div>` : ""}
    </form>`;

  // 発表準備・最終提出：それぞれのフォームの項目だけを送る
  const savePrep = (form, extra = {}) => async (e) => {
    e.preventDefault();
    const button = e.submitter;
    // 最終提出を「提出済み」にするときは、確認してから（部門長・副部門長に完了の承認を依頼する／部門長なら完了になる）
    const pj = data.project;
    if (form.id === "final-form" && form.final_status.value === "done" && pj.status === "active" && (state.me.isAdmin || !pj.completion_requested_at)
      && !await confirmDialog(state.me.isAdmin
        ? "最終提出を「提出済み」として保存しますか？\nこのPJは完了になり、PJメンバーにお知らせが届きます。"
        : "最終提出を「提出済み」として保存しますか？\n部門長・副部門長に、PJの完了の承認を依頼するお知らせが届きます。", { ok: "提出済みとして保存する" })) return;
    busy(button, () => api(`/api/projects/${projectId}/presentation`, { method: "PUT", body: { ...formData(form), ...extra, version: prep.version } }))
      .then((res) => {
        markSaved(form);
        toast(res.completion === "done" ? "最終提出を保存し、PJを完了にしました"
          : res.completion === "requested" ? "最終提出を保存し、部門長に完了の承認を依頼しました" : "保存しました");
        // 完了・承認待ちの表示（PJ画面の上）も出し直す
        if (res.completion) location.reload(); else reload();
      }).catch(() => {});
  };
  const prepForm = body.querySelector("#prep-form");
  prepForm.addEventListener("submit", savePrep(prepForm));
  const finalForm = body.querySelector("#final-form");
  finalForm.addEventListener("submit", savePrep(finalForm));
  if (canEdit) { guardForm(prepForm); guardForm(finalForm); }

  body.querySelector("#rh-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => api(`/api/projects/${projectId}/rehearsals`, { method: "POST", body: formData(e.target) }))
      .then(() => { toast("リハーサルを追加しました"); reload(); }).catch(() => {});
  });
  body.querySelectorAll("[data-rh-done]").forEach((cb) => cb.addEventListener("change", () =>
    busy(cb, () => api(`/api/rehearsals/${cb.dataset.rhDone}`, { method: "PATCH", body: { done: cb.checked } }))
      .then(reload).catch(() => (cb.checked = !cb.checked))));
  body.querySelectorAll("[data-rh-note]").forEach((input) => input.addEventListener("change", () =>
    busy(input, () => api(`/api/rehearsals/${input.dataset.rhNote}`, { method: "PATCH", body: { note: input.value } }))
      .then(() => toast("指摘を保存しました")).catch(() => {})));
  body.querySelectorAll("[data-rh-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("このリハーサルを削除しますか？")) return;
    busy(b, () => api(`/api/rehearsals/${b.dataset.rhDel}`, { method: "DELETE", body: {} })).then(reload).catch(() => {});
  }));

  body.querySelector(".add-fb form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.submitter;
    if (!await confirmDialog("フィードバックを追加しますか？\nPJメンバーにお知らせが届きます。", { ok: "追加して知らせる" })) return;
    busy(button, () => api(`/api/projects/${projectId}/feedback`, { method: "POST", body: formData(e.target) }))
      .then(() => { toast("フィードバックを追加しました"); reload(); }).catch(() => {});
  });
  body.querySelectorAll("[data-fb-status]").forEach((s) => s.addEventListener("change", () => {
    const f = feedback.find((x) => x.id === Number(s.dataset.fbStatus));
    busy(s, () => api(`/api/feedback/${f.id}`, { method: "PATCH", body: { status: s.value, version: f.version } }))
      .then(reload).catch(reload);
  }));
  body.querySelectorAll("[data-fb-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("このフィードバックを削除しますか？")) return;
    busy(b, () => api(`/api/feedback/${b.dataset.fbDel}`, { method: "DELETE", body: {} })).then(reload).catch(() => {});
  }));
  body.querySelectorAll("[data-fb-edit]").forEach((b) => b.addEventListener("click", () => {
    const f = feedback.find((x) => x.id === Number(b.dataset.fbEdit));
    const box = b.closest("li").querySelector(".fb-edit");
    box.innerHTML = fbForm(f, people, data.measures);
    const form = box.querySelector("form");
    form.querySelector("[data-cancel]").addEventListener("click", () => (box.innerHTML = ""));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      busy(e.submitter, () => api(`/api/feedback/${f.id}`, { method: "PATCH", body: { ...formData(form), version: f.version } }))
        .then(() => { toast("保存しました"); reload(); }).catch(() => {});
    });
  }));
}

function fbForm(f, people, measures) {
  return `
    <form class="form" style="margin-top:10px">
      <label>指摘の内容 <span class="req">必須</span><textarea name="content" rows="2" maxlength="500" required>${esc(f.content || "")}</textarea></label>
      <div class="grid-3">
        <label>誰から<input name="source" maxlength="60" value="${esc(f.source || "")}" placeholder="例：政調、党本部の〇〇さん"></label>
        <label>担当<select name="owner_id">${memberOptions(people, f.owner_id, { empty: "（未定）" })}</select></label>
        <label>状態<select name="status">${Object.entries(FB_STATUS).map(([k, l]) => `<option value="${k}" ${k === (f.status || "todo") ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <label>関係する施策<select name="measure_id"><option value="">（なし）</option>
        ${measures.map((m) => `<option value="${m.id}" ${m.id === f.measure_id ? "selected" : ""}>${esc(m.title)}</option>`).join("")}</select></label>
      <label>どう反映したか<textarea name="response" rows="2" maxlength="1000">${esc(f.response || "")}</textarea></label>
      <div class="form-actions">${f.id ? `<button type="button" data-cancel>やめる</button>` : ""}<button class="primary small">${f.id ? "保存する" : "追加する"}</button></div>
    </form>`;
}

// 「発表する」画面で使う：役割分担を短く表示する
export function rolesSummary(prep, users) {
  const nameOf = (id) => users.find((u) => u.id === id)?.name;
  const filled = ROLE_LABELS.filter(([k]) => prep[k]);
  if (!filled.length) return "";
  return `<div class="roles">${filled.map(([k, label]) => `<span><small>${label}</small>${esc(nameOf(prep[k]) || "")}</span>`).join("")}</div>`;
}

