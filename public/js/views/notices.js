// 「確認する」の2画面：お知らせ／自分のタスク
import { api, esc, busy, dueBadge, fmtDateTime, jstDateTime, TASK_STATUS, state, doneTasksToggle, bindDoneTasksToggle, toast, formData } from "../lib.js";

export async function renderNotices(el) {
  const { notices } = await api("/api/notices");
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/check">確認する</a> / お知らせ</nav>
    <div class="page-heading left"><h1>🔔 お知らせ</h1>
      <p><a class="button small" href="#/my-tasks">✅ 自分のタスクを見る</a></p></div>
    ${notices.length ? `<ul class="list notices">${notices.map((n) => `
      <li class="list-item ${n.read_at ? "" : "is-unread"}">
        ${n.link ? `<a class="notice-link" href="${esc(n.link)}">` : "<span>"}${n.read_at ? "" : `<span class="unread-dot" aria-label="未読"></span>`}${esc(n.body.split("\n")[0])}
          <small class="muted">${fmtDateTime(jstDateTime(n.created_at))}</small>${n.link ? `<span class="notice-go" aria-hidden="true">›</span></a>` : "</span>"}
      </li>`).join("")}</ul>` : `<div class="empty"><p>お知らせはまだありません。</p></div>`}`;
  // 表示したら既読にする
  if (notices.some((n) => !n.read_at)) {
    api("/api/notices/read", { method: "POST", body: {} }).then(() => {
      const c = document.getElementById("bell-count");
      if (c) c.hidden = true;
    }).catch(() => {});
  }
}

let addOpen = false; // 追加欄を開いたままにする（続けて追加できるように）

export async function renderMyTasks(el) {
  const [{ open, done }, { projects }] = await Promise.all([api("/api/my-tasks"), api("/api/projects")]);
  // 追加できるのは、自分が参加している進行中のPJ（管理者はすべての進行中のPJ。参加中を先に）
  const targets = projects.filter((p) => p.status === "active" && (p.isMine || state.me.isAdmin))
    .sort((a, b) => b.isMine - a.isMine);
  const row = (t) => `
    <li class="list-item ${t.status === "done" ? "is-done" : ""}">
      <label class="check"><input type="checkbox" data-task="${t.id}" ${t.status === "done" ? "checked" : ""}>
        <span>${esc(t.title)}<small>${TASK_STATUS[t.status]}</small></span></label>
      <div class="meta"><a href="#/projects/${t.project_id}?tab=tasks">${esc(t.project_name)}</a>${dueBadge(t.due_date, t.status === "done")}</div>
    </li>`;
  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/check">確認する</a> / 自分のタスク</nav>
    <div class="page-heading left"><h1>✅ 自分のタスク</h1></div>
    ${targets.length ? `<details class="add-box" ${addOpen ? "open" : ""}><summary class="button small">＋ タスクを追加</summary>
    <form class="card form task-form my-task-form" id="my-task-form">
      <input name="title" maxlength="120" placeholder="自分のタスクを追加（例：先行事例を3件集める）" required aria-label="タスク名">
      <select name="project_id" required aria-label="PJ">${targets.map((p) =>
        `<option value="${p.id}">${esc(p.name)}${p.isMine ? "" : "（参加していないPJ）"}</option>`).join("")}</select>
      <input name="due_date" type="date" aria-label="期限">
      <button class="primary">追加</button>
    </form></details>` : ""}
    <div class="board-tools">${doneTasksToggle(done.length)}</div>
    ${open.length ? `<ul class="list">${open.map(row).join("")}</ul>` : `<div class="empty"><p>担当中のタスクはありません。</p></div>`}
    ${state.showDoneTasks && done.length ? `<h2 class="small" style="margin-top:20px">最近完了したタスク</h2>
      <ul class="list">${done.map(row).join("")}</ul>` : ""}`;
  bindDoneTasksToggle(el, () => renderMyTasks(el));
  // 担当は自分、工程はそのPJのいまの工程で登録する
  el.querySelector(".add-box")?.addEventListener("toggle", (e) => { addOpen = e.target.open; });
  el.querySelector("#my-task-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const { project_id: pid, ...body } = formData(e.target);
    busy(e.submitter, () => api(`/api/projects/${pid}/tasks`, { method: "POST", body: { ...body, assignee_id: state.me.id } }))
      .then(() => { toast("タスクを追加しました"); renderMyTasks(el); }).catch(() => {});
  });
  el.querySelectorAll("[data-task]").forEach((cb) => cb.addEventListener("change", () =>
    busy(cb, () => api(`/api/tasks/${cb.dataset.task}`, { method: "PATCH", body: { status: cb.checked ? "done" : "todo" } }))
      .then(() => renderMyTasks(el)).catch(() => (cb.checked = !cb.checked))));
}
