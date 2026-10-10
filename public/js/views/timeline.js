// タイムライン：部門で起きたこと（PJの始まり・工程の完了・議事録・定例の進捗・発表・完了・政策の種・定例）を新しい順に
import { api, esc, avatar, fmtDate, todayStr, addDays, jstDateTime } from "../lib.js";

let mine = false; // 自分のPJだけにするか（画面を開いているあいだだけ覚える）

export async function renderTimeline(el) {
  const { items, days } = await api(`/api/timeline${mine ? "?mine=1" : ""}`);
  const today = todayStr();
  const dayLabel = (d) => (d === today ? "今日" : d === addDays(today, -1) ? "昨日" : fmtDate(d));
  let day = "";
  el.innerHTML = `
    <div class="page-heading left"><h1>🕒 タイムライン</h1>
      <p class="muted small">部門で起きたことを新しい順に（この${days}日）。</p></div>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${!mine}" data-mine="0">部門全体</button>
      <button role="tab" aria-selected="${mine}" data-mine="1">自分のPJ</button>
    </div>
    ${items.length ? `<ul class="timeline">${items.map((i) => {
      const at = jstDateTime(i.at);
      const d = at.slice(0, 10);
      const head = d !== day ? `<li class="timeline-day">${dayLabel(d)}</li>` : "";
      day = d;
      return `${head}
      <li class="timeline-item kind-${i.kind}">
        <a href="${i.href}">
          <span class="timeline-icon" aria-hidden="true">${i.icon}</span>
          <span class="timeline-body">
            <span class="timeline-text">${esc(i.text)}</span>
            <small class="muted">${at.slice(11, 16)}${i.actor ? `・${avatar(i.actor)} ${esc(i.actor.name)}` : ""}</small>
          </span>
        </a>
      </li>`;
    }).join("")}</ul>` : `<div class="empty"><p>この${days}日の出来事はまだありません。</p></div>`}`;
  el.querySelectorAll("[data-mine]").forEach((b) => b.addEventListener("click", () => {
    mine = b.dataset.mine === "1";
    renderTimeline(el);
  }));
}
