// マイページ：自分のプロフィール（担当しているタスクと、参加しているPJ）
import { api, esc, avatar, busy, dueBadge, state, stageStepper, TASK_STATUS } from "../lib.js";

export async function renderProfile(el) {
  const [{ open }, { projects }] = await Promise.all([api("/api/my-tasks"), api("/api/projects")]);
  const me = state.me;
  const mine = projects.filter((p) => p.isMine);
  const active = mine.filter((p) => p.status === "active");
  const done = mine.filter((p) => p.status === "done");
  const stageName = (p) => state.types[p.type]?.stages.find((s) => s.no === p.current_stage)?.name || "";
  const roles = [me.isHead && "部門長", me.isRep && "代表", me.isAdmin && !me.isHead && "管理者"].filter(Boolean);
  const card = (p) => `
    <a class="card pj-card" href="#/projects/${p.id}">
      <span class="stage-pill">${p.status === "done" ? "完了" : `工程${p.current_stage}・${esc(stageName(p))}`}</span>
      <h3>${esc(p.name)}</h3>
      ${p.status === "active" ? stageStepper(p, p.stages || [], { compact: true }) : ""}
    </a>`;
  el.innerHTML = `
    <section class="card profile-head">
      ${avatar(me, "xl")}
      <div>
        <h1>${esc(me.name)}</h1>
        ${roles.length ? `<p>${roles.map((r) => `<span class="role-tag">${r}</span>`).join("")}</p>` : ""}
      </div>
    </section>
    <div class="profile-stats">
      <a href="#profile-tasks"><strong>${open.length}</strong><small>担当中のタスク</small></a>
      <a href="#profile-projects"><strong>${active.length}</strong><small>参加中のPJ</small></a>
    </div>

    <h2 id="profile-tasks">✅ 担当中のタスク</h2>
    ${open.length ? `<ul class="list">${open.map((t) => `
      <li class="list-item">
        <label class="check"><input type="checkbox" data-task="${t.id}">
          <span>${esc(t.title)}<small>${TASK_STATUS[t.status]}</small></span></label>
        <div class="meta"><a href="#/projects/${t.project_id}?tab=tasks">${esc(t.project_name)}</a>${dueBadge(t.due_date)}</div>
      </li>`).join("")}</ul>` : `<div class="empty"><p>担当中のタスクはありません。</p></div>`}
    <p class="profile-more"><a href="#/my-tasks">タスクを追加する・完了したタスクを見る ›</a></p>

    <h2 id="profile-projects">📁 参加中のPJ</h2>
    ${active.length ? `<div class="card-grid">${active.map(card).join("")}</div>` : `<div class="empty"><p>参加中のPJはありません。</p></div>`}
    ${done.length ? `<details class="fold profile-done"><summary>完了したPJ（${done.length}）</summary>
      <div class="card-grid">${done.map(card).join("")}</div></details>` : ""}

    <p class="profile-logout"><a class="button small" href="/auth/logout">ログアウト</a></p>`;
  // ページ内リンク（#profile-…）はハッシュの画面切り替えにしないで、その場所へスクロールする
  el.querySelectorAll('.profile-stats a').forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    el.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  el.querySelectorAll("[data-task]").forEach((cb) => cb.addEventListener("change", () =>
    busy(cb, () => api(`/api/tasks/${cb.dataset.task}`, { method: "PATCH", body: { status: cb.checked ? "done" : "todo" } }))
      .then(() => renderProfile(el)).catch(() => (cb.checked = !cb.checked))));
}
