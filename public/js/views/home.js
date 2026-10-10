// ホーム：やりたいことを選ぶ（ミーティング・確認・発表・定例）
import { api, esc, state, todayStr } from "../lib.js";

export async function renderHome(el) {
  el.innerHTML = `
    <div class="page-heading">
      <h1>${esc(state.me.name)}さん、今日は何をしますか？</h1>
    </div>
    <div class="choices">
      <a class="choice" href="#/start">
        <span class="choice-icon">🗣️</span>
        <strong>ミーティングを始める</strong>
        <span class="choice-badge" id="badge-start" hidden></span>
      </a>
      <a class="choice" href="#/check">
        <span class="choice-icon">🔍</span>
        <strong>確認する</strong>
        <span class="choice-badge" id="badge-check" hidden></span>
      </a>
      <a class="choice" href="#/present">
        <span class="choice-icon">🎤</span>
        <strong>発表する</strong>
      </a>
      <a class="choice" href="#/teirei">
        <span class="choice-icon">🏛️</span>
        <strong>定例</strong>
        <span class="choice-badge" id="badge-teirei" hidden></span>
      </a>
    </div>
    ${state.me.isAdmin ? `<p class="home-admin"><a class="button small" href="#/admin">🛠️ 管理者メニュー</a></p>` : ""}`;

  // 今日のMTGの件数を、選択肢の上に小さく出す（読み込みに失敗しても選択肢は使える）
  try {
    const [start, notices, teirei] = await Promise.all([api("/api/meeting-start"), api("/api/notices?count=1"), api("/api/dept-schedules").catch(() => null)]);
    // 今日が部門の定例の日なら、時刻を出す（進行中なら「進行中」）
    const next = teirei?.upcoming?.[0];
    if (next?.starts_at.startsWith(teirei.today)) {
      show(el.querySelector("#badge-teirei"), next.meeting?.is_open ? "今日の定例・進行中" : `今日 ${next.starts_at.slice(11, 16)}から`);
    }
    show(el.querySelector("#badge-check"), notices.unread ? `お知らせ ${notices.unread}件` : "");
    const todayMeetings = start.projects.filter((p) => p.is_mine).flatMap((p) => p.upcoming)
      .filter((m) => m.starts_at.startsWith(todayStr())).length;
    show(el.querySelector("#badge-start"), todayMeetings ? `今日のMTG ${todayMeetings}件` : "");
  } catch {
    // バッジは補助なので、出せなくても何もしない
  }
}

function show(badge, text) {
  if (!badge || !text) return;
  badge.textContent = text;
  badge.hidden = false;
}
