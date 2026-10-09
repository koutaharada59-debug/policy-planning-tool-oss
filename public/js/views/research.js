// フェーズ2：因果の樹形図・施策・資料
import { api, esc, state, busy, toast, formData, memberOptions, hashQuery, copyText, confirmDialog } from "../lib.js";

const RULES = `<p class="caution small">⚠ 数字は一次出典を確認したものだけ。AIが書いた文章は引用しない。</p>`;
const KIND_LABEL = { issue: "課題", cause: "原因" };

// 改行を残して表示する
function para(text) {
  return text ? `<p class="pre">${esc(text)}</p>` : "";
}

function sourceBadge(s) {
  return s.primary_checked ? "" : `<span class="unverified" title="一次出典が未確認です">⚠ 未確認</span>`;
}

// ================= 樹形図 =================

export async function renderTreeTab(body, projectId, reload) {
  const data = await api(`/api/projects/${projectId}/tree`);
  const ro = !data.canEdit;
  const children = {};
  for (const n of data.nodes) (children[n.parent_id ?? "root"] ||= []).push(n);
  const sourceOf = Object.fromEntries(data.sources.map((s) => [s.id, s]));
  const measuresOf = (id) => data.measures.filter((m) => m.node_id === id);
  const openIds = new Set((hashQuery().get("open") || "").split(",").filter(Boolean).map(Number));

  const nodeHtml = (n, depth) => {
    const srcs = n.source_ids.map((id) => sourceOf[id]).filter(Boolean);
    const unverified = srcs.filter((s) => !s.primary_checked).length;
    const ms = measuresOf(n.id);
    const kids = children[n.id] || [];
    return `
      <li class="tree-item">
        <div class="tree-node kind-${n.kind}" data-node="${n.id}">
          <div class="tree-head">
            <span class="kind-badge kind-${n.kind}">${KIND_LABEL[n.kind]}</span>
            <button class="tree-title" data-toggle="${n.id}" aria-expanded="${openIds.has(n.id)}">${esc(n.title)}</button>
          </div>
          <div class="tree-meta">
            ${n.owner_name ? `<span>担当：${esc(n.owner_name)}</span>` : ""}
            <span class="${n.evidence ? "" : "warn"}">${n.evidence ? "数字の根拠あり" : "数字の根拠なし"}</span>
            <span>出典 ${srcs.length}件${unverified ? `<span class="unverified">⚠ 未確認 ${unverified}</span>` : ""}</span>
            ${ms.length ? `<a href="#/projects/${projectId}?tab=measures">施策 ${ms.length}件</a>` : ""}
          </div>
          <div class="tree-detail" ${openIds.has(n.id) ? "" : "hidden"}>
            ${n.description ? `<h4>説明</h4>${para(n.description)}` : ""}
            ${n.evidence ? `<h4>数字による根拠</h4>${para(n.evidence)}` : ""}
            ${n.cases_domestic ? `<h4>参考事例（国内）</h4>${para(n.cases_domestic)}` : ""}
            ${n.cases_overseas ? `<h4>参考事例（海外）</h4>${para(n.cases_overseas)}` : ""}
            ${n.memo ? `<h4>メモ</h4>${para(n.memo)}` : ""}
            ${srcs.length ? `<h4>出典</h4><ul class="src-list">${srcs.map((s) => `<li>${sourceBadge(s)}
              ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}
              <span class="muted small">${esc(data.kinds[s.kind])}${s.publisher ? `・${esc(s.publisher)}` : ""}${s.published_on ? `・${esc(s.published_on)}` : ""}</span></li>`).join("")}</ul>` : ""}
            ${ms.length ? `<h4>この${KIND_LABEL[n.kind]}から生じた施策</h4><ul class="src-list">${ms.map((m) =>
              `<li><a href="#/projects/${projectId}?tab=measures&open=${m.id}">${esc(m.title)}</a></li>`).join("")}</ul>` : ""}
            ${n.updated_by_name ? `<p class="muted small">最終更新：${esc(n.updated_by_name)}</p>` : ""}
            ${ro ? "" : `<div class="row-left">
              <button class="small" data-edit="${n.id}">編集</button>
              <a class="button small" href="#/projects/${projectId}?tab=measures&new=${n.id}">この${KIND_LABEL[n.kind]}から施策を作る</a>
              <button class="link-btn danger" data-del="${n.id}">削除</button></div>`}
            <div class="node-form"></div>
          </div>
          ${ro ? "" : `<button class="link-btn add-child" data-add="${n.id}">＋ 原因を追加（なぜ？）</button>`}
          <div class="child-form"></div>
        </div>
        ${kids.length ? `<ul class="tree">${kids.map((k) => nodeHtml(k, depth + 1)).join("")}</ul>` : ""}
      </li>`;
  };

  const roots = children.root || [];
  body.innerHTML = `
    <details class="help-fold"><summary>ℹ 樹形図の見方</summary>
      <p class="small">いちばん上が「課題」、その下に「なぜそうなるのか」の<strong>原因</strong>をつなぎます。
      <strong>下の段（子）が原因、上の段（親）がその結果</strong>です（原因 → 結果）。調べるほど下へ枝分かれします。</p>
    </details>
    ${RULES}
    ${roots.length ? `<ul class="tree root">${roots.map((n) => nodeHtml(n, 0)).join("")}</ul>`
      : `<div class="empty"><p>まだ樹形図がありません。まず、取り組む課題を1つ置きましょう。</p></div>`}
    ${ro ? "" : `<button class="primary" id="add-root" style="margin-top:12px">＋ 課題を追加（いちばん上）</button><div id="root-form"></div>`}`;

  const form = (n = {}, parentId = null) => {
    const descendants = new Set();
    const walk = (id) => (children[id] || []).forEach((c) => { descendants.add(c.id); walk(c.id); });
    if (n.id) { descendants.add(n.id); walk(n.id); }
    const parentOptions = data.nodes.filter((x) => !descendants.has(x.id));
    const chosen = new Set(n.source_ids || []);
    const isRoot = n.id ? !n.parent_id : !parentId;
    return `
      <form class="form card node-edit">
        ${n.id ? `<label>親（この${KIND_LABEL[n.kind || "cause"]}が原因となっている結果）
          <select name="parent_id"><option value="">（いちばん上：課題）</option>
            ${parentOptions.map((x) => `<option value="${x.id}" ${x.id === n.parent_id ? "selected" : ""}>${esc(KIND_LABEL[x.kind])}：${esc(x.title)}</option>`).join("")}
          </select></label>` : ""}
        ${isRoot ? "" : `<label>種類<select name="kind">
          <option value="cause" ${n.kind !== "issue" ? "selected" : ""}>原因</option>
          <option value="issue" ${n.kind === "issue" ? "selected" : ""}>課題（この下でさらに課題として扱う）</option></select></label>`}
        <label>タイトル <span class="req">必須</span><input name="title" maxlength="120" required value="${esc(n.title || "")}"
          placeholder="${isRoot ? "例：地熱発電の導入が進まない" : "例：温泉事業者が湯量の減少を心配して反対する"}"></label>
        <label>説明<textarea name="description" rows="2" maxlength="1000">${esc(n.description || "")}</textarea></label>
        <label>数字による根拠<textarea name="evidence" rows="2" maxlength="1000" placeholder="出典のある数字だけ（例：導入量は資源量の約2%（資源エネルギー庁, 2023））">${esc(n.evidence || "")}</textarea></label>
        <div class="grid-2">
          <label>参考事例（国内）<textarea name="cases_domestic" rows="2" maxlength="1000">${esc(n.cases_domestic || "")}</textarea></label>
          <label>参考事例（海外）<textarea name="cases_overseas" rows="2" maxlength="1000">${esc(n.cases_overseas || "")}</textarea></label>
        </div>
        <label>メモ<textarea name="memo" rows="2" maxlength="1000">${esc(n.memo || "")}</textarea></label>
        <label>担当<select name="owner_id">${memberOptions(state.users, n.owner_id, { empty: "（なし）" })}</select></label>
        <fieldset><legend>出典（資料タブに登録した資料から選ぶ）</legend>
          ${data.sources.length ? `<div class="source-picker">${data.sources.map((s) => `
            <label class="check small"><input type="checkbox" name="source" value="${s.id}" ${chosen.has(s.id) ? "checked" : ""}>
              <span>${sourceBadge(s)} ${esc(s.title)} <small>${esc(data.kinds[s.kind])}${s.project_id ? "" : "・部門共通"}</small></span></label>`).join("")}</div>`
            : `<p class="muted small">まだ資料がありません。「資料」タブで登録すると、ここで選べます。</p>`}
        </fieldset>
        <div class="form-actions"><button type="button" data-cancel>やめる</button><button class="primary">保存する</button></div>
      </form>`;
  };

  const bindForm = (box, n, parentId) => {
    const f = box.querySelector("form");
    f.querySelector("[data-cancel]").addEventListener("click", () => (box.innerHTML = ""));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const payload = { ...formData(f), source_ids: [...f.querySelectorAll("[name=source]:checked")].map((c) => Number(c.value)) };
      delete payload.source;
      if (!n.id) payload.parent_id = parentId;
      busy(e.submitter, () => n.id
        ? api(`/api/nodes/${n.id}`, { method: "PATCH", body: { ...payload, version: n.version } })
        : api(`/api/projects/${projectId}/nodes`, { method: "POST", body: payload }))
        .then((res) => {
          toast("保存しました");
          const open = new Set(openIds);
          open.add(n.id || res.id);
          if (parentId) open.add(parentId);
          location.hash = `#/projects/${projectId}?tab=tree&open=${[...open].join(",")}`;
        }).catch(() => {});
    });
  };

  body.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => {
    const detail = b.closest(".tree-node").querySelector(".tree-detail");
    detail.hidden = !detail.hidden;
    b.setAttribute("aria-expanded", String(!detail.hidden));
  }));
  body.querySelector("#add-root")?.addEventListener("click", () => {
    const box = body.querySelector("#root-form");
    box.innerHTML = form({}, null);
    bindForm(box, {}, null);
  });
  body.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
    const box = b.nextElementSibling;
    box.innerHTML = form({}, Number(b.dataset.add));
    bindForm(box, {}, Number(b.dataset.add));
    box.querySelector("[name=title]").focus();
  }));
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const n = data.nodes.find((x) => x.id === Number(b.dataset.edit));
    const box = b.closest(".tree-detail").querySelector(".node-form");
    box.innerHTML = form(n);
    bindForm(box, n, n.parent_id);
  }));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("このノードを削除しますか？（紐づいた施策は「課題なし」になります）")) return;
    busy(b, () => api(`/api/nodes/${b.dataset.del}`, { method: "DELETE", body: {} })).then(reload).catch(() => {});
  }));
}

// ================= 施策 =================

const MEASURE_FIELDS = [
  ["current_state", "現状", "いま何が起きているか"],
  ["problem", "課題", "現状のどこが問題かを数字で示す"],
  ["cases", "参考事例", "国内＝制度的な実現可能性の根拠、海外＝概念実証"],
  ["what", "施策の内容：何をするのか", "主語を明確に（誰が・何を）"],
  ["flow", "施策の内容：導入フロー", "既存の枠組みに乗せる形が現実的。壁になる法律も整理する"],
  ["budget", "施策の内容：予算感", "既存の類似事業を参考に試算する"],
  ["faq", "FAQ", "想定される質問と答え"],
];

export async function renderMeasuresTab(body, projectId, reload) {
  const data = await api(`/api/projects/${projectId}/tree`);
  const ro = !data.canEdit;
  const q = hashQuery();
  const openId = Number(q.get("open")) || null;
  const newFor = Number(q.get("new")) || null;
  const nodeOf = Object.fromEntries(data.nodes.map((n) => [n.id, n]));
  const nodeOptions = (sel) => `<option value="">（課題に紐づけない）</option>` + data.nodes.map((n) =>
    `<option value="${n.id}" ${n.id === sel ? "selected" : ""}>${esc(KIND_LABEL[n.kind])}：${esc(n.title)}</option>`).join("");

  const groups = [...data.nodes.filter((n) => data.measures.some((m) => m.node_id === n.id)).map((n) => [n, data.measures.filter((m) => m.node_id === n.id)]),
    ...(data.measures.some((m) => !m.node_id) ? [[null, data.measures.filter((m) => !m.node_id)]] : [])];

  const card = (m) => `
    <article class="card measure" data-measure="${m.id}">
      <div class="row"><h3>${esc(m.title)}</h3>
        <span class="muted small">${m.owner_name ? `担当：${esc(m.owner_name)}` : ""}</span></div>
      <details ${m.id === openId ? "open" : ""}><summary class="small">型に沿った内容を見る</summary>
        <dl class="fields">${MEASURE_FIELDS.map(([k, label]) => m[k] ? `<dt>${label}</dt><dd class="pre">${esc(m[k])}</dd>` : "").join("")}</dl>
      </details>
      <div class="card-actions">
        <button class="link-btn" data-copy="${m.id}">📋 ドキュメント用にコピー</button>
        ${ro ? "" : `<button class="link-btn" data-edit="${m.id}">編集</button><button class="link-btn danger" data-del="${m.id}">削除</button>`}
      </div>
      <div class="measure-form"></div>
    </article>`;

  body.innerHTML = `
    <details class="help-fold"><summary>ℹ 施策の書き方</summary>
      <p class="small">施策は、樹形図の課題・原因に紐づけて「どの課題から生じた施策か」が分かるようにします。型：現状・課題・参考事例・施策の内容（何をするか・導入フロー・予算感）・FAQ。</p>
    </details>
    ${RULES}
    ${ro ? "" : `<button class="primary" id="add-measure">＋ 施策を作る</button><div id="new-measure"></div>`}
    ${groups.length ? groups.map(([n, ms]) => `
      <section class="section measure-group">
        <h2 class="measure-from">${n ? `<span class="kind-badge kind-${n.kind}">${KIND_LABEL[n.kind]}</span> ${esc(n.title)} <small class="muted">から生じた施策</small>`
          : `<span class="muted">課題に紐づいていない施策</span>`}</h2>
        ${ms.map(card).join("")}
      </section>`).join("") : `<div class="empty" style="margin-top:16px"><p>まだ施策がありません。樹形図のノードの「施策を作る」からも作れます。</p></div>`}`;

  const measureForm = (m) => `
    <form class="form card">
      <label>施策の名前 <span class="req">必須</span><input name="title" maxlength="120" required value="${esc(m.title || "")}"></label>
      <div class="grid-2">
        <label>どの課題から生じた施策か<select name="node_id">${nodeOptions(m.node_id)}</select></label>
        <label>担当<select name="owner_id">${memberOptions(state.users, m.owner_id, { empty: "（なし）" })}</select></label>
      </div>
      ${MEASURE_FIELDS.map(([k, label, hint]) => `<label>${label}<textarea name="${k}" rows="3" maxlength="2000" placeholder="${esc(hint)}">${esc(m[k] || "")}</textarea></label>`).join("")}
      <div class="form-actions"><button type="button" data-cancel>やめる</button><button class="primary">保存する</button></div>
    </form>`;

  const bindForm = (box, m) => {
    const f = box.querySelector("form");
    f.querySelector("[data-cancel]").addEventListener("click", () => (box.innerHTML = ""));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      busy(e.submitter, () => m.id
        ? api(`/api/measures/${m.id}`, { method: "PATCH", body: { ...formData(f), version: m.version } })
        : api(`/api/projects/${projectId}/measures`, { method: "POST", body: formData(f) }))
        .then((res) => {
          toast("保存しました");
          location.hash = `#/projects/${projectId}?tab=measures&open=${m.id || res.id}`;
        }).catch(() => {});
    });
  };

  const openNew = (nodeId) => {
    const box = body.querySelector("#new-measure");
    const n = nodeOf[nodeId];
    // ノードから作るときは、課題欄にそのノードの根拠を入れておく
    box.innerHTML = measureForm({ node_id: nodeId, problem: n ? [n.title, n.evidence].filter(Boolean).join("\n") : "" });
    bindForm(box, {});
    box.querySelector("[name=title]").focus();
  };
  body.querySelector("#add-measure")?.addEventListener("click", () => openNew(null));
  if (newFor && !ro) openNew(newFor);
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const m = data.measures.find((x) => x.id === Number(b.dataset.edit));
    const box = b.closest(".measure").querySelector(".measure-form");
    box.innerHTML = measureForm(m);
    bindForm(box, m);
  }));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!await confirmDialog("この施策を削除しますか？")) return;
    busy(b, () => api(`/api/measures/${b.dataset.del}`, { method: "DELETE", body: {} })).then(reload).catch(() => {});
  }));
  body.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const m = data.measures.find((x) => x.id === Number(b.dataset.copy));
    const n = nodeOf[m.node_id];
    const md = [`## ${m.title}`, n ? `（${KIND_LABEL[n.kind]}「${n.title}」から生じた施策）` : "",
      ...MEASURE_FIELDS.flatMap(([k, label]) => m[k] ? [`### ${label}`, m[k], ""] : [])].filter((x) => x !== "").join("\n");
    await copyText(md + "\n");
    toast("Googleドキュメントに貼れる形でコピーしました");
  }));
}

// ================= 資料 =================

// projectId を渡すとそのPJの資料（PJのタブ）、渡さなければ全体の一覧
export async function renderSourcesView(el, { projectId = null, canAdd = true } = {}) {
  const [{ projects }, first] = await Promise.all([api("/api/projects"), api(`/api/sources${projectId ? `?project=${projectId}` : ""}`)]);
  const kinds = first.kinds;
  const filters = { project: projectId ? String(projectId) : "", kind: "", checked: "", q: "" };
  let list = first.sources;

  const load = async () => {
    const p = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    list = (await api(`/api/sources?${p}`)).sources;
    drawList();
  };

  el.innerHTML = `
    ${projectId ? "" : `<nav class="breadcrumb"><a href="#/check">確認する</a> / 資料</nav>
      <div class="page-heading"><h1>📚 資料</h1></div>`}
    ${RULES}
    ${canAdd ? `<details class="card" id="add-box"><summary><strong>＋ 資料を登録する</strong></summary>${sourceForm({ project_id: projectId }, projects, kinds, !projectId)}</details>` : ""}
    <div class="filters">
      ${projectId ? "" : `<select data-filter="project"><option value="">すべてのPJ</option><option value="none">部門共通</option>
        ${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select>`}
      <select data-filter="kind"><option value="">すべての種類</option>${Object.entries(kinds).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
      <select data-filter="checked"><option value="">確認状態：すべて</option><option value="0">⚠ 一次出典が未確認</option><option value="1">確認済み</option></select>
      <input type="search" data-filter="q" placeholder="タイトル・出典・要点で探す">
    </div>
    <div id="source-list"></div>`;

  const drawList = () => {
    const box = el.querySelector("#source-list");
    box.innerHTML = list.length ? `<ul class="list">${list.map((s) => `
      <li class="list-item source-item ${s.primary_checked ? "" : "is-unverified"}">
        <div class="source-main">
          <div>${sourceBadge(s)} ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener"><strong>${esc(s.title)}</strong></a>` : `<strong>${esc(s.title)}</strong>`}</div>
          <div class="meta"><span class="tag">${esc(kinds[s.kind])}</span>
            ${s.publisher ? `<span>${esc(s.publisher)}</span>` : ""}${s.published_on ? `<span>${esc(s.published_on)}</span>` : ""}
            ${projectId ? "" : `<span class="muted">${s.project_name ? esc(s.project_name) : "部門共通"}</span>`}
            <span class="muted">登録：${esc(s.created_by_name || "")}</span>
            ${s.node_count ? `<span class="muted">樹形図で使用 ${s.node_count}</span>` : ""}</div>
          ${s.summary ? `<p class="pre small">${esc(s.summary)}</p>` : ""}
        </div>
        <div class="meta">
          <label class="check small"><input type="checkbox" data-check="${s.id}" ${s.primary_checked ? "checked" : ""} ${s.can_edit ? "" : "disabled"}>
            <span>一次出典を確認済み${s.checked_by_name ? `<small>${esc(s.checked_by_name)}</small>` : ""}</span></label>
          ${s.can_edit ? `<button class="link-btn" data-edit="${s.id}">編集</button><button class="link-btn danger" data-del="${s.id}">削除</button>` : ""}
        </div>
        <div class="source-edit"></div>
      </li>`).join("")}</ul>` : `<div class="empty"><p>該当する資料はありません。</p></div>`;

    box.querySelectorAll("[data-check]").forEach((cb) => cb.addEventListener("change", () =>
      busy(cb, () => api(`/api/sources/${cb.dataset.check}`, { method: "PATCH", body: { primary_checked: cb.checked } }))
        .then(load).catch(() => (cb.checked = !cb.checked))));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!await confirmDialog("この資料を削除しますか？（樹形図の出典からも外れます）")) return;
      busy(b, () => api(`/api/sources/${b.dataset.del}`, { method: "DELETE", body: {} })).then(load).catch(() => {});
    }));
    box.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      const s = list.find((x) => x.id === Number(b.dataset.edit));
      const slot = b.closest("li").querySelector(".source-edit");
      slot.innerHTML = sourceForm(s, projects, kinds, true);
      const f = slot.querySelector("form");
      f.querySelector("[data-cancel]")?.addEventListener("click", () => (slot.innerHTML = ""));
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        busy(e.submitter, () => api(`/api/sources/${s.id}`, { method: "PATCH", body: { ...sourceBody(f), version: s.version } }))
          .then(() => { toast("保存しました"); load(); }).catch(() => {});
      });
    }));
  };
  drawList();

  el.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener(input.type === "search" ? "input" : "change", () => {
    filters[input.dataset.filter] = input.value.trim();
    clearTimeout(input._t);
    input._t = setTimeout(load, input.type === "search" ? 250 : 0);
  }));
  el.querySelector("#add-box form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, () => api("/api/sources", { method: "POST", body: sourceBody(e.target) }))
      .then(() => { toast("資料を登録しました"); e.target.reset(); load(); }).catch(() => {});
  });
}

function sourceBody(f) {
  const b = formData(f);
  b.primary_checked = f.primary_checked?.checked || false;
  return b;
}

function sourceForm(s, projects, kinds, chooseProject) {
  return `
    <form class="form" style="margin-top:12px">
      <label>タイトル <span class="req">必須</span><input name="title" maxlength="150" required value="${esc(s.title || "")}"></label>
      <div class="grid-2">
        <label>URL<input name="url" type="url" value="${esc(s.url || "")}" placeholder="https://"></label>
        <label>種類 <span class="req">必須</span><select name="kind" required>
          ${Object.entries(kinds).map(([k, l]) => `<option value="${k}" ${s.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label>出典（発行元・著者・媒体）<input name="publisher" maxlength="100" value="${esc(s.publisher || "")}" placeholder="例：資源エネルギー庁"></label>
        <label>日付<input name="published_on" maxlength="20" value="${esc(s.published_on || "")}" placeholder="例：2024-03 / 2023年度"></label>
      </div>
      ${chooseProject ? `<label>PJ<select name="project_id"><option value="">部門共通（どのPJでも使える）</option>
        ${projects.filter((p) => p.status !== "archived").map((p) => `<option value="${p.id}" ${p.id === s.project_id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`
        : `<input type="hidden" name="project_id" value="${esc(s.project_id || "")}">`}
      <label>要点メモ<textarea name="summary" rows="3" maxlength="1000">${esc(s.summary || "")}</textarea></label>
      <label class="check"><input type="checkbox" name="primary_checked" ${s.primary_checked ? "checked" : ""}>
        <span>一次出典を確認済み<small>AIの回答や孫引きではなく、元の資料そのものを確認した</small></span></label>
      <div class="form-actions">${s.id ? `<button type="button" data-cancel>やめる</button>` : ""}<button class="primary">${s.id ? "保存する" : "登録する"}</button></div>
    </form>`;
}

