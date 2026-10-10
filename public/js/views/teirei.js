// 部門の定例：入口（定例の記録／進捗を書く／管理者は定例を始める）と、それぞれの画面
import { api, esc, state, fmtDate, fmtDateTime, jstDateTime, addDays, hashQuery, confirmDialog, busy, toast, formData, copyForNotion, copyButton, bindCopyButtons, pjPicker, pickItem, timerHtml, bindTimer, guardForm, markSaved, mergeText } from "../lib.js";

const EVENTS = { "": "なし", news: "ニュース勉強会", exchange: "意見交換会" };
const FIELDS = [
  ["done", "前回の定例からやったこと"],
  ["next", "次の定例までにやること"],
  ["issues", "困っていること・相談したいこと"],
];

const stageName = (p) => state.types[p.type]?.stages.find((s) => s.no === p.current_stage)?.name || "";
const stageLabel = (p) => `工程${p.current_stage}・${esc(stageName(p))}`;
const paragraphs = (r) => FIELDS.filter(([k]) => r[k]).map(([k, label]) => `<h4>${label}</h4><p class="pre">${esc(r[k])}</p>`).join("")
  || `<p class="muted small">（空欄）</p>`;
// Notionに貼ると見出し・箇条書きになる形（行頭の「・」「-」は箇条書きにする）
const mdText = (text) => text.trim().split("\n").map((l) => (/^\s*[-・]/.test(l) ? `- ${l.replace(/^\s*[-・]\s*/, "")}` : l));
const reportMd = (r, level = "####") => FIELDS.filter(([k]) => r[k]?.trim()).flatMap(([k, label]) => [`${level} ${label}`, ...mdText(r[k]), ""]);

// ---------- 定例の入口：定例の記録／進捗を書く／（部門長・副部門長）事務連絡を書く・定例 ----------
const WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];
const slotLabel = (startsAt) => `${fmtDate(startsAt.slice(0, 10))} ${startsAt.slice(11, 16)}`;
const meetingLabel = (m) => `${fmtDate(m.held_on)}${m.starts_at ? ` ${m.starts_at.slice(11, 16)}` : ""}の定例`;
const stateTag = (m) => !m ? "" : m.is_open ? `<span class="due is-soon">進行中</span>` : m.is_ready ? `<span class="tag">準備中</span>` : `<span class="tag">終了</span>`;

export async function renderTeireiHome(el) {
  const { today, meetings } = await api("/api/dept-meetings");
  const todays = meetings.find((m) => m.held_on === today);
  const admin = state.me.isAdmin;
  el.innerHTML = `
    <div class="page-heading"><h1>🏛️ 定例</h1></div>
    <div class="choices ${admin ? "two" : todays?.is_open ? "" : "two"}">
      <a class="choice" href="#/teirei/minutes">
        <span class="choice-icon">📄</span>
        <strong>定例の記録</strong>
      </a>
      <a class="choice" href="#/report">
        <span class="choice-icon">📝</span>
        <strong>進捗を書く</strong>
      </a>
      ${admin ? `<button type="button" class="choice" data-panel="notice">
        <span class="choice-icon">📢</span>
        <strong>事務連絡を書く<small class="choice-role">部門長・副部門長</small></strong>
      </button>
      <button type="button" class="choice" data-panel="teirei">
        <span class="choice-icon">🏛️</span>
        <strong>定例<small class="choice-role">部門長・副部門長</small></strong>
      </button>` : todays?.is_open ? `<a class="choice" href="#/teirei/${todays.id}">
        <span class="choice-icon">▶️</span>
        <strong>今日の定例を開く</strong>
      </a>` : ""}
    </div>
    <div id="panel"></div>`;

  const panel = el.querySelector("#panel");
  let opened = "";
  const show = (key, html) => {
    opened = key;
    panel.innerHTML = `<div class="confirm-start narrow">${html}</div>`;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const loadSlots = () => api("/api/dept-schedules");

  // 定例：始める／予定する
  const teireiPanel = () => show("teirei", `
    ${todays?.is_open ? `<a class="button primary" href="#/teirei/${todays.id}">▶ 今日の定例を開く</a>` : ""}
    <button type="button" class="${todays?.is_open ? "" : "primary"}" data-act="start">▶ 定例を始める</button>
    <a class="button" href="#/teirei/schedule">🗓 定例を予定する</a>`);

  // 定例を始める：予定から直近3回の日時を出す。押すとその日時の定例（議事録）を作る
  const startPanel = async () => {
    const { upcoming } = await loadSlots();
    const todayInList = upcoming.some((x) => x.starts_at.startsWith(today));
    show("teirei", `
      <p><strong>どの定例を始めますか？</strong></p>
      ${upcoming.length ? `<ul class="planned-list">${upcoming.map((x, i) => `
        <li><div><strong>${slotLabel(x.starts_at)}</strong>${x.starts_at.startsWith(today) ? `<span class="tag">今日</span>` : ""}${stateTag(x.meeting)}</div>
          ${!x.meeting ? `<button type="button" class="${i === 0 ? "primary" : ""}" data-start="${x.starts_at}">この日時の定例を始める</button>`
            : x.meeting.ended_at && x.meeting.held_on === today ? `<span class="row-left"><a class="button" href="#/teirei/${x.meeting.id}">議事録を開く</a><button type="button" data-reopen="${x.meeting.id}">↩ 再開する</button></span>`
            : `<a class="button ${x.meeting.ended_at ? "" : "primary"}" href="#/teirei/${x.meeting.id}">${x.meeting.ended_at ? "議事録を開く" : "開く"}</a>`}</li>`).join("")}</ul>`
        : `<p class="muted small">定例の予定がありません。「定例を予定する」から登録できます。</p>`}
      ${todays && !todayInList ? `<p class="small">今日の定例（予定外）：${stateTag(todays)}
          <a href="#/teirei/${todays.id}">開く</a>${todays.ended_at ? ` <button type="button" class="link-btn" data-reopen="${todays.id}">↩ 再開する</button>` : ""}</p>`
        : !todays && !todayInList ? `<button type="button" class="link-btn" data-adhoc>予定外で今日の定例を始める</button>` : ""}
      <div class="form-actions"><button type="button" data-back>← 戻る</button></div>`);
    panel.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", () =>
      busy(b, () => api("/api/dept-meetings", { method: "POST", body: { starts_at: b.dataset.start } }))
        .then((res) => { location.hash = `#/teirei/${res.id}`; }).catch(() => {})));
    panel.querySelector("[data-adhoc]")?.addEventListener("click", (e) => busy(e.currentTarget, () => api("/api/dept-meetings", { method: "POST", body: {} }))
      .then((res) => { location.hash = `#/teirei/${res.id}`; }).catch(() => {}));
    panel.querySelectorAll("[data-reopen]").forEach((b) => b.addEventListener("click", () =>
      busy(b, () => reopenTeirei(Number(b.dataset.reopen))).then(() => { location.hash = `#/teirei/${b.dataset.reopen}`; }).catch(() => {})));
    panel.querySelector("[data-back]").addEventListener("click", teireiPanel);
  };

  // 事務連絡を書く：予定から直近3回の日時を出して、どの定例の事務連絡を書くか選ぶ
  const noticePanel = async () => {
    const { upcoming } = await loadSlots();
    show("notice", `
      <p><strong>どの定例の事務連絡を書きますか？</strong></p>
      ${upcoming.length ? `<ul class="planned-list">${upcoming.map((x, i) => `
        <li><div><strong>${slotLabel(x.starts_at)}</strong>${x.starts_at.startsWith(today) ? `<span class="tag">今日</span>` : ""}${stateTag(x.meeting)}
            ${x.has_notice ? `<span class="tag">書き置きあり</span>` : ""}</div>
          <a class="button ${i === 0 ? "primary" : ""}" href="#/teirei/notice?day=${x.starts_at.slice(0, 10)}">この定例の事務連絡を書く</a></li>`).join("")}</ul>`
        : `<p class="muted small">定例の予定がありません。「定例」→「定例を予定する」から登録できます。</p>
          <a class="button" href="#/teirei/notice">日付を決めずに書く（次の定例に入ります）</a>`}`);
  };

  el.querySelectorAll("[data-panel]").forEach((b) => b.addEventListener("click", () => {
    if (opened === b.dataset.panel) { panel.innerHTML = ""; opened = ""; return; }
    if (b.dataset.panel === "teirei") teireiPanel();
    else noticePanel().catch((e) => toast(e.message, "error"));
  }));
  panel.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="start"]')) startPanel().catch((err) => toast(err.message, "error"));
  });
}

// ---------- 議事録の一覧 ----------
export async function renderTeireiMinutes(el) {
  const { meetings } = await api("/api/dept-meetings");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/teirei">定例</a> / 定例の記録</nav>
    <div class="page-heading left"><h1>📄 定例の記録</h1></div>
    ${meetings.length ? `<ul class="list">${meetings.map((m) => `
      <li class="list-item"><a href="#/teirei/${m.id}">${meetingLabel(m)}</a>
        <div class="meta">${m.is_open ? `<span class="due is-soon">進行中</span>` : ""}
          <span class="muted small">進捗共有 ${m.reports}件</span>${m.event ? `<span class="tag">${EVENTS[m.event]}</span>` : ""}</div></li>`).join("")}</ul>`
      : `<div class="empty"><p>まだ定例はありません。</p></div>`}`;
}

// ---------- 定例の議事録：事務連絡 → 各PJの進捗共有 → メモ → イベント → 定例を終わる ----------
export async function renderTeirei(el, id) {
  const { meeting: m, reports, missing, canEdit } = await api(`/api/dept-meetings/${id}`);
  const ro = canEdit ? "" : "disabled";
  let version = m.version;
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/teirei">定例</a> / <a href="#/teirei/minutes">定例の記録</a> / ${fmtDate(m.held_on)}</nav>
    ${m.is_open ? timerHtml(`teirei-${m.id}`, { bar: true }) : ""}
    <div class="page-heading left"><h1>🏛️ ${meetingLabel(m)} ${stateTag(m)}</h1>
      ${m.updated_by_name ? `<p>最終更新：${esc(m.updated_by_name)}・${fmtDateTime(jstDateTime(m.updated_at))}</p>` : ""}</div>

    <form class="minutes" id="teirei-form">
      <section class="card">
        <div class="section-head"><h2>📢 事務連絡</h2>${copyButton("notice")}</div>
        ${canEdit ? `<textarea name="notice" rows="5" maxlength="5000" placeholder="部門長・副部門長からの連絡事項">${esc(m.notice)}</textarea>`
          : m.notice ? `<p class="pre">${esc(m.notice)}</p>` : `<p class="muted">事務連絡はありません。</p>`}
      </section>

      <section class="card">
        <div class="section-head"><h2>📊 各PJの進捗共有</h2>${m.is_open ? `<button type="button" class="small" id="reload">最新にする</button>` : ""}</div>
        ${reports.length || missing.length ? `<div class="report-grid">
          ${reports.map((r) => `
            <article class="report">
              <span class="stage-pill">${stageLabel(r)}</span>
              <div class="section-head"><h3><a href="#/projects/${r.project_id}">${esc(r.project_name)}</a></h3>${copyButton(`report-${r.project_id}`)}</div>
              ${paragraphs(r)}
              <p class="muted small">${esc(r.updated_by_name || "")}・${fmtDateTime(jstDateTime(r.updated_at))}</p>
            </article>`).join("")}
          ${missing.map((p) => `
            <article class="report is-missing">
              <span class="stage-pill">${stageLabel(p)}</span>
              <h3><a href="#/projects/${p.id}">${esc(p.name)}</a></h3>
              <p class="muted small">まだ記入されていません。</p>
            </article>`).join("")}
        </div>` : `<p class="muted">進捗共有はありません。</p>`}
      </section>

      <section class="card">
        <div class="section-head"><h2>📝 メモ <small class="muted">定例で話したこと・決まったこと</small></h2>${copyButton("memo")}</div>
        ${canEdit ? `<textarea name="memo" rows="6" maxlength="10000" placeholder="・〇〇PJは来週ヒアリング&#10;・次回の定例は〇日">${esc(m.memo)}</textarea>`
          : m.memo ? `<p class="pre">${esc(m.memo)}</p>` : `<p class="muted">メモはありません。</p>`}
      </section>

      <section class="card">
        <div class="section-head"><h2>🎉 定例のあとのイベント</h2>${copyButton("event")}</div>
        <select name="event" aria-label="イベント" ${ro}>${Object.entries(EVENTS).map(([k, v]) => `<option value="${k}" ${k === m.event ? "selected" : ""}>${v}</option>`).join("")}</select>
      </section>

      <div class="form-actions sticky">
        <button type="button" id="copy-md" title="Notion用にコピー">📋<span class="hide-sm"> Notion用にコピー</span></button>
        ${canEdit ? `<button type="submit" data-save>保存する</button>
          ${m.is_open ? `<button type="submit" class="primary" data-end>定例を終わる</button>`
            : m.is_today ? `<button type="button" data-reopen>↩ 定例を再開する</button>` : ""}` : ""}
      </div>
    </form>`;

  const form = el.querySelector("#teirei-form");
  guardForm(form);
  // 定例を始めた時刻から数える（前もって作った定例は、予定の開始時刻から）
  if (m.is_open) bindTimer(el, `teirei-${m.id}`, { since: Math.max(m.created_at, m.starts_at ? Date.parse(`${m.starts_at}:00+09:00`) : 0) });
  el.querySelector("#reload")?.addEventListener("click", () => renderTeirei(el, id));
  el.querySelector("[data-reopen]")?.addEventListener("click", (e) => busy(e.currentTarget, () => reopenTeirei(id, version))
    .then(() => { toast("定例を再開しました"); renderTeirei(el, id); }).catch(() => {}));

  // Notion用：まとめてコピー／項目ごとにコピー（編集中の内容を使う）
  const val = (k) => (form[k] ? form[k].value : m[k]) || "";
  const section = {
    notice: () => ["### 事務連絡", ...(val("notice").trim() ? mdText(val("notice")) : ["（なし）"]), ""],
    memo: () => ["### メモ", ...(val("memo").trim() ? mdText(val("memo")) : ["（なし）"]), ""],
    event: () => ["### 定例のあとのイベント", EVENTS[val("event")] || "なし", ""],
    report: (r) => [`#### ${r.project_name}（工程${r.current_stage}・${stageName(r)}）`, ...reportMd(r, "#####")],
  };
  bindCopyButtons(form, (key) => (key.startsWith("report-")
    ? section.report(reports.find((r) => `report-${r.project_id}` === key)) : section[key]()).join("\n"));
  el.querySelector("#copy-md").addEventListener("click", () => copyForNotion([
    `## ${fmtDate(m.held_on)}の定例`, "", ...section.notice(),
    "### 各PJの進捗共有", "", ...reports.flatMap(section.report), ...missing.flatMap((p) => [`#### ${p.name}`, "（未記入）", ""]),
    ...section.memo(), ...section.event(),
  ].join("\n")));

  // 最後にサーバーと一致していた内容（ぶつかったときにまとめるため）
  let base = { notice: m.notice, memo: m.memo, event: m.event };
  const send = (end) => api(`/api/dept-meetings/${id}`, {
    method: "PATCH", body: { notice: form.notice.value, memo: form.memo.value, event: form.event.value, end, version },
  }).catch(async (err) => {
    if (!/他の人が更新/.test(err.message)) throw err;
    // ほかの部門長・副部門長も同時に書いていた：相手の変更を取り込んで、もう一度保存する
    const { meeting: latest } = await api(`/api/dept-meetings/${id}`);
    let both = false;
    for (const k of ["notice", "memo"]) {
      const r = mergeText(base[k], form[k].value, latest[k]);
      form[k].value = r.text;
      both ||= r.both;
    }
    if (form.event.value === base.event) form.event.value = latest.event;
    base = { notice: latest.notice, memo: latest.memo, event: latest.event };
    version = latest.version;
    if (both) toast("ほかの人も同じ欄を書いていたので、両方の内容を残しました。確認してください");
    return api(`/api/dept-meetings/${id}`, {
      method: "PATCH", body: { notice: form.notice.value, memo: form.memo.value, event: form.event.value, end, version },
    });
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const end = "end" in e.submitter.dataset;
    busy(e.submitter, () => send(end)).then((res) => {
      base = { notice: form.notice.value, memo: form.memo.value, event: form.event.value };
      version = res.version;
      markSaved(form);
      toast(end ? "定例を終わりました。議事録を保存しました" : "議事録を保存しました");
      if (end) renderTeirei(el, id);
    }).catch(() => {});
  });
}

// ---------- 定例の議事録を書く：PJを選ぶ ----------
export async function renderReportList(el) {
  const { projects, todayMeetingId } = await api("/api/dept-reports");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/teirei">定例</a> / 進捗を書く</nav>
    <div class="page-heading left"><h1>📝 どのPJの進捗を書きますか？</h1>
      <p>${todayMeetingId ? "今日の定例" : "次の定例"}に向けて書きます</p></div>
    ${pjPicker(projects, (p) => pickItem({ href: `#/report/${p.id}`, name: p.name,
      note: p.written_at ? `<span class="tag">記入済み</span>` : "" }))}`;
}

// ---------- 定例の議事録を書く：進捗共有の記入 ----------
export async function renderReport(el, projectId) {
  const { project: p, meeting, report, previous } = await api(`/api/projects/${projectId}/dept-report`);
  let version = report.version;
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/teirei">定例</a> / <a href="#/report">進捗を書く</a> / ${esc(p.name)}</nav>
    <div class="page-heading left"><h1>📝 ${esc(p.name)}</h1>
      <p>${meeting ? `${fmtDate(meeting.held_on)}の定例` : "次の定例"}で共有する進捗です。いまの工程：${stageLabel(p)}・<a href="#/projects/${p.id}">PJ画面へ</a></p></div>
    <form class="card form" id="report">
      ${FIELDS.map(([k, label]) => `<div class="field"><div class="section-head"><strong>${label}</strong>${copyButton(k)}</div><textarea name="${k}" rows="4" maxlength="3000" aria-label="${label}">${esc(report[k])}</textarea></div>`).join("")}
      <div class="form-actions">
        ${report.updated_at ? `<span class="muted small">最終更新：${esc(report.updated_by_name || "")}・${fmtDateTime(jstDateTime(report.updated_at))}</span>` : ""}
        <button type="button" id="copy-md">📋 Notion用にコピー</button>
        <button class="primary">保存する</button></div>
    </form>
    ${previous ? `<details class="card"><summary>前回（${fmtDate(previous.held_on)}）の定例で共有した内容</summary>${paragraphs(previous)}</details>` : ""}`;
  const form = el.querySelector("#report");
  guardForm(form);
  bindCopyButtons(form, (k) => [`#### ${FIELDS.find(([key]) => key === k)[1]}`, ...mdText(form[k].value || "（なし）")].join("\n"));
  el.querySelector("#copy-md").addEventListener("click", () =>
    copyForNotion([`### ${p.name} 進捗共有（工程${p.current_stage}・${stageName(p)}）`, "", ...reportMd(formData(form))].join("\n")));
  let base = { done: report.done, next: report.next, issues: report.issues };
  const send = () => api(`/api/projects/${projectId}/dept-report`, { method: "PUT", body: { ...formData(form), version } })
    .catch(async (err) => {
      if (!/他の人が更新/.test(err.message)) throw err;
      // 同じPJのメンバーも同時に書いていた：相手の変更を取り込んで、もう一度保存する
      const { report: latest } = await api(`/api/projects/${projectId}/dept-report`);
      let both = false;
      for (const [k] of FIELDS) {
        const r = mergeText(base[k], form[k].value, latest[k]);
        form[k].value = r.text;
        both ||= r.both;
      }
      base = { done: latest.done, next: latest.next, issues: latest.issues };
      version = latest.version;
      if (both) toast("同じPJのメンバーも同じ欄を書いていたので、両方の内容を残しました。確認してください");
      return api(`/api/projects/${projectId}/dept-report`, { method: "PUT", body: { ...formData(form), version } });
    });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, send)
      .then((res) => {
        base = formData(form);
        version = res.version;
        markSaved(form);
        toast("保存しました");
      }).catch(() => {});
  });
}

// ---------- 事務連絡を書く（部門長・副部門長） ----------
export async function renderTeireiNotice(el) {
  const day = hashQuery().get("day");
  const d = await api(`/api/dept-notice${day ? `?day=${encodeURIComponent(day)}` : ""}`);
  let version = d.version;
  const where = d.target === "meeting" ? `${fmtDate(d.day)}の定例の議事録に直接書きます`
    : d.target === "day" ? `${fmtDate(d.day)}の定例に向けて書いておきます（その日の定例を始めると、議事録の事務連絡に移ります）`
    : "次の定例に入ります（「定例を始める」を押すと、その定例の議事録に移ります）";
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/teirei">定例</a> / 事務連絡を書く</nav>
    <div class="page-heading left"><h1>📢 ${d.day ? `${fmtDate(d.day)}の定例の` : ""}事務連絡</h1><p>${where}</p></div>
    <form class="card form" id="notice-form">
      <textarea name="notice" rows="8" maxlength="5000" aria-label="事務連絡" placeholder="部門長・副部門長からの連絡事項">${esc(d.notice)}</textarea>
      <div class="form-actions">
        ${d.updated_at ? `<span class="muted small">最終更新：${esc(d.updated_by_name)}・${fmtDateTime(jstDateTime(d.updated_at))}</span>` : ""}
        ${d.target === "meeting" ? `<a class="button" href="#/teirei/${d.meeting.id}">この定例を開く</a>` : ""}
        <button class="primary">保存する</button>
      </div>
    </form>`;
  const noticeForm = el.querySelector("#notice-form");
  guardForm(noticeForm);
  noticeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => api("/api/dept-notice", { method: "PUT", body: { notice: e.target.notice.value, version, target: d.target, day: d.target === "next" ? null : d.day } }))
      .then((res) => { version = res.version; markSaved(noticeForm); toast("事務連絡を保存しました"); }).catch(() => {});
  });
}

// ---------- 定例を予定する（部門長・副部門長）：毎週◯曜日の◯時、この日からこの日まで ----------
export async function renderTeireiSchedule(el) {
  const { today, schedules, upcoming } = await api("/api/dept-schedules");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/teirei">定例</a> / 定例を予定する</nav>
    <div class="page-heading left"><h1>🗓 定例を予定する</h1></div>
    <form class="card form" id="schedule-form">
      <div class="grid-2">
        <label>曜日<select name="weekday">${WEEK_JA.map((w, i) => `<option value="${i}" ${i === 1 ? "selected" : ""}>${w}曜日</option>`).join("")}</select></label>
        <label>時刻<input name="time" type="time" required value="22:00"></label>
        <label>この日から<input name="from_date" type="date" required value="${today}"></label>
        <label>この日まで<input name="to_date" type="date" required value="${addDays(today, 90)}"></label>
      </div>
      <div class="form-actions"><button class="primary">予定に追加</button></div>
    </form>
    <h2>登録している予定</h2>
    ${schedules.length ? `<ul class="list">${schedules.map((x) => `
      <li class="list-item"><span><strong>毎週${WEEK_JA[x.weekday]}曜 ${esc(x.time)}</strong>
        <span class="muted small">${fmtDate(x.from_date)}〜${fmtDate(x.to_date)}${x.to_date < today ? "（終了）" : ""}</span></span>
        <div class="meta"><button class="link-btn danger" data-del="${x.id}">削除</button></div></li>`).join("")}</ul>`
      : `<p class="muted">まだ予定はありません。</p>`}
    ${upcoming.length ? `<p class="small" style="margin-top:12px"><strong>次の定例：</strong>${upcoming.map((x) => slotLabel(x.starts_at)).join("、")}</p>` : ""}`;
  el.querySelector("#schedule-form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => api("/api/dept-schedules", { method: "POST", body: formData(e.target) }))
      .then((res) => { toast(`${res.label}の定例を予定しました`); renderTeireiSchedule(el); }).catch(() => {});
  });
  el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("この定例の予定を削除しますか？（作成済みの定例の議事録は消えません）")) return;
    busy(b, () => api(`/api/dept-schedules/${b.dataset.del}`, { method: "DELETE", body: {} })).then(() => renderTeireiSchedule(el)).catch(() => {});
  }));
}

// 終えた今日の定例を、もう一度進行中にする（終えたあとに書かれた進捗共有・事務連絡もまとめ直す）
async function reopenTeirei(id, version) {
  const v = version ?? (await api(`/api/dept-meetings/${id}`)).meeting.version;
  return api(`/api/dept-meetings/${id}`, { method: "PATCH", body: { reopen: true, version: v } });
}
