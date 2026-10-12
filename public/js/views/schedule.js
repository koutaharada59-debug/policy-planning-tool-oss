// 期日を設定する（管理者だけ）：工程の目安日程（部門の基本）を変える。PJごとに手で変えた期限はそのまま
import { api, esc, state, busy, toast, confirmDialog, fmtDateTime, jstDateTime } from "../lib.js";

const week = (day) => Math.floor(day / 7) + 1;
const span = (a, b) => (week(a) === week(b) ? `${week(a)}週目` : `${week(a)}〜${week(b)}週目`);

export async function renderSchedule(el) {
  if (!state.me.isAdmin) throw new Error("期日を設定できるのは管理者です");
  const data = await api("/api/admin/schedule");
  const { current, base } = data;
  // 画面では「◯日目」（1日目＝PJの開始日）で見せる。保存は開始日からの日数（0〜）
  const rows = current.stages.filter((s) => s.schedule.fromStart && s.schedule.fromStart[0] >= 0);
  const baseOf = (no) => base.stages.find((s) => s.no === no).schedule;
  const finalStage = current.stages.find((s) => s.schedule.afterPresentation);

  el.innerHTML = `
    <nav class="breadcrumb"><a href="#/projects">PJ</a> / 期日を設定する</nav>
    <div class="page-heading left"><h1>🗓 期日を設定する</h1>
      <p>工程ごとの目安の日程（部門の基本）です。<strong>1日目＝PJの開始日</strong>（1週目の初日）として数えます。
        PJごとに手で変えた期限は、そのまま残ります。</p></div>
    <form class="card form" id="schedule-form">
      <div class="gantt-help small muted">棒の<strong>両端</strong>をつかんで横に動かすと開始・期限が、<strong>真ん中</strong>をつかむと工程ごと動きます。◆ は最終発表の日です。</div>
      <div class="gantt-wrap"><div class="gantt" id="gantt"></div></div>
      <details class="fold schedule-numbers"><summary>数字で細かく直す</summary>
      <div class="table-wrap"><table class="schedule-table">
        <thead><tr><th>工程</th><th>開始</th><th>期限</th><th>目安</th></tr></thead>
        <tbody>
          ${rows.map((s) => {
            const [a, b] = s.schedule.fromStart;
            const def = baseOf(s.no).fromStart;
            const prep = s.schedule.beforePresentation;
            return `<tr data-no="${s.no}" data-prep="${prep ? 1 : ""}">
              <th>${s.no}. ${esc(s.name)}</th>
              <td><input type="number" name="a-${s.no}" min="1" max="181" value="${a + 1}" aria-label="${esc(s.name)}の開始"> 日目
                <small class="muted">既定 ${def[0] + 1}</small></td>
              <td>${prep ? `<span class="muted small">発表の前日まで</span>`
                : `<input type="number" name="b-${s.no}" min="1" max="181" value="${b + 1}" aria-label="${esc(s.name)}の期限"> 日目
                  <small class="muted">既定 ${def[1] + 1}</small>`}</td>
              <td class="schedule-span" data-span></td></tr>`;
          }).join("")}
          <tr><th>${current.stages.find((s) => s.schedule.presentation)?.no}. 最終発表の日<br><small class="muted">発表日を決めていないPJ</small></th>
            <td colspan="2"><input type="number" name="presentationDay" min="8" max="201" value="${current.presentationDay + 1}" aria-label="最終発表の日"> 日目
              <small class="muted">既定 ${base.presentationDay + 1}</small></td>
            <td class="schedule-span" data-span-pres></td></tr>
          <tr><th>${finalStage.no}. ${esc(finalStage.name)}</th>
            <td colspan="2">発表のあと <input type="number" name="finalDays" min="7" max="120" value="${finalStage.schedule.afterPresentation[1]}" aria-label="修正・最終提出の日数"> 日間
              <small class="muted">既定 ${baseOf(finalStage.no).afterPresentation[1]}</small></td>
            <td class="schedule-span" data-span-final></td></tr>
        </tbody></table></div>
      </details>
      <p class="muted small">保存すると、進行中のPJ（${data.activeProjects}件）の「手で変えていない期限」も、新しい目安に合わせて計算し直します。
        ${data.updated ? `最後に変えた人：${esc(data.updated.name || "")}（${fmtDateTime(jstDateTime(data.updated.updated_at))}）` : "いまはマニュアルどおりの既定の目安です。"}</p>
      <div class="form-actions">
        ${data.customized ? `<button type="button" id="schedule-reset">既定の目安に戻す</button>` : ""}
        <button class="primary">保存する</button>
      </div>
    </form>`;

  const form = el.querySelector("#schedule-form");
  const num = (name) => Number(form[name]?.value) - 1;
  // 入れた日から「〇〜〇週目」を、その場で出す
  const drawSpans = () => {
    const pres = num("presentationDay");
    form.querySelectorAll("tr[data-no]").forEach((tr) => {
      const no = tr.dataset.no;
      const a = num(`a-${no}`);
      const b = tr.dataset.prep ? pres - 1 : num(`b-${no}`);
      tr.querySelector("[data-span]").textContent = Number.isFinite(a) && Number.isFinite(b) ? span(a, b) : "";
    });
    el.querySelector("[data-span-pres]").textContent = `${week(pres)}週目`;
    el.querySelector("[data-span-final]").textContent = `約${Math.round((Number(form.finalDays.value) || 0) / 7)}週間`;
  };
  // ---------- 見える化：週ごとの線の上に、工程の棒（つかんで動かせる） ----------
  const gantt = el.querySelector("#gantt");
  const presNo = current.stages.find((s) => s.schedule.presentation)?.no;
  const setNum = (name, v) => { if (form[name]) form[name].value = v + 1; };
  const values = () => {
    const pres = num("presentationDay");
    const final = Number(form.finalDays.value) || 28;
    return {
      pres, final,
      rows: rows.map((s) => {
        const prep = Boolean(s.schedule.beforePresentation);
        return { no: s.no, name: s.name, prep, a: num(`a-${s.no}`), b: prep ? pres - 1 : num(`b-${s.no}`) };
      }),
    };
  };
  const drawGantt = () => {
    const v = values();
    const total = Math.ceil((v.pres + v.final + 8) / 7) * 7;
    const pct = (d) => `${(d / total) * 100}%`;
    const weeks = Array.from({ length: total / 7 }, (_, i) => i);
    const bar = (cls, a, b, attrs, label) => `<div class="g-bar ${cls}" style="left:${pct(a)};width:${pct(b - a + 1)}" ${attrs}>
      <span class="g-handle is-left" data-edge="a"></span><span class="g-label">${label}</span><span class="g-handle is-right" data-edge="b"></span></div>`;
    gantt.innerHTML = `
      <div class="g-row g-head"><div class="g-name"></div><div class="g-track">${weeks.map((w) => `<span class="g-week" style="left:${pct(w * 7)};width:${pct(7)}">${w + 1}週</span>`).join("")}</div></div>
      ${v.rows.map((r) => `<div class="g-row"><div class="g-name">${r.no}. ${esc(r.name)}</div><div class="g-track">
        ${weeks.map((w) => `<span class="g-line" style="left:${pct(w * 7)}"></span>`).join("")}
        ${bar(r.prep ? "is-prep" : "", r.a, r.b, `data-no="${r.no}" data-kind="${r.prep ? "prep" : "range"}"`, span(r.a, r.b))}</div></div>`).join("")}
      <div class="g-row"><div class="g-name">${presNo}. 最終発表</div><div class="g-track">
        ${weeks.map((w) => `<span class="g-line" style="left:${pct(w * 7)}"></span>`).join("")}
        <div class="g-pres" style="left:${pct(v.pres)}" data-kind="pres" title="最終発表の日（ドラッグで動かせる）"><span>◆</span><small>${week(v.pres)}週目</small></div></div></div>
      <div class="g-row"><div class="g-name">${finalStage.no}. ${esc(finalStage.name)}</div><div class="g-track">
        ${weeks.map((w) => `<span class="g-line" style="left:${pct(w * 7)}"></span>`).join("")}
        ${bar("is-final", v.pres + 1, v.pres + v.final, `data-kind="final"`, `約${Math.round(v.final / 7)}週間`)}</div></div>`;
    gantt.dataset.total = total;
  };
  // つかんで動かす（1日単位で吸着）
  let drag = null;
  gantt.addEventListener("pointerdown", (e) => {
    const target = e.target.closest("[data-kind]");
    if (!target) return;
    e.preventDefault();
    const v = values();
    const r = v.rows.find((x) => String(x.no) === target.dataset.no);
    drag = { kind: target.dataset.kind, no: target.dataset.no, edge: e.target.dataset.edge || "move", x0: e.clientX,
      dayW: gantt.querySelector(".g-track").getBoundingClientRect().width / Number(gantt.dataset.total), v, r };
    gantt.classList.add("is-dragging");
    target.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const d = Math.round((e.clientX - drag.x0) / drag.dayW);
    const { kind, edge, v, r } = drag;
    const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
    if (kind === "range" || kind === "prep") {
      let a = r.a, b = r.b;
      if (edge === "a") a = clamp(r.a + d, 0, b);
      else if (edge === "b" && kind === "range") b = clamp(r.b + d, a, 180);
      else if (edge === "move" || (edge === "b" && kind === "prep")) {
        if (kind === "prep") a = clamp(r.a + d, 0, v.pres - 1);
        else { const len = r.b - r.a; a = clamp(r.a + d, 0, 180 - len); b = a + len; }
      }
      setNum(`a-${r.no}`, a);
      if (kind === "range") setNum(`b-${r.no}`, b);
    } else if (kind === "pres") {
      setNum("presentationDay", clamp(v.pres + d, 7, 200));
    } else if (kind === "final") {
      if (edge === "move" || edge === "a") setNum("presentationDay", clamp(v.pres + d, 7, 200));
      else form.finalDays.value = clamp(v.final + d, 7, 120);
    }
    drawSpans();
    drawGantt();
  });
  window.addEventListener("pointerup", () => { if (drag) { drag = null; gantt.classList.remove("is-dragging"); } });
  drawSpans();
  drawGantt();
  form.addEventListener("input", () => { drawSpans(); drawGantt(); });

  const save = async (button, body, message) => {
    if (!await confirmDialog(message, { ok: "保存する" })) return;
    busy(button, () => api("/api/admin/schedule", { method: "PUT", body }))
      .then(async (res) => {
        state.types = (await api("/api/me")).types; // 画面の「〇〜〇週目」の説明も新しくする
        toast(`保存しました（進行中のPJ ${res.updatedProjects}件の期限を計算し直しました）`);
        renderSchedule(el);
      }).catch(() => {});
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const stages = {};
    form.querySelectorAll("tr[data-no]").forEach((tr) => {
      const no = tr.dataset.no;
      stages[no] = [num(`a-${no}`), tr.dataset.prep ? null : num(`b-${no}`)];
    });
    save(e.submitter, { stages, presentationDay: num("presentationDay"), finalDays: Number(form.finalDays.value) },
      `工程の目安日程を保存しますか？\n進行中のPJ ${data.activeProjects}件の、手で変えていない期限も新しい目安に合わせます。`);
  });
  el.querySelector("#schedule-reset")?.addEventListener("click", (e) =>
    save(e.currentTarget, { reset: true }, "マニュアルどおりの既定の目安に戻しますか？\n進行中のPJの、手で変えていない期限も既定に合わせます。"));
}
