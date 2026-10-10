// ミーティングを始める：PJを選ぶ → 「予定していたMTG」か「臨時のMTG」かを選ぶ → 議事録を開く
import { api, esc, fmtDateTime, busy, toast, jstDateTime, todayStr, pjPicker, pickItem, hashQuery } from "../lib.js";

export async function renderStart(el) {
  const { projects } = await api("/api/meeting-start");

  el.innerHTML = `
    <div class="page-heading left"><h1>🗣️ どのPJのMTGですか？</h1></div>
    ${pjPicker(projects, (p) => pickItem({ attrs: `data-now="${p.id}"`, name: p.name, after: `<div class="pick-slot" data-slot></div>` }))}`;

  // PJを押すと、その下に「予定していたMTG／臨時のMTG」が出る（もう一度押すと閉じる）
  el.querySelectorAll("[data-now]").forEach((b) => b.addEventListener("click", () => {
    const p = projects.find((x) => x.id === Number(b.dataset.now));
    const slot = b.nextElementSibling;
    if (slot.innerHTML) {
      slot.innerHTML = "";
      b.classList.remove("is-open");
      return;
    }
    el.querySelectorAll("[data-slot]").forEach((x) => { x.innerHTML = ""; });
    el.querySelectorAll(".pick.is-open").forEach((x) => x.classList.remove("is-open"));
    b.classList.add("is-open");
    const show = (html) => {
      slot.innerHTML = html;
      slot.querySelector("[data-choose]")?.addEventListener("click", choose);
    };
    const back = `<button type="button" data-choose>← 選び直す</button>`;

    // 1) 予定していたMTGか、臨時のMTGかを選ぶ
    const choose = () => {
      show(`<div class="confirm-start">
        <button class="primary" data-kind="planned">📅 予定していたMTG</button>
        <button data-kind="adhoc">⚡ 臨時のMTG</button>
        ${p.recent.length ? `<button data-kind="resume">↩ 前回の続き（再開）</button>` : ""}
      </div>`);
      slot.querySelector('[data-kind="resume"]')?.addEventListener("click", resume);
      slot.querySelector('[data-kind="planned"]').addEventListener("click", planned);
      slot.querySelector('[data-kind="adhoc"]').addEventListener("click", adhoc);
    };

    // 2a) 予定されているMTGの一覧から選ぶ（押すと議事録が開く）
    const planned = () => {
      const today = todayStr();
      show(`<div class="confirm-start">
        ${p.upcoming.length ? `<ul class="planned-list">${p.upcoming.map((m, i) => `
          <li><div><strong>${fmtDateTime(m.starts_at)}</strong>${m.starts_at.startsWith(today) ? `<span class="tag">今日</span>` : ""}
            ${m.place ? `<span class="muted small">${esc(m.place)}</span>` : ""}</div>
            <a class="button ${i === 0 ? "primary" : ""}" href="#/meetings/${m.id}">このMTGを始める</a></li>`).join("")}</ul>`
          : `<p class="muted small">予定されているMTGはありません。臨時で始めてください。</p>`}
        <div class="form-actions">${back}</div>
      </div>`);
    };

    // 2c) 再開：最近のMTGの議事録の続きを書く
    const resume = () => {
      show(`<div class="confirm-start">
        <ul class="planned-list">${p.recent.map((m, i) => `
          <li><div><strong>${fmtDateTime(m.starts_at)}</strong>${m.has_minutes ? "" : `<span class="tag">議事録なし</span>`}
            ${m.place ? `<span class="muted small">${esc(m.place)}</span>` : ""}</div>
            <a class="button ${i === 0 ? "primary" : ""}" href="#/meetings/${m.id}">このMTGを再開する</a></li>`).join("")}</ul>
        <div class="form-actions">${back}</div>
      </div>`);
    };

    // 2b) 臨時：押してもすぐには作らず、日時・場所を確かめる（「この内容で始める」で初めて作る）
    const adhoc = () => {
      show(`<form class="confirm-start">
        <p><strong>この内容で臨時のMTGを始めますか？</strong><br><small class="muted">PJメンバーにお知らせが届きます。</small></p>
        <label class="small">日時<input name="starts_at" type="datetime-local" required value="${nowRounded()}"></label>
        <label class="small">場所・URL（任意）<input name="place" maxlength="200"></label>
        <div class="form-actions">${back}<button class="primary">この内容で始める</button></div>
      </form>`);
      const box = slot.querySelector("form");
      box.starts_at.focus();
      box.addEventListener("submit", (e) => {
        e.preventDefault();
        const startsAt = box.starts_at.value;
        busy(e.submitter, () => api(`/api/projects/${p.id}/meetings`, { method: "POST", body: { starts_at: startsAt, place: box.place.value } }))
          .then((res) => {
            toast(`${fmtDateTime(startsAt)} のMTGを始めました`);
            location.hash = `#/meetings/${res.id}`;
          }).catch(() => {});
      });
    };

    choose();
  }));
  // PJ画面から来たときはそのPJ、参加しているPJが1つだけならそのPJを、最初から開いておく（押す手間を1回減らす）
  const from = Number(hashQuery().get("project"));
  const mine = projects.filter((p) => p.is_mine);
  const openId = projects.some((p) => p.id === from) ? from : mine.length === 1 ? mine[0].id : null;
  if (openId) {
    const b = el.querySelector(`[data-now="${openId}"]`);
    b?.closest("details")?.setAttribute("open", "");
    b?.click();
  }
}

// 今の日本時間を5分単位に切り下げたもの（'YYYY-MM-DDTHH:MM'）。押した時点の時刻を使う
function nowRounded() {
  const now = Date.now();
  return jstDateTime(now - (now % (5 * 60 * 1000)));
}
