// PJ一覧と、PJの作成・編集フォーム
import { api, esc, state, avatar, dueBadge, fmtDateTime, fmtDate, busy, formData, toast, WEEK, addDays, nextMonday, stageStepper, guardForm, markSaved, bindMemberFilter } from "../lib.js";

export async function renderProjects(el) {
  const { projects } = await api("/api/projects");
  // 参加中のPJがない人（部門長など）は、進行中すべてから見せる
  let filter = projects.some((p) => p.isMine) ? "mine" : "active";
  const stageName = (p) => state.types[p.type]?.stages.find((s) => s.no === p.current_stage)?.name || "";

  const draw = () => {
    const list = projects.filter((p) => filter === "all" || (filter === "mine" ? p.isMine : p.status === filter));
    el.innerHTML = `
      <div class="page-heading"><h1>PJ一覧</h1></div>
      <div class="board-tools">
        <div class="tabs" role="tablist">
          ${[["mine", "参加中"], ["active", "進行中すべて"], ["done", "完了"], ["all", "すべて"]].map(([k, l]) =>
            `<button role="tab" aria-selected="${filter === k}" data-filter="${k}">${l}</button>`).join("")}
        </div>
        <a class="button primary" href="#/projects/new">＋ PJを作る</a>
      </div>
      ${list.length ? `<div class="card-grid">${list.map((p) => `
        <a class="card pj-card" href="#/projects/${p.id}">
          <span class="stage-pill">${p.status === "done" ? "完了" : `工程${p.current_stage}・${esc(stageName(p))}`}</span>
          ${p.status === "active" && p.completion_requested_at ? `<span class="due is-soon">完了の承認待ち</span>` : ""}
          <h3>${esc(p.name)}</h3>
          ${stageStepper(p, p.stages || [], { compact: true })}
        </a>`).join("")}</div>`
        : `<div class="empty"><p>該当するPJはありません。</p></div>`}`;
    el.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
      filter = b.dataset.filter;
      draw();
    }));
  };
  draw();
}

export async function renderProjectForm(el, id) {
  const data = id ? await api(`/api/projects/${id}`) : null;
  if (data && !data.canEdit) throw new Error("このPJを編集できるのは、PJメンバーと管理者です");
  const p = data?.project || {
    name: "", description: "", doc_url: "", memo_doc_url: "", script_doc_url: "", share_doc_url: "", type: "teigen", start_date: nextMonday(), presentation_date: "",
    meeting_mode: "regular", meeting_weekdays: "", meeting_time: "21:00", meeting_interval: 1, meeting_duration: 60,
    meeting_place: "", status: "active",
  };
  const memberIds = new Set(data ? data.members.map((m) => m.id) : [state.me.id]);
  const weekdays = new Set((p.meeting_weekdays || "").split(",").filter(Boolean));

  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/projects">PJ一覧</a> / ${id ? `<a href="#/projects/${id}">${esc(p.name)}</a> / 編集` : "PJを作る"}</nav>
    <div class="page-heading left"><h1>${id ? "PJを編集" : "PJを作る"}</h1>
      <p>${id ? "" : "PJ決め（工程0）が終わったら作ります。作ると工程1「課題・現状リサーチ」から始まります。"}</p></div>
    <form class="card form" id="pj-form">
      <label>PJ名 <span class="req">必須</span>
        <input name="name" maxlength="60" required value="${esc(p.name)}" placeholder="例：なぜ地熱発電の推進は進まないのか">
      </label>
      ${Object.keys(state.types).length > 1 ? `<label>PJの型
        <select name="type" ${id ? "disabled" : ""}>
          ${Object.entries(state.types).map(([k, t]) => `<option value="${k}" ${p.type === k ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
        </select>
      </label>` : `<input type="hidden" name="type" value="${esc(p.type)}">`}
      <label>概要（任意）
        <textarea name="description" maxlength="400" rows="2">${esc(p.description)}</textarea>
      </label>
      <fieldset class="doc-urls">
        <legend>Googleドキュメント（任意・あとから登録できます）</legend>
        <label>🔎 リサーチドキュメント <small class="muted">調べたことをメンバーがタブを分けて書き残す。議事録の画面に表示されます</small>
          <input name="memo_doc_url" type="url" value="${esc(p.memo_doc_url)}" placeholder="https://docs.google.com/document/...">
        </label>
        <label>📊 課題共有の資料 <small class="muted">政調MTGの課題共有で使うもの。「発表する」で課題共有を選ぶと表示されます</small>
          <input name="share_doc_url" type="url" value="${esc(p.share_doc_url)}" placeholder="https://docs.google.com/...">
        </label>
        <label>📄 政調用の本文 <small class="muted">政策提言として形を整えたもの</small>
          <input name="doc_url" type="url" value="${esc(p.doc_url)}" placeholder="https://docs.google.com/document/...">
        </label>
        <label>🎤 政調用の台本
          <input name="script_doc_url" type="url" value="${esc(p.script_doc_url)}" placeholder="https://docs.google.com/document/...">
        </label>
      </fieldset>
      <div class="grid-2">
        <label>開始日（1週目の初日） <span class="req">必須</span>
          <input name="start_date" type="date" required value="${esc(p.start_date)}">
        </label>
        <label>政調での最終発表日（決まったら）
          <input name="presentation_date" type="date" value="${esc(p.presentation_date || "")}">
          <small class="muted">未定のあいだは8週目の終わりとして各工程の期限を出します。</small>
        </label>
      </div>
      <p class="muted small" id="schedule-preview"></p>

      <fieldset>
        <legend>メンバー <span class="req">必須</span></legend>
        <div class="member-picker">
          ${state.users.map((u) => `
            <label class="chip-check"><input type="checkbox" name="member" value="${esc(u.id)}" ${memberIds.has(u.id) ? "checked" : ""}>
              ${avatar(u)}<span>${esc(u.name)}</span></label>`).join("")}
        </div>
        <small class="muted">一覧に出るのは、このツールに一度ログインした人と、希望PJアンケートで投票した人です。</small>
      </fieldset>

      <fieldset>
        <legend>MTGの進め方</legend>
        <div class="segmented">
          <label><input type="radio" name="meeting_mode" value="regular" ${p.meeting_mode === "regular" ? "checked" : ""}> 定例（曜日・時刻を決める）</label>
          <label><input type="radio" name="meeting_mode" value="adhoc" ${p.meeting_mode === "adhoc" ? "checked" : ""}> 毎回決める</label>
        </div>
        <div id="regular-fields">
          <div class="weekday-picker">
            ${WEEK.map((w, i) => `<label class="chip-check"><input type="checkbox" name="weekday" value="${i}" ${weekdays.has(String(i)) ? "checked" : ""}><span>${w}</span></label>`).join("")}
          </div>
          <div class="grid-3">
            <label>時刻<input name="meeting_time" type="time" value="${esc(p.meeting_time || "21:00")}"></label>
            <label>頻度
              <select name="meeting_interval">
                <option value="1" ${p.meeting_interval == 1 ? "selected" : ""}>毎週</option>
                <option value="2" ${p.meeting_interval == 2 ? "selected" : ""}>隔週</option>
              </select>
            </label>
            <label>長さ（分）<input name="meeting_duration" type="number" min="15" max="480" step="15" value="${esc(p.meeting_duration)}"></label>
          </div>
          <small class="muted">週2回なら曜日を2つ選びます。</small>
        </div>
        <p class="muted small" id="adhoc-note">MTGが終わって議事録を書くと「次回の日程を決める」画面が出ます。日程が未定のままなら、PJメンバーにリマインドが届きます。</p>
        <label>場所・URL（任意）<input name="meeting_place" maxlength="200" value="${esc(p.meeting_place)}" placeholder="Discordのボイスチャンネルなど"></label>
      </fieldset>

      ${id ? `<label>状態
        <select name="status">
          <option value="active" ${p.status === "active" ? "selected" : ""}>進行中</option>
          <option value="done" ${p.status === "done" ? "selected" : ""}>完了</option>
          ${state.me.isAdmin ? `<option value="archived" ${p.status === "archived" ? "selected" : ""}>アーカイブ（一覧から隠す）</option>` : ""}
        </select></label>` : ""}

      <div class="form-actions">
        <a class="button" href="${id ? `#/projects/${id}` : "#/projects"}">キャンセル</a>
        <button class="primary" type="submit">${id ? "保存する" : "作成する"}</button>
      </div>
    </form>`;

  const form = el.querySelector("#pj-form");
  const sync = () => {
    const regular = form.meeting_mode.value === "regular";
    form.querySelector("#regular-fields").hidden = !regular;
    form.querySelector("#adhoc-note").hidden = regular;
    const start = form.start_date.value;
    if (start) {
      const pres = form.presentation_date.value || addDays(start, 55);
      form.querySelector("#schedule-preview").textContent =
        `目安：課題リサーチ〜${fmtDate(addDays(start, 9))}／課題共有 ${fmtDate(addDays(start, 13))}／施策考案〜${fmtDate(addDays(start, 34))}／最終発表 ${fmtDate(pres)}${form.presentation_date.value ? "" : "（仮）"}／最終提出〜${fmtDate(addDays(pres, 28))}`;
    }
  };
  form.addEventListener("change", sync);
  sync();
  guardForm(form);
  bindMemberFilter(form);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = formData(form);
    const body = {
      ...f,
      meeting_weekdays: [...form.querySelectorAll("[name=weekday]:checked")].map((c) => c.value),
      member_ids: [...form.querySelectorAll("[name=member]:checked")].map((c) => c.value),
      version: p.version,
    };
    if (!body.member_ids.length) return toast("メンバーを1人以上選んでください", "error");
    busy(e.submitter, async () => {
      const res = await api(id ? `/api/projects/${id}` : "/api/projects", { method: id ? "PUT" : "POST", body });
      markSaved(form);
      toast(id ? "保存しました" : "PJを作成しました");
      location.hash = `#/projects/${id || res.id}`;
    }).catch(() => {});
  });
}
