// 管理者メニュー：管理者ができることの一覧、人事（PJの配属）、ログイン状況、管理者の追加・削除
import { api, esc, state, avatar, busy, toast, fmtDateTime, jstDateTime, confirmDialog } from "../lib.js";

export async function renderAdmin(el) {
  if (!state.me.isAdmin) throw new Error("管理者メニューは管理者だけが使えます");
  const data = await api("/api/admin");
  const adminIds = new Set([...data.heads, ...data.fixedAdmins].map((u) => u.id).concat(data.admins.map((a) => a.user_id)));
  const candidates = data.users.filter((u) => !adminIds.has(u.id));
  const person = (u) => `<span class="person">${avatar(u)} ${esc(u.name)}</span>`;
  const ok = (v, label) => `<li>${v ? "✅" : "⚠️"} ${label}${v ? "" : "：未設定"}</li>`;

  el.innerHTML = `
    <div class="page-heading"><h1>🛠️ 管理者メニュー</h1></div>

    <details class="section admin-help">
      <summary><strong>管理者ができること</strong></summary>
      <div class="card-grid admin-grid">
        <a class="card admin-card" href="#/seeds">
          <strong>🌱 PJ決め</strong>
          <ul>
            <li>PJ決めの作成・締め切り・決めるPJの数の設定</li>
            <li>種の出どころ（ニュース勉強会など）の設定、どの種でも編集・削除</li>
            <li>締め切り前でも開票結果を見る</li>
            <li><strong>決まった種を「正式なPJにする」</strong>（種のカードのボタンから。メンバーもここで決める）</li>
          </ul>
        </a>
        <a class="card admin-card" href="#/projects">
          <strong>📁 PJ</strong>
          <ul>
            <li>メンバーでないPJも編集できる（工程・タスク・MTG・議事録）</li>
            <li>PJのアーカイブ（PJの「編集」→ 状態）</li>
            <li>「ミーティングを始める」に全PJが出る</li>
          </ul>
        </a>
        <a class="card admin-card" href="#/hearings">
          <strong>🤝 外部ヒアリング</strong>
          <ul>
            <li>承認は、管理者ではなく部門長 → 代表が行う</li>
            <li>部門長・代表は設定ファイル（wrangler.toml）で決まっている</li>
            <li>見られるのは、政策立案部門のロールを持つ人・代表・管理者だけ</li>
          </ul>
        </a>
      </div>
    </details>

    ${staffingSection(data, person)}
    ${loginSection(data, person, adminIds)}

    <section class="section">
      <h2>管理者</h2>
      <ul class="list">
        ${data.heads.map((u) => `<li class="list-item">${person(u)}<div class="meta"><span class="tag">部門長（固定）</span></div></li>`).join("")}
        ${data.fixedAdmins.map((u) => `<li class="list-item">${person(u)}<div class="meta"><span class="tag">固定</span></div></li>`).join("")}
        ${data.admins.map((a) => `
          <li class="list-item">${person({ name: a.name, avatar: a.avatar })}
            <div class="meta"><span class="muted small">${a.added_by_name ? `${esc(a.added_by_name)}が追加` : ""}</span>
              <button class="link-btn danger" data-remove="${esc(a.user_id)}">${a.user_id === state.me.id ? "自分を外す" : "外す"}</button></div></li>`).join("")}
      </ul>
      <form class="card form inline-form" id="add-admin" style="margin-top:12px">
        <strong>管理者を追加</strong>
        <select name="user_id" required>
          <option value="">メンバーを選ぶ</option>
          ${candidates.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join("")}
        </select>
        <button class="primary">追加する</button>
      </form>
      <p class="muted small">選べるのは、このツールに一度ログインした人と、希望PJアンケートで投票した人です。部門長・副部門長など設定ファイルで決まっている管理者（「固定」と表示）は、ここでは外せません。</p>
    </section>

    <div class="two-col">
      <section class="section">
        <h2>ヒアリングの承認者（設定ファイルで固定）</h2>
        <ul class="list">
          ${data.heads.map((u) => `<li class="list-item">${person(u)}<span class="tag">部門長：一次確認</span></li>`).join("")}
          ${data.reps.map((u) => `<li class="list-item">${person(u)}<span class="tag">代表：最終確認</span></li>`).join("")}
        </ul>
      </section>
      <section class="section">
        <h2>設定の状態</h2>
        <ul class="settings-list">
          <li>✅ ログイン：学生チームのDiscordサーバー（${esc(data.settings.guild)}）のメンバー全員</li>
          ${ok(data.settings.deptRole, "政策立案部門のロール（外部ヒアリングを見られる人の判定）")}
          ${ok(data.settings.bot, "Bot（DM通知）")}
          ${ok(data.settings.forum, "渉外フォーラム（ヒアリングのスレッド作成）")}
        </ul>
        ${data.archived.length ? `<h3 class="small">アーカイブしたPJ</h3><ul class="settings-list">${data.archived.map((p) =>
          `<li><a href="#/projects/${p.id}">${esc(p.name)}</a>（PJの「編集」→ 状態で戻せます）</li>`).join("")}</ul>` : ""}
      </section>
    </div>`;

  bindStaffing(el, data, () => renderAdmin(el));
  el.querySelector("#add-admin").addEventListener("submit", (e) => {
    e.preventDefault();
    const userId = e.target.user_id.value;
    busy(e.submitter, () => api("/api/admin/admins", { method: "POST", body: { user_id: userId } }))
      .then(() => { toast("管理者に追加しました"); renderAdmin(el); }).catch(() => {});
  });
  el.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
    const self = b.dataset.remove === state.me.id;
    if (!await confirmDialog(self ? "自分を管理者から外しますか？このページは使えなくなります。" : "この人を管理者から外しますか？")) return;
    busy(b, () => api("/api/admin/admins/remove", { method: "POST", body: { user_id: b.dataset.remove } }))
      .then(() => {
        toast("管理者から外しました");
        if (!self) return renderAdmin(el);
        location.hash = "#/";
        location.reload(); // 権限が変わったので読み込み直す
      }).catch(() => {});
  }));
}

// 人事：どのPJに誰が配属されているか（進行中・完了。アーカイブは除く）と、進行中のPJに入っていない人
function staffingSection({ projects, users }, person) {
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  const stageName = (p) => state.types[p.type]?.stages.find((s) => s.no === p.current_stage)?.name || "";
  const active = projects.filter((p) => p.status === "active");
  const assigned = new Set(active.flatMap((p) => p.members));
  const logged = users.filter((u) => u.last_login);
  const unassigned = logged.filter((u) => !assigned.has(u.id));
  const option = (v, l) => `<option value="${esc(v)}">${esc(l)}</option>`;
  return `
    <section class="section">
      <h2>🧩 人事（PJの配属）</h2>
      ${active.length ? `<details class="add-box staff-move-box"><summary class="button small primary">🔀 異動</summary>
      <form class="card form staff-move" id="staff-move">
        <select name="user_id" required aria-label="誰を"><option value="">誰を</option>${logged.map((u) => option(u.id, u.name)).join("")}</select>
        <select name="from_project_id" aria-label="どこから"><option value="">どこから（なし＝追加だけ）</option></select>
        <select name="to_project_id" aria-label="どこへ"><option value="">どこへ（なし＝外すだけ）</option>${active.map((p) => option(p.id, p.name)).join("")}</select>
        <button class="primary">異動する</button>
      </form></details>` : ""}
      ${projects.length ? `<div class="table-wrap"><table class="staff-table">
        <thead><tr><th>PJ</th><th>工程</th><th>メンバー</th></tr></thead>
        <tbody>${projects.map((p) => `
          <tr class="${p.status === "done" ? "is-done" : ""}">
            <td><a href="#/projects/${p.id}">${esc(p.name)}</a></td>
            <td class="small">${p.status === "done" ? "完了" : `工程${p.current_stage}・${esc(stageName(p))}`}</td>
            <td><span class="staff-members">${p.members.map((id) => `<span class="staff-chip">${person(byId[id] || { name: "（不明）" })}
                ${p.status === "active" ? `<button type="button" class="link-btn danger" data-unassign="${p.id}" data-user="${esc(id)}" aria-label="${esc(byId[id]?.name || "")}を外す">×</button>` : ""}</span>`).join("")
                || `<span class="muted small">まだいません</span>`}
              ${p.status === "active" ? `<select class="staff-add" data-assign="${p.id}" aria-label="メンバーを追加">
                <option value="">＋ 追加</option>${logged.filter((u) => !p.members.includes(u.id)).map((u) => option(u.id, u.name)).join("")}</select>` : ""}</span>
              <span class="muted small">${p.members.length}人</span></td>
          </tr>`).join("")}</tbody></table></div>`
        : `<p class="muted">まだPJはありません。</p>`}
      <p class="small" style="margin-top:12px"><strong>進行中のPJに入っていない人</strong>（ログイン済み・${unassigned.length}人）</p>
      ${unassigned.length ? `<p class="staff-members">${unassigned.map(person).join("")}</p>` : `<p class="muted small">全員がどれかのPJに入っています。</p>`}
    </section>`;
}

// 人事：異動フォーム・表の「×」（外す）・「＋ 追加」
function bindStaffing(el, data, reload) {
  const move = (body, message) => api("/api/admin/staffing", { method: "POST", body }).then(() => { toast(message); reload(); });
  const name = (id) => data.users.find((u) => u.id === id)?.name || "";
  const pj = (id) => data.projects.find((p) => p.id === Number(id))?.name || "";
  const form = el.querySelector("#staff-move");
  if (form) {
    // 「誰を」を選ぶと、「どこから」にその人がいま入っているPJが出る
    form.user_id.addEventListener("change", () => {
      const mine = data.projects.filter((p) => p.status === "active" && p.members.includes(form.user_id.value));
      form.from_project_id.innerHTML = `<option value="">どこから（なし＝追加だけ）</option>${mine.map((p) =>
        `<option value="${p.id}">${esc(p.name)}</option>`).join("")}`;
      if (mine.length === 1) form.from_project_id.value = String(mine[0].id);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = e.submitter;
      const body = { user_id: form.user_id.value, from_project_id: form.from_project_id.value || null, to_project_id: form.to_project_id.value || null };
      if (!body.from_project_id && !body.to_project_id) return toast("異動元か異動先を選んでください", "error");
      const what = body.from_project_id && body.to_project_id ? `「${pj(body.from_project_id)}」から「${pj(body.to_project_id)}」へ異動`
        : body.to_project_id ? `「${pj(body.to_project_id)}」に追加` : `「${pj(body.from_project_id)}」から外す`;
      if (!await confirmDialog(`${name(body.user_id)}さんを${what}しますか？\n${name(body.user_id)}さんにお知らせが届きます。`, { ok: "異動して知らせる" })) return;
      const msg = body.from_project_id && body.to_project_id ? `${name(body.user_id)}さんを「${pj(body.to_project_id)}」に異動しました`
        : body.to_project_id ? `${name(body.user_id)}さんを「${pj(body.to_project_id)}」に追加しました` : `${name(body.user_id)}さんを「${pj(body.from_project_id)}」から外しました`;
      busy(button, () => move(body, msg)).catch(() => {});
    });
  }
  el.querySelectorAll("[data-unassign]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog(`${name(b.dataset.user)}さんを「${pj(b.dataset.unassign)}」のメンバーから外しますか？\n${name(b.dataset.user)}さんにお知らせが届きます。`)) return;
    busy(b, () => move({ user_id: b.dataset.user, from_project_id: b.dataset.unassign }, "メンバーから外しました")).catch(() => {});
  }));
  el.querySelectorAll("[data-assign]").forEach((s) => s.addEventListener("change", async () => {
    if (!s.value) return;
    if (!await confirmDialog(`${name(s.value)}さんを「${pj(s.dataset.assign)}」に追加しますか？\n${name(s.value)}さんにお知らせが届きます。`, { ok: "追加して知らせる" })) {
      s.value = "";
      return;
    }
    busy(s, () => move({ user_id: s.value, to_project_id: s.dataset.assign }, `${name(s.value)}さんを「${pj(s.dataset.assign)}」に追加しました`)).catch(() => {});
  }));
}

// ログイン状況：このツールにログインしたことがある人（最終ログイン順）と、アンケートで投票しただけの人
function loginSection({ users, heads, reps }, person, adminIds) {
  const headIds = new Set(heads.map((u) => u.id));
  const repIds = new Set(reps.map((u) => u.id));
  const logged = users.filter((u) => u.last_login).sort((a, b) => b.last_login - a.last_login);
  const notYet = users.filter((u) => !u.last_login);
  // 設定ファイルで決めている部門長・代表がまだログインしていなければ、ここでも知らせる
  const missingFixed = [...heads, ...reps].filter((u) => !u.last_login);
  const tags = (u) => [
    headIds.has(u.id) && "部門長", repIds.has(u.id) && "代表", adminIds.has(u.id) && !headIds.has(u.id) && "管理者",
    u.is_dept && "部門ロール",
  ].filter(Boolean).map((t) => `<span class="tag">${t}</span>`).join("");
  return `
    <section class="section">
      <h2>👥 ログイン状況 <small class="muted">ログイン済み ${logged.length}人</small></h2>
      ${logged.length ? `<ul class="list">${logged.map((u) => `
        <li class="list-item">${person(u)}<div class="meta">${tags(u)}<span class="muted small">最終ログイン ${fmtDateTime(jstDateTime(u.last_login))}</span></div></li>`).join("")}</ul>`
        : `<p class="muted">まだ誰もログインしていません。</p>`}
      ${missingFixed.length ? `<p class="caution small">⚠ まだログインしていない：${missingFixed.map((u) => esc(u.name)).join("、")}（部門長・代表の設定）</p>` : ""}
      ${notYet.length ? `<details class="section" style="margin-top:12px"><summary class="small">希望PJアンケートで投票しただけで、まだログインしていない人（${notYet.length}人）</summary>
        <p class="staff-members" style="margin-top:8px">${notYet.map(person).join("")}</p></details>` : ""}
      <p class="muted small">「部門ロール」は、ログインした時点で政策立案部門のロールを持っていた人です（外部ヒアリングを見られる）。</p>
    </section>`;
}
