// PJ決め（工程0）：政策の種 → 投票（ランク付け）→ 開票（RCV）→ PJ化と人員の割り振り
import { api, esc, state, avatar, fmtDate, fmtDateTime, jstDateTime, busy, toast, formData, hashQuery, nextMonday, confirmDialog, bindMemberFilter } from "../lib.js";

const CATEGORIES = { news: "ニュース勉強会", seicho: "政調ピックアップ", bucho: "部門長セレクト" };
const AI_CAUTION = `<p class="caution">⚠ AIで調べた情報は、必ず一次出典を確認してください。出典のない数字は使わない。AIが生成した文章を、自分のソースとして引用しない。</p>`;

// #/seeds：最新の募集回を開く（なければ一覧）
export async function renderRounds(el) {
  const { rounds, surveyLinkAvailable } = await api("/api/rounds");
  const current = rounds.find((r) => !r.archived);
  if (current && !hashQuery().get("all")) {
    location.replace(`#/seeds/${current.id}`);
    return;
  }
  el.innerHTML = `
    <div class="page-heading"><h1>PJ決め</h1>
      <p>政策の種を出し合い、関わりたい順に投票して、部門で取り組むPJを決めます。</p></div>
    ${state.me.isAdmin ? roundForm(null, surveyLinkAvailable) : ""}
    ${rounds.length ? `<ul class="list">${rounds.map((r) => `
      <li class="list-item">
        <a href="#/seeds/${r.id}"><strong>${esc(r.title)}</strong></a>
        ${r.source === "survey" ? `<span class="tag">希望PJアンケートと連動</span>` : ""}
        <div class="meta"><span>種 ${r.seed_count}件・投票 ${r.voter_count}人</span>
          <span class="due ${r.closed ? "" : "is-soon"}">${r.closed ? "締め切り済み" : r.deadline ? `${fmtDateTime(r.deadline)} 締め切り` : "受付中"}</span>
          ${r.archived ? `<span class="tag">アーカイブ</span>` : ""}</div>
      </li>`).join("")}</ul>`
      : `<div class="empty"><p>まだPJ決めがありません。${state.me.isAdmin ? "上のフォームから作成してください。" : "管理者が作成すると、ここに表示されます。"}</p></div>`}`;
  bindRoundForm(el, null);
}

function roundForm(round, surveyLinkAvailable = false) {
  const linked = round?.source === "survey";
  return `
    <details class="card" ${round ? "" : "open"}>
      <summary><strong>${round ? "PJ決めの設定（管理者）" : "＋ 新しいPJ決めを作る（管理者）"}</strong></summary>
      <form class="form" id="round-form" style="margin-top:12px">
        <label>名前<input name="title" maxlength="60" required value="${esc(round?.title || "")}" placeholder="例：2026年秋のPJ決め"></label>
        <div class="grid-2">
          <label>締め切り（空なら締め切りなし）<input name="deadline" type="datetime-local" value="${esc(round?.deadline || "")}" ${linked ? "disabled" : ""}>
            ${linked ? `<small class="muted">希望PJアンケートの締め切りに自動で合わせます</small>` : ""}</label>
          <label>決めるPJの数<input name="seats" type="number" min="1" max="10" value="${esc(round?.seats ?? 3)}"></label>
        </div>
        ${round ? `<label class="check"><input type="checkbox" name="archived" ${round.archived ? "checked" : ""}> アーカイブする（PJ決めのトップに出さない）</label>` : ""}
        ${!round && surveyLinkAvailable ? `<label class="check"><input type="checkbox" name="link_survey">
          <span>希望PJアンケートと連動する<small>アンケートの選択肢・投票・締め切りを自動で映します。投票はアンケートで行います</small></span></label>` : ""}
        <div class="form-actions"><button class="primary">${round ? "保存する" : "作成する"}</button></div>
      </form>
    </details>`;
}

function bindRoundForm(el, round) {
  const form = el.querySelector("#round-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const body = { ...formData(form), archived: form.archived?.checked, link_survey: form.link_survey?.checked };
    busy(e.submitter, () => api(round ? `/api/rounds/${round.id}` : "/api/rounds", { method: round ? "PUT" : "POST", body }))
      .then((res) => {
        toast("保存しました");
        location.hash = `#/seeds/${round ? round.id : res.id}?t=${Date.now()}`;
      }).catch(() => {});
  });
}

export async function renderRound(el, id) {
  const data = await api(`/api/rounds/${id}`);
  const { round } = data;
  const tab = hashQuery().get("tab") || "seeds";
  const canSeeResults = round.closed || state.me.isAdmin;
  const linked = round.source === "survey";
  const tabs = [["seeds", `政策の種（${data.seeds.length}）`]];
  if (!linked) tabs.push(["ballot", `自分の投票（${data.myBallot.length}）`]);
  if (canSeeResults) tabs.push(["results", "開票・PJ化"]);

  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/seeds?all=1">PJ決め</a> / ${esc(round.title)}</nav>
    <div class="page-heading left">
      <h1>${esc(round.title)}</h1>
      <p>${round.closed ? "締め切りました" : round.deadline ? `${fmtDateTime(round.deadline)} 締め切り` : "受付中"}・投票 ${data.respondents}人</p>
    </div>
    ${linked ? `<div class="notice survey-link">
      <span>🔗 <strong>希望PJアンケートと連動</strong>中${round.closed ? "" : "（投票はアンケートで）"}</span>
      ${!round.closed && data.surveyUrl ? `<a class="button small primary" href="${esc(data.surveyUrl)}" target="_blank" rel="noopener">希望PJアンケートを開く</a>` : ""}</div>` : ""}
    <div class="tabs" role="tablist">
      ${tabs.map(([k, l]) => `<a role="tab" class="tab" aria-selected="${tab === k}" href="#/seeds/${id}?tab=${k}">${l}</a>`).join("")}
    </div>
    <div id="tab-body"></div>
    ${state.me.isAdmin && tab === "results" ? roundForm(round) : ""}`;
  bindRoundForm(el, round);
  const body = el.querySelector("#tab-body");
  const reload = () => renderRound(el, id);
  if (tab === "ballot" && !linked) renderBallot(body, data, reload);
  else if (tab === "results" && canSeeResults) await renderResults(body, data, reload);
  else renderSeeds(body, data, reload);
}

function categoryChips(cats) {
  return cats.map((c) => `<span class="src src-${c}">${CATEGORIES[c]}</span>`).join("");
}

function seedForm(seed) {
  return `
    <form class="form seed-form">
      ${AI_CAUTION}
      <label>タイトル <span class="req">必須</span>
        <input name="title" maxlength="60" required value="${esc(seed?.title || "")}" placeholder="なぜ〇〇は△△なのか（例：なぜ地熱発電の推進は進まないのか）">
        <small class="muted">「なぜAはBなのか」の形にすると、課題と原因を掘り下げやすくなります。</small>
      </label>
      <label>説明（任意）<textarea name="description" maxlength="400" rows="3" placeholder="きっかけになったニュースや出来事、気になっている点">${esc(seed?.description || "")}</textarea></label>
      <label>分野（任意）<input name="tag" maxlength="20" value="${esc(seed?.tag || "")}" placeholder="例：教育、防災、AI"></label>
      ${state.me.isAdmin ? `<fieldset><legend>出どころ（管理者のみ）</legend><div class="member-picker">
        ${Object.entries(CATEGORIES).map(([k, l]) => `<label class="chip-check"><input type="checkbox" name="cat" value="${k}" ${seed?.categories.includes(k) ? "checked" : ""}><span>${l}</span></label>`).join("")}
      </div></fieldset>` : ""}
      <div class="form-actions">${seed ? `<button type="button" data-cancel>やめる</button>` : ""}<button class="primary">${seed ? "保存する" : "投稿する"}</button></div>
    </form>`;
}

function seedBody(form, seed) {
  return {
    ...formData(form),
    categories: [...form.querySelectorAll("[name=cat]:checked")].map((c) => c.value),
    version: seed?.version,
  };
}

// 種の絞り込み（投票して描き直しても保つ。画面を開いているあいだだけ）
let seedFilter = "all";

function renderSeeds(body, data, reload) {
  const { round, seeds, myBallot } = data;
  const ballot = new Set([...myBallot, ...data.myTied]);
  let filter = seedFilter;

  const draw = () => {
    const list = seeds.filter((s) => filter === "all" ? true
      : filter === "mine" ? ballot.has(s.id)
      : filter === "member" ? s.categories.length === 0
      : s.categories.includes(filter));
    const canPost = !(round.closed || round.source === "survey");
    body.innerHTML = `
      <div class="seed-tools">
        <select data-filter-select aria-label="絞り込み">
          ${[["all", "すべての種"], ["mine", "自分が選んだ種"], ...Object.entries(CATEGORIES), ["member", "メンバー提案"]].map(([k, l]) =>
            `<option value="${k}" ${filter === k ? "selected" : ""}>${l}</option>`).join("")}
        </select>
        ${canPost ? `<button type="button" class="primary small" data-open-post>＋ 種を投稿</button>` : ""}
      </div>
      ${canPost ? `<div class="card seed-post" hidden>${seedForm()}</div>` : ""}
      <div class="card-grid">${list.map((s) => {
        const rank = myBallot.indexOf(s.id) + 1;
        return `
        <article class="card seed-card ${rank ? "is-selected" : ""}" data-seed="${s.id}">
          <div class="row"><span class="row-left">${categoryChips(s.categories)}${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ""}</span>
            <span class="row-left">${rank ? `<span class="status-now">第${rank}希望</span>` : data.myTied.includes(s.id) ? `<span class="status-now">希望</span>` : ""}
              <details class="card-menu"><summary aria-label="その他の操作">⋯</summary><div class="card-menu-panel">
                <button type="button" data-notes="${s.id}">📝 リサーチメモ（${s.notes}）</button>
                ${s.manageable ? `<button type="button" data-edit="${s.id}">✏️ 編集</button><button type="button" class="danger-text" data-del="${s.id}">🗑 削除</button>` : ""}
                ${state.me.isAdmin && !s.project ? `<button type="button" data-promote="${s.id}">✅ 正式なPJにする</button>` : ""}
                ${state.me.isAdmin && s.project ? `<button type="button" class="danger-text" data-undo-promote="${s.id}">↩ 正式なPJを取り消す</button>` : ""}
                ${s.author ? `<p class="muted small">投稿：${esc(s.author)}</p>` : ""}
              </div></details></span></div>
          <h3><span class="seed-icon">${esc(s.icon)}</span>${esc(s.title)}</h3>
          ${s.description ? `<p class="desc clamp">${esc(s.description)}</p>` : ""}
          ${s.project ? `<a class="next-step" href="#/projects/${s.project.id}"><span>PJになりました</span>${esc(s.project.name)} →</a>` : ""}
          <div class="seed-foot">
            <span class="row-left"><span class="muted small">希望 ${s.voters.length}人${s.firstChoices ? `（第1希望 ${s.firstChoices}）` : ""}</span>
              <button type="button" class="link-btn" data-comments="${s.id}">💬 コメント${s.comments ? `（${s.comments}）` : ""}</button></span>
            ${round.closed || round.source === "survey" ? "" : `<button class="cta-sm ${rank ? "is-on" : ""}" data-toggle="${s.id}">${rank ? "✓ 選択中" : "関わりたい"}</button>`}
          </div>
          <div class="make-form"></div><div class="undo-box"></div>
          <div class="notes" hidden></div>
          <div class="comments" hidden></div>
        </article>`;
      }).join("") || `<div class="empty"><p>該当する種はありません。</p></div>`}</div>`;
    bind();
  };

  const bind = () => {
    body.querySelector(".seed-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      busy(e.submitter, () => api(`/api/rounds/${round.id}/seeds`, { method: "POST", body: seedBody(e.target) }))
        .then(() => { toast("種を投稿しました"); reload(); }).catch(() => {});
    });
    body.querySelector("[data-filter-select]").addEventListener("change", (e) => { filter = seedFilter = e.target.value; draw(); });
    body.querySelector("[data-open-post]")?.addEventListener("click", (e) => {
      const box = body.querySelector(".seed-post");
      box.hidden = !box.hidden;
      e.currentTarget.classList.toggle("is-on", !box.hidden);
      if (!box.hidden) box.querySelector("[name=title]").focus();
    });
    // メニューの項目を押したら、メニューは閉じる
    body.querySelectorAll(".card-menu-panel button").forEach((b) => b.addEventListener("click", () => { b.closest("details").open = false; }));
    body.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => {
      const sid = Number(b.dataset.toggle);
      const order = ballot.has(sid) ? myBallot.filter((x) => x !== sid) : [...myBallot, sid];
      busy(b, () => api(`/api/rounds/${round.id}/ballot`, { method: "PUT", body: { order } }))
        .then(() => {
          toast(ballot.has(sid) ? "外しました" : `第${order.length}希望として追加しました。順番は「自分の投票」で変えられます`);
          reload();
        }).catch(() => {});
    }));
    body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!await confirmDialog("この種を削除しますか？投票やメモも消えます。")) return;
      busy(b, () => api(`/api/seeds/${b.dataset.del}`, { method: "DELETE", body: {} })).then(reload).catch(() => {});
    }));
    body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const seed = seeds.find((s) => s.id === Number(b.dataset.edit));
      const card = b.closest(".seed-card");
      card.innerHTML = seedForm(seed);
      card.querySelector("[data-cancel]").addEventListener("click", draw);
      card.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        busy(e.submitter, () => api(`/api/seeds/${seed.id}`, { method: "PATCH", body: seedBody(e.target, seed) }))
          .then(() => { toast("保存しました"); reload(); }).catch(() => {});
      });
    }));
    // 投票（希望PJアンケートなど）で決まった種を、そのまま正式なPJにする
    body.querySelectorAll("[data-promote]").forEach((b) => b.addEventListener("click", () => {
      const seed = seeds.find((s) => s.id === Number(b.dataset.promote));
      showMakeForm(b.closest(".seed-card").querySelector(".make-form"), seed, seed, seed.voters.map((v) => v.id), reload);
    }));
    // 正式なPJの取り消し：消える内容の件数を見せて、確認してから削除する
    body.querySelectorAll("[data-undo-promote]").forEach((b) => b.addEventListener("click", async () => {
      const box = b.closest(".seed-card").querySelector(".undo-box");
      const { project, counts: c } = await api(`/api/seeds/${b.dataset.undoPromote}/project`).catch((e) => (toast(e.message, "error"), {}));
      if (!project) return;
      box.innerHTML = `<div class="confirm-start danger-box">
        <p><strong>「${esc(project.name)}」を正式なPJから取り消しますか？</strong></p>
        <p class="small">このPJと、次の内容がすべて削除されます。元に戻せません。</p>
        <ul class="small">
          <li>メンバー ${c.members}人の割り当て</li><li>MTG ${c.meetings}件・議事録 ${c.minutes}件</li>
          <li>タスク ${c.tasks}件・工程のチェック ${c.checked}件</li><li>樹形図・施策・発表準備・定例の進捗共有</li>
        </ul>
        <p class="muted small">種はPJ決めに残り、もう一度「正式なPJにする」ことができます。${c.hearings ? `外部ヒアリング ${c.hearings}件は消えずに残ります（PJとの結び付きだけ外れます）。` : ""}</p>
        <div class="form-actions"><button type="button" data-cancel>やめる</button><button type="button" class="danger" data-go>取り消す</button></div>
      </div>`;
      box.querySelector("[data-cancel]").addEventListener("click", () => { box.innerHTML = ""; });
      box.querySelector("[data-go]").addEventListener("click", (e) =>
        busy(e.currentTarget, () => api(`/api/seeds/${b.dataset.undoPromote}/project`, { method: "DELETE", body: { project_id: project.id } }))
          .then(() => { toast(`「${project.name}」を取り消しました`); reload(); }).catch(() => {}));
    }));
    body.querySelectorAll("[data-comments]").forEach((b) => b.addEventListener("click", () => {
      const box = b.closest(".seed-card").querySelector(".comments");
      box.hidden = !box.hidden;
      b.classList.toggle("is-on", !box.hidden);
      if (!box.hidden) renderComments(box, Number(b.dataset.comments), b);
    }));
    body.querySelectorAll("[data-notes]").forEach((b) => b.addEventListener("click", () => {
      const box = b.closest(".seed-card").querySelector(".notes");
      box.hidden = !box.hidden;
      if (!box.hidden) renderNotes(box, Number(b.dataset.notes));
    }));
  };
  draw();
}

// 種へのコメント：一覧と書き込み（消せるのは書いた本人と管理者）
async function renderComments(box, seedId, button) {
  box.innerHTML = `<p class="muted small">読み込み中…</p>`;
  const { comments } = await api(`/api/seeds/${seedId}/comments`);
  button.textContent = `💬 コメント${comments.length ? `（${comments.length}）` : ""}`;
  box.innerHTML = `
    ${comments.length ? `<ul class="note-list">${comments.map((c) => `
      <li>${avatar(c)}<div><p class="pre">${esc(c.body)}</p>
        <span class="muted small">${esc(c.name)}・${fmtDateTime(jstDateTime(c.created_at))}</span>
        ${c.user_id === state.me.id || state.me.isAdmin ? `<button class="link-btn danger" data-del-comment="${c.id}">削除</button>` : ""}</div></li>`).join("")}</ul>`
      : `<p class="muted small">まだコメントはありません。</p>`}
    <form class="form note-form">
      <textarea name="body" maxlength="600" rows="2" required placeholder="この種についての意見・質問"></textarea>
      <div class="form-actions"><button class="small primary">コメントする</button></div>
    </form>`;
  box.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => api(`/api/seeds/${seedId}/comments`, { method: "POST", body: formData(e.target) }))
      .then(() => renderComments(box, seedId, button)).catch(() => {});
  });
  box.querySelectorAll("[data-del-comment]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("このコメントを削除しますか？")) return;
    busy(b, () => api(`/api/seed-comments/${b.dataset.delComment}`, { method: "DELETE", body: {} }))
      .then(() => renderComments(box, seedId, button)).catch(() => {});
  }));
}

async function renderNotes(box, seedId) {
  box.innerHTML = `<p class="muted small">読み込み中…</p>`;
  const { notes } = await api(`/api/seeds/${seedId}/notes`);
  box.innerHTML = `
    <p class="caution small">⚠ AIで調べた情報は、必ず一次出典を確認する</p>
    ${notes.length ? `<ul class="note-list">${notes.map((n) => `
      <li>${avatar(n)}<div><p>${esc(n.body)}</p>
        ${n.url ? `<a class="small" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.url)}</a>` : ""}
        <span class="muted small">${esc(n.name)}</span>
        ${n.user_id === state.me.id || state.me.isAdmin ? `<button class="link-btn danger" data-del-note="${n.id}">削除</button>` : ""}</div></li>`).join("")}</ul>`
      : `<p class="muted small">まだメモはありません。軽く調べたことを書いておきましょう。</p>`}
    <form class="form note-form">
      <textarea name="body" maxlength="600" rows="2" required placeholder="分かったこと・気になったこと（短く）"></textarea>
      <input name="url" type="url" placeholder="出典のURL（一次出典を確認したもの）">
      <div class="form-actions"><button class="small primary">メモを追加</button></div>
    </form>`;
  box.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => api(`/api/seeds/${seedId}/notes`, { method: "POST", body: formData(e.target) }))
      .then(() => renderNotes(box, seedId)).catch(() => {});
  });
  box.querySelectorAll("[data-del-note]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("このメモを削除しますか？")) return;
    busy(b, () => api(`/api/notes/${b.dataset.delNote}`, { method: "DELETE", body: {} })).then(() => renderNotes(box, seedId)).catch(() => {});
  }));
}

function renderBallot(body, data, reload) {
  const { round, seeds } = data;
  let order = data.myBallot.slice();
  const byId = Object.fromEntries(seeds.map((s) => [s.id, s]));
  const save = (btn) => busy(btn, () => api(`/api/rounds/${round.id}/ballot`, { method: "PUT", body: { order } }))
    .then(() => toast("投票を保存しました")).catch(reload);

  const draw = () => {
    body.innerHTML = `
      <p class="muted">上ほど優先されます（第1希望がいちばん大事）。開票では、第1希望の票が少ない種から順に外し、その票を次の希望へ移して決めます。</p>
      ${order.length ? `<ol class="list ballot">${order.map((sid, i) => `
        <li class="list-item">
          <span><strong class="rank">第${i + 1}希望</strong> ${esc(byId[sid]?.icon || "")} ${esc(byId[sid]?.title || "")}</span>
          ${round.closed ? "" : `<div class="meta">
            <button class="small" data-up="${i}" ${i === 0 ? "disabled" : ""} aria-label="上へ">↑</button>
            <button class="small" data-down="${i}" ${i === order.length - 1 ? "disabled" : ""} aria-label="下へ">↓</button>
            <button class="link-btn danger" data-rm="${i}">外す</button></div>`}
        </li>`).join("")}</ol>`
        : `<div class="empty"><p>まだ選んでいません。「政策の種」タブで、関わりたい種の「関わりたい」を押してください。</p></div>`}`;
    body.querySelectorAll("[data-up],[data-down]").forEach((b) => b.addEventListener("click", () => {
      const i = Number(b.dataset.up ?? b.dataset.down);
      const j = b.dataset.up !== undefined ? i - 1 : i + 1;
      [order[i], order[j]] = [order[j], order[i]];
      draw();
      save(b);
    }));
    body.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      order.splice(Number(b.dataset.rm), 1);
      draw();
      save(b);
    }));
  };
  draw();
}

async function renderResults(body, data, reload) {
  const { round } = data;
  let seats = round.seats;
  const draw = async () => {
    const r = await api(`/api/rounds/${round.id}/results?seats=${seats}`);
    const seedOf = Object.fromEntries(r.seeds.map((s) => [s.id, s]));
    const userOf = Object.fromEntries(r.users.map((u) => [u.id, u]));
    const title = (id) => `${seedOf[id]?.icon || ""} ${seedOf[id]?.title || ""}`;
    const seedsState = Object.fromEntries(data.seeds.map((s) => [s.id, s]));

    body.innerHTML = `
      ${round.closed ? "" : `<p class="notice">締め切り前のため、開票結果は管理者だけに表示されています（途中経過を見て順位を変える人が出ないように）。</p>`}
      <div class="board-tools">
        <span>投票者 <strong>${r.ballots}</strong>人</span>
        <label class="row-left small">決めるPJの数
          <select id="seats">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === seats ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      ${r.winners.length ? r.winners.map((w, i) => {
        const sid = w.winner;
        const assigned = r.assignment.byWinner[sid] || [];
        const project = seedsState[sid]?.project;
        return `
        <section class="card winner">
          <div class="row"><span class="status-now">${i + 1}位</span>
            ${project ? `<a class="button small" href="#/projects/${project.id}">PJを見る →</a>`
              : state.me.isAdmin ? `<button class="primary small" data-make="${sid}">正式なPJにする</button>` : ""}</div>
          <h3>${esc(title(sid))}</h3>
          <p class="small"><strong>割り振り案</strong>（選ばれたPJのうち、本人の希望順位がいちばん高いものへ）：
            ${assigned.length ? assigned.map((u) => `${avatar(userOf[u])} ${esc(userOf[u]?.name)}`).join("　") : "なし"}</p>
          <details><summary class="small">開票の経過（${w.rounds.length}ラウンド）</summary>${roundsTable(w.rounds, title)}</details>
          <div class="make-form"></div>
        </section>`;
      }).join("") : `<div class="empty"><p>まだ票がありません。</p></div>`}
      ${r.assignment.unassigned.length ? `<p class="muted small">選ばれたPJをどれも希望していない人：${r.assignment.unassigned.map((u) => esc(userOf[u]?.name)).join("、")}</p>` : ""}`;

    body.querySelector("#seats")?.addEventListener("change", (e) => { seats = Number(e.target.value); draw(); });
    body.querySelectorAll("[data-make]").forEach((b) => b.addEventListener("click", () => {
      const sid = Number(b.dataset.make);
      showMakeForm(b.closest(".winner").querySelector(".make-form"), seedOf[sid], seedsState[sid], r.assignment.byWinner[sid] || [], reload);
      b.hidden = true;
    }));
  };
  await draw();
}

function roundsTable(rounds, title) {
  return `<div class="table-wrap"><table class="rounds">
    <thead><tr><th>ラウンド</th><th>票数</th><th>結果</th></tr></thead>
    <tbody>${rounds.map((rd, i) => `
      <tr><td>${i + 1}</td>
        <td>${Object.entries(rd.tallies).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(title(id))}：${n}`).join("<br>")}</td>
        <td>${rd.winner ? `<strong>${esc(title(rd.winner))}</strong> が過半数（${rd.majority}票以上）`
          : `${rd.eliminated.map((e) => esc(title(e))).join("、")} を除外${rd.tieBreak ? "（同数のため前のラウンドの票数で判定）" : ""}`}
          ${rd.exhausted ? `<br><span class="muted small">次の希望がない票：${rd.exhausted}</span>` : ""}</td></tr>`).join("")}
    </tbody></table></div>`;
}

// 管理者：種から正式なPJを作る（メンバーは割り振り案・希望者を初期値に、手で調整できる）
function showMakeForm(box, seed, seedState, suggested, reload) {
  const picked = new Set(suggested);
  box.innerHTML = `
    <form class="form make" style="margin-top:12px">
      <label>PJ名<input name="name" maxlength="60" required value="${esc(seed.title)}"></label>
      <label>概要<textarea name="description" maxlength="400" rows="2">${esc(seedState?.description || "")}</textarea></label>
      <label>開始日（1週目の初日）<input name="start_date" type="date" required value="${nextMonday()}"></label>
      <fieldset><legend>メンバー（希望した人・割り振り案を選択済み。調整できます）</legend>
        <div class="member-picker">${state.users.map((u) => `
          <label class="chip-check"><input type="checkbox" name="member" value="${esc(u.id)}" ${picked.has(u.id) ? "checked" : ""}>${avatar(u)}<span>${esc(u.name)}</span></label>`).join("")}</div>
      </fieldset>
      <p class="muted small">MTGの進め方などは、作成後にPJの「編集」から設定できます（初期値は「毎回決める」）。</p>
      <div class="form-actions"><button class="primary">PJを作成する</button></div>
    </form>`;
  bindMemberFilter(box);
  box.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const button = e.submitter;
    const member_ids = [...f.querySelectorAll("[name=member]:checked")].map((c) => c.value);
    if (!member_ids.length) return toast("メンバーを1人以上選んでください", "error");
    // 作る前に、PJ名・開始日・メンバーを確かめてもらう
    const names = member_ids.map((id) => state.users.find((u) => u.id === id)?.name || "").join("、");
    const ok = await confirmDialog(`「${f.name.value}」を正式なPJにしますか？
開始日：${fmtDate(f.start_date.value)}
メンバー（${member_ids.length}人）：${names}`, { ok: "正式なPJにする" });
    if (!ok) return;
    busy(button, () => api(`/api/seeds/${seed.id}/project`, {
      method: "POST", body: { name: f.name.value, description: f.description.value, start_date: f.start_date.value, member_ids },
    })).then((res) => {
      toast("PJを作成しました");
      location.hash = `#/projects/${res.id}`;
    }).catch(() => {});
  });
}
