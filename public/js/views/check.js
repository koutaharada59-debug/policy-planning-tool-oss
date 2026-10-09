// 確認する：各画面への入口だけを並べる（ここには情報を置かない。お知らせの未読数だけボタンに出す）
// カレンダー・PJ・PJ決めは、画面の下（PCでは上）のメニューからいつでも開けるので、ここには置かない
import { api, state } from "../lib.js";

const ITEMS = [
  ["#/notices", "🔔", "お知らせ", "担当になったタスク・MTGの追加や変更・確認待ちのヒアリングなど", null, "notices"],
  ["#/my-tasks", "✅", "自分のタスク", "自分が担当のタスクを、すべてのPJからまとめて"],
  ["#/sources", "📚", "資料", "部門で集めた資料と、一次出典の確認状態"],
  ["#/hearings", "🤝", "外部ヒアリング", "申請の一覧・承認・実施後の要点", (me) => me.canSeeHearings],
];

export async function renderCheck(el) {
  el.innerHTML = `
    <div class="page-heading"><h1>🔍 確認する</h1></div>
    <div class="choices check-choices">
      ${ITEMS.filter(([, , , , visible]) => !visible || visible(state.me)).map(([href, icon, label, note, , badge]) => `
        <a class="choice" href="${href}">
          <span class="choice-icon">${icon}</span>
          <strong>${label}</strong>
          ${badge ? `<span class="choice-badge" data-badge="${badge}" hidden></span>` : ""}
        </a>`).join("")}
    </div>`;
  const { unread } = await api("/api/notices?count=1").catch(() => ({ unread: 0 }));
  const badge = el.querySelector('[data-badge="notices"]');
  if (badge && unread) {
    badge.textContent = `未読 ${unread}件`;
    badge.hidden = false;
  }
}
