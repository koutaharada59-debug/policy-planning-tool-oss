// 議事録：前回の宿題（自動引き継ぎ）／話し合うこと／概要／キーワード／次回までにやること
// 詳細なフィードバックはGoogleドキュメントに残す運用なので、入力欄は短くしている
import { api, esc, state, fmtDateTime, fmtDate, busy, toast, memberOptions, dueBadge, addDays, embedUrl, membersFirst, copyForNotion, copyButton, bindCopyButtons, hashQuery, timerHtml, bindTimer, clearTimer, syncTimerStart, confirmDialog, celebrateProgress, skipButton, bindSkipButtons } from "../lib.js";

export async function renderMeeting(el, id) {
  const data = await api(`/api/meetings/${id}`);
  const { meeting: m, minute, project: p, previous, canEdit } = data;
  // 「議事録を見る」で開いたときは読むだけ。ただし「今回話し合うこと」はMTGの前に書いておける
  const viewOnly = hashQuery().get("mode") === "view";
  const ro = canEdit && !viewOnly ? "" : "disabled";
  const baseRo = ro;
  // 同時編集の状態。locked：ほかの人が書いている項目 → その人の名前
  const live = { focus: null, dirty: new Set(), chain: {}, timers: {}, locked: {}, busy: false, inflight: new Set() };
  // key：画面の行の目印（自動保存で新しく作ったタスクの id を、どの行のものか受け取るため）
  const newKey = () => Math.random().toString(36).slice(2, 10);
  let todos = data.todos.map((t) => ({ ...t, key: newKey() }));
  const memberUsers = membersFirst(data.members);

  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/projects/${p.id}">${esc(p.name)}</a> / 議事録</nav>
    ${viewOnly ? "" : timerHtml(`meeting-${m.id}`, { bar: true })}
    <div class="page-heading left">
      <h1>${fmtDateTime(m.starts_at)} のMTG</h1>
      <p class="live-line small"><span id="live-viewers"></span> <span class="muted" id="live-status">${canEdit ? "自動で保存・みんなで同時に書けます" : ""}</span></p>
      <p>${minute ? `最終更新：${esc(minute.updated_by_name || "")}` : "短く、要点だけ。詳しい内容はGoogleドキュメントへ。"}</p>
      ${canEdit ? `<p class="small"><a href="#/report/${p.id}">📝 このPJの定例の進捗を書く</a></p>` : ""}
      ${viewOnly && canEdit ? `<p class="small">「今回話し合うこと」は、MTGの前に書いておけます。</p>
        <a class="button primary small" href="#/meetings/${m.id}">✏️ このMTGの議事録を書く</a>` : ""}
    </div>

    <form class="minutes" id="minutes-form">
      <section class="card">
        <div class="section-head"><h2>前回MTGで決まった宿題</h2>${previous?.homework.length ? copyButton("homework") : ""}</div>
        ${previous ? `<p class="muted small">${fmtDateTime(previous.starts_at)} のMTGの「次回までにやること」</p>
          ${previous.homework.length ? `<ul class="checklist">${previous.homework.map((t) => `
            <li><label class="check"><input type="checkbox" data-hw="${t.id}" ${t.status === "done" ? "checked" : ""} ${ro}>
              <span>${esc(t.title)}<small>${esc(t.assignee_name || "担当なし")}${t.due_date ? `・${fmtDate(t.due_date)}` : ""}</small></span></label>
              ${t.status !== "done" ? dueBadge(t.due_date) : ""}</li>`).join("")}</ul>`
            : `<p class="muted">前回の宿題はありません。</p>`}`
          : `<p class="muted">このPJで最初の議事録です。</p>`}
      </section>

      <section class="card" data-live="agenda">
        <div class="section-head"><h2>今回話し合うこと <span class="live-badge" data-badge="agenda"></span></h2>${copyButton("agenda")}</div>
        <label><textarea name="agenda" rows="3" maxlength="300" aria-label="今回話し合うこと" ${canEdit ? "" : "disabled"} placeholder="・先行事例の共有&#10;・課題の絞り込み">${esc(minute?.agenda)}</textarea>
          <small class="counter" data-for="agenda"></small></label>
      </section>

      ${memoDocSection(p)}

      <section class="card" data-live="summary">
        <div class="section-head"><h2>話し合いの概要 <span class="live-badge" data-badge="summary"></span></h2>${copyButton("summary")}</div>
        <label><textarea name="summary" rows="3" maxlength="400" aria-label="話し合いの概要" ${ro} placeholder="決まったこと・方向性だけを数行で">${esc(minute?.summary)}</textarea>
          <small class="counter" data-for="summary"></small></label>
      </section>


      ${checklistSection(data, ro)}

      <section class="card" data-live="todos">
        <div class="section-head"><h2>次回MTGまでにやること <span class="live-badge" data-badge="todos"></span></h2>${copyButton("todos")}</div>
        <p class="muted small">保存するとPJのタスクに登録され、次回の議事録に「宿題」として引き継がれます。</p>
        <div id="todos"></div>
        ${ro ? "" : `<button type="button" class="small" id="add-todo">＋ 追加</button>`}
      </section>

      ${p.meeting_mode === "adhoc" ? nextMeetingSection(data, ro) : ""}

      <div class="form-actions sticky">
        <button type="button" id="copy-md" title="Notion用にコピー">📋<span class="hide-sm"> Notion用にコピー</span></button>
        ${canEdit ? `<button class="${viewOnly ? "primary" : ""}" type="submit">${viewOnly ? "話すことを保存" : "保存する"}</button>` : ""}
        ${canEdit && !viewOnly ? `<button class="primary" type="button" id="end-meeting">✅ MTGを終える</button>` : ""}
      </div>
    </form>`;

  const form = el.querySelector("#minutes-form");
  if (!viewOnly) bindTimer(el, `meeting-${m.id}`, { auto: true });
  const todoBox = el.querySelector("#todos");
  const defaultDue = () => (data.nextMeeting ? data.nextMeeting.starts_at.slice(0, 10) : addDays(m.starts_at.slice(0, 10), 7));

  const drawTodos = () => {
    const ro = baseRo || (live.locked.todos ? "disabled" : "");
    el.querySelector("#add-todo")?.toggleAttribute("disabled", Boolean(ro));
    todoBox.innerHTML = todos.length ? todos.map((t, i) => `
      <div class="todo-row" data-i="${i}">
        <input data-k="title" maxlength="120" value="${esc(t.title)}" placeholder="やること" ${ro}>
        <select data-k="assignee_id" ${ro} aria-label="担当">${memberOptions(memberUsers, t.assignee_id, { empty: "担当" })}</select>
        <input data-k="due_date" type="date" value="${esc(t.due_date || "")}" ${ro} aria-label="期限">
        ${t.status === "done" ? `<span class="tag">完了</span>` : ""}
        ${ro ? "" : `<button type="button" class="link-btn danger" data-rm="${i}" aria-label="削除">×</button>`}
      </div>`).join("") : `<p class="muted">まだありません。</p>`;
  };
  drawTodos();

  todoBox.addEventListener("input", (e) => {
    const row = e.target.closest("[data-i]");
    if (row && e.target.dataset.k) {
      todos[row.dataset.i][e.target.dataset.k] = e.target.value;
      markDirty("todos");
    }
  });
  todoBox.addEventListener("click", (e) => {
    if (e.target.dataset.rm === undefined) return;
    todos.splice(Number(e.target.dataset.rm), 1);
    drawTodos();
    markDirty("todos");
  });
  el.querySelector("#add-todo")?.addEventListener("click", () => {
    todos.push({ key: newKey(), title: "", assignee_id: "", due_date: defaultDue() });
    drawTodos();
    todoBox.querySelector(".todo-row:last-child input")?.focus();
  });

  const counters = () => form.querySelectorAll(".counter").forEach((c) => {
    const f = form[c.dataset.for];
    c.textContent = `${f.value.length}/${f.maxLength}`;
  });
  form.addEventListener("input", (e) => {
    counters();
    if (["agenda", "summary"].includes(e.target.name)) markDirty(e.target.name);
  });
  counters();

  el.querySelectorAll("[data-hw]").forEach((cb) => cb.addEventListener("change", () =>
    busy(cb, () => api(`/api/tasks/${cb.dataset.hw}`, { method: "PATCH", body: { status: cb.checked ? "done" : "todo" } }))
      .catch(() => (cb.checked = !cb.checked))));

  // 工程のチェック：ここで入れると、このMTGに結び付く（PJの工程画面から議事録を開ける）
  el.querySelectorAll("[data-stage-check]").forEach((cb) => cb.addEventListener("change", async () => {
    const item = data.checklist.find((c) => c.id === Number(cb.dataset.stageCheck));
    if (cb.checked && item?.notify_leaders && !item.done_at
      && !await confirmDialog(`「${item.label}」にチェックしますか？\n部門長・副部門長にお知らせが届きます。`, { ok: "チェックして知らせる" })) {
      cb.checked = false;
      return;
    }
    busy(cb, () => api(`/api/checklist/${cb.dataset.stageCheck}`, {
      method: "PATCH", body: cb.checked ? { done: true, meeting_id: m.id } : { done: false },
    })).then(() => {
      const note = cb.closest("li").querySelector(".linked");
      if (note) note.textContent = cb.checked ? "このMTGで完了" : "";
      if (item) item.done_at = cb.checked ? Date.now() : null;
      toast(cb.checked ? "このMTGに結び付けて完了にしました" : "チェックを外しました");
    }).catch(() => (cb.checked = !cb.checked));
  }));

  // Notion用：まとめてコピー／項目ごとにコピー（編集中の内容を使う）
  const sections = () => minutesSections({ previous, form, todos, memberUsers, el });
  bindCopyButtons(form, (key) => (sections()[key] || []).join("\n"));
  el.querySelector("#copy-md").addEventListener("click", () => {
    const s = sections();
    copyForNotion([`## ${p.name} MTG ${fmtDateTime(m.starts_at)}`, "", ...s.homework, ...s.agenda, ...s.summary, ...s.todos].join("\n"));
  });

  // スキップしても書きかけの議事録が消えないよう、保存してから描き直す
  bindSkipButtons(form, () => flushAll().then(() => renderMeeting(el, id)).catch(() => {}));

  // ---------- 同時編集：自動保存と、ほかの人の書いた内容の反映 ----------
  const canWrite = (f) => canEdit && (f === "agenda" || !viewOnly);
  const fieldOf = (node) => {
    const f = node?.closest?.("[data-live]")?.dataset.live;
    return f && canWrite(f) ? f : null;
  };
  const valueOf = (f) => (f === "todos"
    ? { todos: todos.map(({ key, id, title, assignee_id, due_date }) => ({ key, id, title, assignee_id, due_date })) }
    : { [f]: form[f].value });
  const status = (text) => { const x = el.querySelector("#live-status"); if (x) x.textContent = text; };

  function markDirty(f) {
    if (!canWrite(f)) return;
    live.dirty.add(f);
    status("入力中…");
    clearTimeout(live.timers[f]);
    live.timers[f] = setTimeout(() => saveField(f), 1000);
  }
  // 1項目ずつ、順番に保存する（前の保存が終わってから次を送る）
  function saveField(f) {
    clearTimeout(live.timers[f]);
    live.chain[f] = (live.chain[f] || Promise.resolve()).then(async () => {
      if (!live.dirty.has(f)) return;
      live.dirty.delete(f);
      live.inflight.add(f);
      try {
        const res = await api(`/api/meetings/${m.id}/minutes`, { method: "PUT", body: valueOf(f) });
        for (const [key, tid] of Object.entries(res.ids || {})) {
          const t = todos.find((x) => x.key === key);
          if (t) t.id = tid;
        }
        status(`✓ 自動で保存しました（${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}）`);
      } catch (err) {
        live.dirty.add(f);
        status(`⚠ 保存できませんでした：${err.message}`);
        throw err;
      } finally {
        live.inflight.delete(f);
      }
    });
    return live.chain[f];
  }
  const flushAll = () => Promise.all(["agenda", "summary", "todos"].map((f) => saveField(f)));

  // 自分が書いている・保存待ち・保存中の項目は、ほかの人の内容で上書きしない
  const mine = (f) => live.focus === f || live.dirty.has(f) || live.inflight.has(f);
  const sameTodos = (a, b) => JSON.stringify(a.map((t) => [t.id, t.title, t.assignee_id || "", t.due_date || "", t.status || ""]))
    === JSON.stringify(b.map((t) => [t.id, t.title, t.assignee_id || "", t.due_date || "", t.status || ""]));
  const flash = (f) => {
    const sec = form.querySelector(`[data-live="${f}"]`);
    sec?.classList.remove("live-updated");
    void sec?.offsetWidth;
    sec?.classList.add("live-updated");
  };

  function apply(r) {
    if (r.blocked && live.focus) {
      toast(`${r.blocked}さんが入力中です。書き終わるまで待ってください`);
      document.activeElement?.blur();
      live.focus = null;
    }
    const before = live.locked.todos;
    live.locked = Object.fromEntries(r.editors.map((e) => [e.field, e.name || "ほかの人"]));
    for (const f of ["agenda", "summary"]) {
      const v = r.minute?.[f] ?? "";
      if (!mine(f) && form[f].value !== v) { form[f].value = v; flash(f); }
      if (canWrite(f)) form[f].readOnly = Boolean(live.locked[f]);
    }
    if (!mine("todos")) {
      const next = r.todos.map((t) => ({ ...t, key: todos.find((x) => x.id === t.id)?.key || newKey() }));
      const drafts = todos.filter((t) => !t.id && !t.title.trim());
      if (!sameTodos(next, todos.filter((t) => t.id || t.title.trim()))) {
        todos = [...next, ...drafts];
        drawTodos();
        flash("todos");
      } else if (before !== live.locked.todos) drawTodos();
    } else if (before !== live.locked.todos) drawTodos();
    for (const h of r.homework) {
      const cb = el.querySelector(`[data-hw="${h.id}"]`);
      if (cb && !cb.disabled) cb.checked = h.status === "done";
    }
    el.querySelectorAll("[data-badge]").forEach((b) => {
      const who = live.locked[b.dataset.badge];
      b.textContent = who ? `✏️ ${who}さんが入力中` : "";
    });
    const v = el.querySelector("#live-viewers");
    if (v) v.textContent = r.viewers.length ? `👥 ${r.viewers.join("、")}さんも開いています` : "";
    counters();
  }

  async function beat() {
    if (live.busy) return;
    live.busy = true;
    try {
      const r = await api(`/api/meetings/${m.id}/live`, { method: "POST", body: { field: live.focus, start: !viewOnly && !live.started } });
      if (r.started_at) {
        live.started = true;
        syncTimerStart(`meeting-${m.id}`, r.started_at);
      }
      apply(r);
    } catch { /* 通信が途切れても、次の合図でやり直す */ } finally {
      live.busy = false;
    }
  }
  // 書きはじめた項目を押さえる。ほかの人が書いている項目には入らない
  form.addEventListener("focusin", (e) => {
    const f = fieldOf(e.target);
    if (!f || f === live.focus) return;
    if (live.locked[f]) { toast(`${live.locked[f]}さんが入力中です`); return; }
    live.focus = f;
    beat();
  });
  form.addEventListener("focusout", () => setTimeout(() => {
    const f = fieldOf(document.activeElement);
    if (f === live.focus) return;
    const left = live.focus;
    live.focus = f;
    (left ? saveField(left) : Promise.resolve()).catch(() => {}).finally(beat);
  }, 200));
  const LIVE_MS = 4000;
  const tick = setInterval(() => {
    if (!document.body.contains(form)) clearInterval(tick);
    else if (!document.hidden) beat();
  }, LIVE_MS);
  beat();

  // 保存ボタン・MTGを終える：自動保存の残りを送ってから、次回の日程（毎回決めるPJ）を送る
  const save = async () => {
    await flushAll();
    return api(`/api/meetings/${m.id}/minutes`, {
      method: "PUT",
      // 毎回決めるPJ：次回の日程（任意）。入っていれば一緒に登録する。「議事録を見る」から保存するときは触れない
      // notify_todos：まだ知らせていない「次回までにやること」の担当に、ここでまとめて知らせる
      body: { next_meeting: !viewOnly && form.next_starts_at?.value ? { starts_at: form.next_starts_at.value, place: form.next_place.value } : undefined, notify_todos: !viewOnly },
    });
  };
  // 保存すると届くお知らせ（確認画面に出す）
  const nameOfUser = (uid) => memberUsers.find((u) => u.id === uid)?.name || state.users.find((u) => u.id === uid)?.name || "";
  const pendingNotices = () => {
    if (viewOnly) return [];
    const lines = todos.filter((t) => t.title.trim() && t.assignee_id && t.assignee_id !== t.notified_assignee)
      .map((t) => `・${nameOfUser(t.assignee_id)}さん：「${t.title.trim()}」の担当になったこと`);
    const next = form.next_starts_at?.value;
    if (next && next !== (data.nextMeeting?.starts_at || "")) lines.push(`・PJメンバー：次回MTGの日程（${fmtDateTime(next)}）`);
    return lines;
  };
  const noticeText = (lines) => (lines.length ? `\n\n次のお知らせが届きます：\n${lines.join("\n")}` : "");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.submitter;
    const lines = pendingNotices();
    if (lines.length && !await confirmDialog(`議事録を保存しますか？${noticeText(lines)}`, { ok: "保存して知らせる" })) return;
    busy(button, async () => {
      const res = await save();
      toast(viewOnly ? "話すことを保存しました" : res.nextMeeting ? `議事録と次回の日程（${fmtDateTime(res.nextMeeting)}）を保存しました` : "議事録を保存しました");
      renderMeeting(el, id);
    }).catch(() => {});
  });

  // MTGを終える：議事録を保存して、タイマーを止め、始めた画面へ戻る（あとから「前回の続き（再開）」で開き直せる）
  el.querySelector("#end-meeting")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!await confirmDialog(`MTGを終えますか？\n議事録を保存して、タイマーを止めます。${noticeText(pendingNotices())}`, { ok: "MTGを終える" })) return;
    busy(b, async () => {
      const res = await save();
      clearTimer(`meeting-${m.id}`);
      // このMTGでどれだけ進んだか：PJ全体の工程のチェックのうち、このMTGで済んだ分を「前 → 後」で見せる
      const pj = await api(`/api/projects/${p.id}`).catch(() => null);
      const items = (pj?.checklist || []).filter((c) => c.stage_no > 0 && !c.skipped_at);
      const doneNow = items.filter((c) => c.done_at);
      const doneHere = doneNow.filter((c) => c.meeting_id === m.id);
      const next = res.nextMeeting ? `次回は ${fmtDateTime(res.nextMeeting)}` : "";
      if (items.length) {
        await celebrateProgress({
          title: doneHere.length ? `このMTGで ${doneHere.length}項目 進みました！` : "MTGを終えました。おつかれさまでした",
          sub: [state.types[p.type]?.stages.find((s) => s.no === pj.project.current_stage)?.name ? `いまの工程：${state.types[p.type].stages.find((s) => s.no === pj.project.current_stage).name}` : "", next].filter(Boolean).join("・"),
          from: doneNow.length - doneHere.length, to: doneNow.length, total: items.length,
          items: doneHere.map((c) => c.label),
        });
      } else {
        toast(next ? `MTGを終えました。${next}です` : "MTGを終えました。おつかれさまでした");
      }
      // 始めた画面へ戻る（ホームから始めたらホーム、カレンダーからならカレンダー、それ以外はPJ画面）
      const from = hashQuery().get("from");
      location.hash = from === "home" ? "#/" : from === "calendar" ? "#/calendar" : `#/projects/${p.id}`;
    }).catch(() => {});
  });
}

// 毎回決めるPJ：議事録の最後に次回の日程を決める（任意。未定のままなら翌朝からリマインドが届く）
function nextMeetingSection({ nextMeeting, meeting: m }, ro) {
  return `
    <section class="card next-date">
      <h2>📅 次回のミーティング日程 <small class="muted">任意</small></h2>
      <p class="muted small">${nextMeeting
        ? `次回は <strong>${fmtDateTime(nextMeeting.starts_at)}</strong> に決まっています。変える場合は日時を直して保存してください。`
        : "MTGの最後に決めましょう。未定のままだと、翌朝からPJメンバーにリマインドが届きます。"}</p>
      <div class="inline-form">
        <input name="next_starts_at" type="datetime-local" min="${esc(m.starts_at)}" value="${esc(nextMeeting?.starts_at || "")}" aria-label="次回の日時" ${ro}>
        <input name="next_place" maxlength="200" placeholder="場所・URL（任意）" value="${esc(nextMeeting?.place || m.place || "")}" ${ro}>
      </div>
    </section>`;
}

// 議事録の各項目を、Notionに貼ると見出し・箇条書き・チェックボックスになるMarkdownにする（項目ごとにコピーできるよう分けておく）
function minutesSections({ previous, form, todos, memberUsers, el }) {
  const nameOf = (id) => memberUsers.find((u) => u.id === id)?.name || "担当未定";
  const block = (title, text) => [`### ${title}`,
    ...(text.trim() ? text.trim().split("\n").map((l) => (/^[-・]/.test(l) ? `- ${l.replace(/^[-・]\s*/, "")}` : l)) : ["（なし）"]), ""];
  const valid = todos.filter((t) => t.title.trim());
  return {
    homework: previous?.homework.length ? ["### 前回の宿題", ...previous.homework.map((t) =>
      `- [${el.querySelector(`[data-hw="${t.id}"]`)?.checked ? "x" : " "}] ${t.title}（${t.assignee_name || "担当未定"}）`), ""] : [],
    agenda: block("今回話し合うこと", form.agenda.value),
    summary: block("概要", form.summary.value),
    todos: ["### 次回までにやること", ...(valid.length
      ? valid.map((t) => `- [ ] ${t.title}（${nameOf(t.assignee_id)}${t.due_date ? `・${fmtDate(t.due_date)}まで` : ""}）`) : ["（なし）"])],
  };
}

function checklistSection({ checklist, meeting: m, project: p }, ro) {
  if (!checklist.length) return "";
  const stageName = (no) => state.types[p.type]?.stages.find((x) => x.no === no)?.name || "";
  return `
    <section class="card">
      <h2>工程のチェック <small class="muted">いまの工程：${esc(stageName(p.current_stage))}</small></h2>
      <details class="help-fold"><summary>ℹ チェックすると？</summary><p class="small">このMTGで済んだ項目にチェックすると、このMTGの議事録に結び付きます。後からPJの「工程」画面で、どの議事録で進んだかを見られます。要らない項目は「スキップ」で飛ばせます。</p></details>
      <ul class="checklist">${checklist.map((c) => `
        <li class="${c.skipped_at ? "is-skipped" : ""}"><label class="check"><input type="checkbox" data-stage-check="${c.id}" ${c.done_at ? "checked" : ""} ${ro || (c.skipped_at ? "disabled" : "")}>
          <span>${c.stage_no !== p.current_stage ? `<span class="tag">工程${c.stage_no}</span> ` : ""}${esc(c.label)}${c.hint ? `<small>${esc(c.hint)}</small>` : ""}</span></label>
          <span class="muted small linked">${!c.done_at ? "" : c.meeting_id === m.id ? "このMTGで完了"
            : c.meeting_id ? `<a href="#/meetings/${c.meeting_id}">${fmtDateTime(c.meeting_starts_at)} のMTGで完了</a>` : "完了"}${c.skipped_at ? "スキップ" : ""}</span>
          ${skipButton(c, ro)}</li>`).join("")}
      </ul>
    </section>`;
}

// PJのリサーチドキュメント（調べたことをメンバーがタブを分けて書くGoogleドキュメント）。MTG中に見ながら議事録を書く
function memoDocSection(p) {
  const embed = embedUrl(p.memo_doc_url);
  return `
    <section class="card memo-doc">
      <div class="section-head"><h2>🔎 リサーチドキュメント</h2>
        ${p.memo_doc_url ? `<a class="button small" href="${esc(p.memo_doc_url)}" target="_blank" rel="noopener">新しいタブで開く</a>` : ""}</div>
      ${embed ? `<div class="doc-frame"><iframe src="${esc(embed)}" title="リサーチドキュメント" loading="lazy"></iframe></div>
        <p class="muted small">表示されないときは、ドキュメントの共有設定を確認するか「新しいタブで開く」を使ってください。書き込みやコメントは「新しいタブで開く」から。</p>`
        : p.memo_doc_url ? `<p class="muted small">このリンクは埋め込み表示できません。「新しいタブで開く」から開いてください。</p>`
        : `<p class="muted small">リサーチドキュメントが未登録です。<a href="#/projects/${p.id}/edit">PJの「編集」</a>から登録すると、ここに表示されます。</p>`}
    </section>`;
}
