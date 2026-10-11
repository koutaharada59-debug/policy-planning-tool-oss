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
  drawSpans();
  form.addEventListener("input", drawSpans);

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
