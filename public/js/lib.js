// 画面共通の小道具。データはすべてサーバーに保存し、ブラウザには何も残さない

// ログイン中の情報（ユーザー・メンバー一覧・PJの型）。画面間で共有するだけで、ブラウザには保存しない
export const state = { me: null, users: [], types: {}, showDoneTasks: false };

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (res.status === 401) {
    location.href = `/?returnTo=${encodeURIComponent(location.pathname + location.hash)}`;
    throw new Error("ログインしてください");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "通信に失敗しました");
  return data;
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export { WEEK };

export function fmtDate(date) {
  if (!date) return "";
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEK[d.getUTCDay()]}）`;
}

export function fmtDateTime(dt) {
  if (!dt) return "";
  return `${fmtDate(dt)} ${dt.slice(11, 16)}`;
}

// 日本時間の 'YYYY-MM-DDTHH:MM'（ms を省くと今）
export function jstDateTime(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 16);
}

export function todayStr() {
  return jstDateTime().slice(0, 10);
}

export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 次の月曜日（PJの開始日の初期値）
export function nextMonday() {
  const t = todayStr();
  const wd = new Date(`${t}T00:00:00Z`).getUTCDay();
  return addDays(t, ((8 - wd) % 7) || 7);
}

function daysUntil(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayStr()}T00:00:00Z`)) / 86400000);
}

// 期限のバッジ（過ぎた／今日／あと何日）
export function dueBadge(date, done = false) {
  if (!date) return "";
  if (done) return `<span class="due">${fmtDate(date)}</span>`;
  const n = daysUntil(date);
  const cls = n < 0 ? "due is-over" : n <= 2 ? "due is-soon" : "due";
  const note = n < 0 ? `${-n}日超過` : n === 0 ? "今日" : `あと${n}日`;
  return `<span class="${cls}">${fmtDate(date)}・${note}</span>`;
}

export function avatar(user, size = "") {
  if (!user) return "";
  const inner = user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : esc((user.name || "?").slice(0, 1));
  return `<span class="avatar ${size}" title="${esc(user.name)}">${inner}</span>`;
}

// Googleカレンダーの「予定を追加」画面を開くURL（OAuth不要）
function gcalStamp(dt) {
  return `${dt.replace(/[-:]/g, "")}00`;
}

function addMinutes(dt, minutes) {
  const d = new Date(`${dt}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}

export function gcalEventUrl({ title, start, durationMin = 60, details = "", location = "", recur = "" }) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${gcalStamp(start)}/${gcalStamp(addMinutes(start, durationMin))}`,
    ctz: "Asia/Tokyo",
  });
  if (details) p.set("details", details);
  if (location) p.set("location", location);
  if (recur) p.set("recur", `RRULE:${recur}`);
  return `https://calendar.google.com/calendar/render?${p}`;
}

// 終日の予定（タスクの期限など）
export function gcalAllDayUrl({ title, date, details = "" }) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${date.replace(/-/g, "")}/${addDays(date, 1).replace(/-/g, "")}`,
    ctz: "Asia/Tokyo",
  });
  if (details) p.set("details", details);
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function gcalLink(url, label = "Googleカレンダーに追加") {
  return `<a class="gcal" href="${esc(url)}" target="_blank" rel="noopener">${calendarIcon}${label}</a>`;
}

// 定例（毎週・隔週など）の繰り返しのルール。weekdays：曜日の番号（"1,4" または [1, 4]）
export function weeklyRrule(weekdays, interval = 1) {
  const days = (Array.isArray(weekdays) ? weekdays : String(weekdays || "").split(",")).filter((d) => d !== "").map(Number);
  return days.length ? `FREQ=WEEKLY;INTERVAL=${interval || 1};WKST=SU;BYDAY=${days.map((d) => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(",")}` : "";
}

// 定例の回をカレンダーに入れるとき：「この回だけ」か「毎回（繰り返し）」かを選べるようにする。series がなければふつうのリンク
export function gcalChoice(single, series, label = "Googleカレンダーに追加") {
  if (!series) return gcalLink(single, label);
  return `<details class="gcal-choice">
    <summary class="gcal">${calendarIcon}${label}</summary>
    <div class="gcal-menu">
      <a href="${esc(single)}" target="_blank" rel="noopener">この回だけ追加</a>
      <a href="${esc(series)}" target="_blank" rel="noopener">定例をまとめて追加（毎回くり返し）</a>
    </div>
  </details>`;
}
// メニューの外を押したとき・選んだときは閉じる
document.addEventListener("click", (e) => {
  document.querySelectorAll(".gcal-choice[open]").forEach((d) => {
    if (!d.contains(e.target) || e.target.closest(".gcal-menu a")) d.removeAttribute("open");
  });
});

const calendarIcon = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2Zm12 8H5v9h14v-9ZM5 8h14V6H5v2Zm2 4h4v4H7v-4Z"/></svg>`;

let toastTimer;
export function toast(message, kind = "") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.className = `toast show ${kind}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3200);
}

// 送信中はボタンを止めて、失敗したらトーストで知らせる
export async function busy(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } catch (e) {
    if (!e.silent) toast(e.message, "error"); // 確認画面で「キャンセル」したときなどは出さない
    throw e;
  } finally {
    if (button) button.disabled = false;
  }
}

// PJメンバーを先に、ほかのメンバーを後ろに並べる（担当者を選ぶとき用）
export function membersFirst(members, users = state.users) {
  const ids = new Set(members.map((m) => m.id));
  return [...members, ...users.filter((u) => !ids.has(u.id))];
}

export function memberOptions(users, selected, { empty = "（未定）" } = {}) {
  return `<option value="">${esc(empty)}</option>` +
    users.map((u) => `<option value="${esc(u.id)}" ${u.id === selected ? "selected" : ""}>${esc(u.name)}</option>`).join("");
}

// Googleドキュメント・スライド・スプレッドシートは、埋め込み用のURLに変える（ほかは埋め込まない）
export function embedUrl(url) {
  const m = (url || "").match(/^https:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
  if (!m) return null;
  const [, kind, id] = m;
  if (kind === "presentation") return `https://docs.google.com/presentation/d/${id}/embed`;
  return `https://docs.google.com/${kind}/d/${id}/preview`;
}

// 工程の数直線（PJ画面の上部とPJ一覧のカードで共通）。compact：カード用に日付を曜日なしで短く
// progress：いまの工程のチェックの進み具合（0〜1）。次の工程への線が、その分だけ伸びる
export function stageStepper(project, stages, { compact = false, progress = null } = {}) {
  const type = state.types[project.type];
  if (!type) return "";
  const done = project.status === "done";
  const due = (no) => stages.find((s) => s.stage_no === no)?.due_date;
  return `<ol class="stepper">${type.stages.map((s) => {
    const past = done || s.no < project.current_stage;
    const cls = past ? "is-done" : s.no === project.current_stage ? "is-current" : "";
    const isNext = !done && progress !== null && s.no === project.current_stage + 1;
    return `<li class="${cls}${isNext ? " is-next" : ""}" ${isNext ? `style="--fill:${progress.toFixed(3)}"` : ""}><span class="dot">${past ? "✓" : s.no}</span>
      <span class="label">${esc(s.name)}</span><span class="date">${due(s.no) ? (compact ? due(s.no).slice(5).replace("-", "/").replace(/(^|\/)0/g, "$1") : fmtDate(due(s.no))) : ""}</span></li>`;
  }).join("")}</ol>`;
}

// 議事録などを、Notionに貼ると見出し・箇条書き・チェックボックスになるMarkdownでコピーする
export async function copyForNotion(markdown) {
  await copyText(`${markdown.trim()}\n`);
  toast("Notion用にコピーしました。Notionに貼り付けてください");
}

// 項目ごとのコピーボタン。押すと bindCopyButtons に渡した関数で、その項目のMarkdownを作ってコピーする
export const copyButton = (key) => `<button type="button" class="copy-btn" data-copy="${esc(key)}" title="この項目をNotion用にコピー">📋 コピー</button>`;

export function bindCopyButtons(el, toMarkdown) {
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy]");
    if (b) copyForNotion(toMarkdown(b.dataset.copy));
  });
}

// 役割（role）から工程番号を探す（工程を足しても番号に頼らないように）
export function stageNoOf(type, role) {
  return state.types[type]?.stages.find((s) => s.role === role)?.no;
}

// 「完了したタスクも表示」の切り替え。選んだ状態は画面を移っても続く（ブラウザには保存しない）
export const doneTasksToggle = (count) =>
  `<label class="check small"><input type="checkbox" data-show-done ${state.showDoneTasks ? "checked" : ""}> 完了したタスクも表示${count === undefined ? "" : `（${count}）`}</label>`;

export function bindDoneTasksToggle(root, redraw) {
  root.querySelector("[data-show-done]")?.addEventListener("change", (e) => {
    state.showDoneTasks = e.target.checked;
    redraw();
  });
}

// PJを選ぶだけの途中のページ用：PJ名だけを並べる（参加中を上に、ほかのPJは折りたたむ）
// 詳しい情報は、選んだ先のページに出す
export function pjPicker(projects, item, { empty = "参加している進行中のPJがありません。" } = {}) {
  const isMine = (p) => Boolean(p.isMine ?? p.is_mine);
  const mine = projects.filter(isMine);
  const others = projects.filter((p) => !isMine(p));
  const list = (ps) => `<ul class="pick-list">${ps.map(item).join("")}</ul>`;
  if (!projects.length) return `<div class="empty"><p>${empty}</p></div>`;
  return `${mine.length ? list(mine) : `<p class="muted">${empty}</p>`}
    ${others.length ? `<details class="pick-others"><summary>ほかのPJ（${others.length}）</summary>${list(others)}</details>` : ""}`;
}

// リストの1行。href があればリンク、なければボタン（attrs で data-* を渡す）。after は行の下に出す欄
export const pickItem = ({ href, attrs = "", name, note = "", after = "" }) => `
  <li>${href ? `<a class="pick" href="${href}">` : `<button type="button" class="pick" ${attrs}>`}
    <span class="pick-name">${esc(name)}</span>${note ? `<span class="pick-note">${note}</span>` : ""}<span class="pick-arrow" aria-hidden="true">›</span>
  ${href ? "</a>" : "</button>"}${after}</li>`;

export function hashQuery() {
  return new URLSearchParams(location.hash.split("?")[1] || "");
}

export const TASK_STATUS ={ todo: "未着手", doing: "進行中", done: "完了" };

export function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// ページ内の確認ダイアログ。ブラウザ標準の confirm() は、アプリ内ブラウザ（Discordアプリなど）で出ないことがあるので使わない
// 削除・取り消しなど元に戻せない操作は、OKボタンを赤くする
export function confirmDialog(message, { ok } = {}) {
  const danger = /削除|外し|取り下げ|中止|取り消/.test(message);
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "dialog-backdrop";
    back.innerHTML = `
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-msg">
        <p id="dialog-msg">${esc(message)}</p>
        <div class="form-actions">
          <button type="button" data-no>キャンセル</button>
          <button type="button" class="${danger ? "danger" : "primary"}" data-yes>${esc(ok || (danger ? "はい、実行する" : "OK"))}</button>
        </div>
      </div>`;
    const prev = document.activeElement;
    const done = (value) => {
      back.remove();
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    back.addEventListener("click", (e) => { if (e.target === back) done(false); });
    back.querySelector("[data-no]").addEventListener("click", () => done(false));
    back.querySelector("[data-yes]").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey);
    document.body.append(back);
    back.querySelector("[data-yes]").focus();
  });
}

// ---------- タイマー（MTG・定例は自動で開始、発表は手動） ----------
// 状態は開いているあいだだけ覚える（ブラウザには保存しない）。key ごとに、画面を移って戻っても続きから数える
const timers = new Map();
const fmtElapsed = (ms) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec % 60).padStart(2, "0")}`;
};

// auto：開いたら自動で数え始める。since：この時刻（ms）から数える（定例を始めた時刻など）。target：目標時間を選べるようにする（発表）
// bar：スクロールしても画面の上に残る1行のタイマー。経過時間で色が変わる（MTG・定例）
export function timerHtml(key, { target = false, bar = false } = {}) {
  return `<div class="timer ${bar ? "timer-bar" : ""}" data-timer="${esc(key)}">
    <span class="timer-icon" aria-hidden="true">⏱</span><span class="timer-time" aria-live="off">0:00</span>
    <span class="timer-note muted small"></span>
    ${target ? `<select class="timer-target" aria-label="目標時間"><option value="0">目標なし</option>${[3, 5, 7, 10, 15, 20, 30].map((m) => `<option value="${m}">${m}分</option>`).join("")}</select>` : ""}
    <button type="button" class="small timer-toggle"></button>
    <button type="button" class="small timer-reset" aria-label="リセット">↺</button>
  </div>`;
}

// MTGの長さの目安の色：緑 →（1時間に近づくと）青 →（1時間を過ぎると）赤 →（1時間半で）紫
const TIME_COLORS = [[0, [46, 157, 91]], [50, [47, 111, 214]], [60, [47, 111, 214]], [66, [217, 48, 48]], [75, [217, 48, 48]], [90, [122, 31, 143]]];
function timeColor(min) {
  const i = TIME_COLORS.findIndex(([m]) => m > min);
  if (i === -1) return `rgb(${TIME_COLORS.at(-1)[1].join(",")})`;
  const [m0, c0] = TIME_COLORS[i - 1];
  const [m1, c1] = TIME_COLORS[i];
  const r = (min - m0) / (m1 - m0);
  return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * r)).join(",")})`;
}

// 自動で数えはじめたタイマーの起点を、あとから正しい時刻（サーバーに記録したMTGの開始時刻）に合わせる
// 一時停止・リセットなど、手で触ったタイマーは変えない
export function syncTimerStart(key, since) {
  const t = timers.get(key);
  if (!t || !since || t.touched || !t.startedAt) return;
  t.elapsed = 0;
  t.startedAt = Math.min(since, Date.now());
}

// 目標時間に対する割合（1＝目標ちょうど）で色を出す。緑 → 目標に近づくと青 → 目標を過ぎると赤 → 1.5倍で紫
export const ratioColor = (ratio) => timeColor(ratio * 60);
export const fmtClock = (ms) => fmtElapsed(ms);

export function bindTimer(root, key, { auto = false, since = null } = {}) {
  const box = root.querySelector(`[data-timer="${CSS.escape(key)}"]`);
  if (!box) return;
  let t = timers.get(key);
  if (!t) {
    t = { elapsed: 0, startedAt: null, target: 0 };
    if (since) t.startedAt = since;
    else if (auto) t.startedAt = Date.now();
    timers.set(key, t);
  }
  const time = box.querySelector(".timer-time");
  const note = box.querySelector(".timer-note");
  const toggle = box.querySelector(".timer-toggle");
  const sel = box.querySelector(".timer-target");
  if (sel) sel.value = String(t.target);
  const now = () => t.elapsed + (t.startedAt ? Date.now() - t.startedAt : 0);
  const draw = () => {
    const ms = now();
    time.textContent = fmtElapsed(ms);
    toggle.textContent = t.startedAt ? "⏸ 一時停止" : ms ? "▶ 再開" : "▶ スタート";
    const over = t.target && ms > t.target * 60000;
    if (box.classList.contains("timer-bar")) {
      const min = ms / 60000;
      box.style.setProperty("--timer-color", timeColor(min));
      note.textContent = min >= 90 ? "長すぎます。そろそろ終えましょう" : min >= 60 ? "1時間を過ぎました" : min >= 50 ? "まもなく1時間" : "";
    }
    box.classList.toggle("is-running", Boolean(t.startedAt));
    box.classList.toggle("is-over", Boolean(over));
    if (t.target) note.textContent = (over ? `${fmtElapsed(ms - t.target * 60000)} 超過` : `残り ${fmtElapsed(t.target * 60000 - ms)}`);
  };
  toggle.addEventListener("click", () => {
    t.touched = true;
    if (t.startedAt) { t.elapsed = now(); t.startedAt = null; } else t.startedAt = Date.now();
    draw();
  });
  box.querySelector(".timer-reset").addEventListener("click", () => {
    t.touched = true;
    t.elapsed = 0;
    t.startedAt = t.startedAt ? Date.now() : null;
    draw();
  });
  sel?.addEventListener("change", () => { t.target = Number(sel.value); draw(); });
  draw();
  // 画面から消えたら止める（数えた時間は timers に残る）
  const tick = setInterval(() => (document.body.contains(box) ? draw() : clearInterval(tick)), 1000);
}

// MTGを終えたときなど：数えた時間を捨てる
export function clearTimer(key) {
  timers.delete(key);
}

// 工程のチェック項目の右側：スキップ／スキップを取り消す
export function skipButton(c, ro) {
  if (ro || c.done_at) return "";
  return c.skipped_at
    ? `<button type="button" class="link-btn skip-btn" data-skip="${c.id}" data-skipped="1">スキップを取り消す</button>`
    : `<button type="button" class="link-btn skip-btn" data-skip="${c.id}" title="このPJでは不要な項目を、やらずに次の工程へ進めるようにします">スキップ</button>`;
}

export function bindSkipButtons(root, done) {
  root.querySelectorAll("[data-skip]").forEach((b) => b.addEventListener("click", () =>
    busy(b, () => api(`/api/checklist/${b.dataset.skip}`, { method: "PATCH", body: { skipped: !b.dataset.skipped } }))
      .then(() => { toast(b.dataset.skipped ? "スキップを取り消しました" : "スキップしました（やらなくても次の工程へ進めます）"); done(); })
      .catch(() => {})));
}

// 長い説明文：.fold を付けた要素は2行で折りたたみ、はみ出すときだけ「続きを読む」を出す（画面の幅が変わったら出し直す）
export function bindFold(root) {
  root.querySelectorAll(".fold").forEach((p) => {
    if (p.dataset.folded) return;
    p.dataset.folded = "1";
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link-btn small fold-btn";
    b.textContent = "続きを読む";
    const update = () => {
      if (!p.classList.contains("is-open")) b.hidden = p.scrollHeight <= p.clientHeight + 2;
    };
    b.addEventListener("click", () => {
      const open = p.classList.toggle("is-open");
      b.textContent = open ? "閉じる" : "続きを読む";
    });
    p.after(b);
    update();
    new ResizeObserver(update).observe(p);
  });
}

// ---------- 書きかけの内容を守る ----------
// guardForm(form)：保存していない書きかけがあるまま別の画面へ移ろう・タブを閉じようとしたら確かめる
// 保存できたら markSaved(form) を呼ぶ（そのときの内容を「保存済み」として覚え直す）
const guarded = new Set();
const snapshot = (form) => JSON.stringify([...new FormData(form)].filter(([, v]) => typeof v === "string"));
export function guardForm(form) {
  if (!form) return;
  form.dataset.saved = snapshot(form);
  guarded.add(form);
}
export function markSaved(form) {
  if (form) form.dataset.saved = snapshot(form);
}
export function hasUnsaved() {
  for (const f of guarded) {
    if (!f.isConnected) guarded.delete(f);
    else if (snapshot(f) !== f.dataset.saved) return true;
  }
  return false;
}
export function forgetUnsaved() {
  guarded.clear();
}
window.addEventListener("beforeunload", (e) => {
  if (!hasUnsaved()) return;
  e.preventDefault();
  e.returnValue = "";
});

// 同じ欄を2人が同時に保存したとき：読み込んだ時点（base）から、自分だけが変えたなら自分の、相手だけなら相手の内容を使う
// 両方が変えていたら、両方を残す（自分の内容の下に区切り線と相手の内容）。both：両方残したかどうか
export function mergeText(base, mine, theirs) {
  base = base || ""; mine = mine || ""; theirs = theirs || "";
  if (mine === theirs || theirs === base) return { text: mine, both: false };
  if (mine === base) return { text: theirs, both: false };
  return { text: `${mine}\n---（ほかの人が書いた内容）\n${theirs}`, both: true };
}

// メンバーを選ぶ欄（.member-picker）に、名前で絞り込む入力欄を付ける（人数が多いときだけ）
export function bindMemberFilter(root) {
  root.querySelectorAll(".member-picker").forEach((box) => {
    const chips = [...box.querySelectorAll("label.chip-check")];
    if (chips.length < 12 || box.dataset.filter) return;
    box.dataset.filter = "1";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "member-filter";
    input.placeholder = `名前で探す（${chips.length}人）`;
    input.setAttribute("aria-label", "メンバーを名前で探す");
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      for (const c of chips) c.hidden = Boolean(q) && !c.textContent.toLowerCase().includes(q) && !c.querySelector("input").checked;
    });
    // Enterでフォームが送られないように
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    box.before(input);
  });
}

// 画面を描き直すときに、開いていた欄（data-key の付いた details）とスクロールの位置を保つ
export async function keepView(el, render) {
  const y = window.scrollY;
  const open = new Map([...el.querySelectorAll("details[data-key]")].map((d) => [d.dataset.key, d.open]));
  await render();
  el.querySelectorAll("details[data-key]").forEach((d) => { if (open.has(d.dataset.key)) d.open = open.get(d.dataset.key); });
  window.scrollTo(0, y);
}


// ---------- 達成感の演出：工程の完了・PJの完了などで、紙吹雪とひとこと ----------
// 動きを減らす設定（prefers-reduced-motion）の人には、紙吹雪を出さずにひとことだけ
export function celebrate(title, sub = "") {
  document.querySelector(".celebrate")?.remove();
  const box = document.createElement("div");
  box.className = "celebrate";
  box.setAttribute("role", "status");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const bits = reduce ? "" : Array.from({ length: 28 }, (_, i) => {
    const left = Math.round(Math.random() * 100);
    const delay = (Math.random() * 0.4).toFixed(2);
    const dur = (1.2 + Math.random() * 0.8).toFixed(2);
    const emoji = ["🎉", "✨", "🌱", "⭐", "🎊"][i % 5];
    return `<span class="confetti" style="left:${left}%;animation-delay:${delay}s;animation-duration:${dur}s">${emoji}</span>`;
  }).join("");
  box.innerHTML = `${bits}<div class="celebrate-card"><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  box.addEventListener("click", () => box.remove());
  document.body.append(box);
  setTimeout(() => box.classList.add("is-leaving"), 2200);
  setTimeout(() => box.remove(), 2700);
}


// ---------- エラーの監視：画面で起きた想定外のエラーを、サーバーに知らせる ----------
let reported = 0;
function reportClientError(message, stack) {
  if (reported >= 5 || !state.me || !message) return;
  reported += 1;
  fetch("/api/client-errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ message: String(message).slice(0, 500), stack: String(stack || "").slice(0, 2000), url: location.hash }),
  }).catch(() => {});
}
window.addEventListener("error", (e) => reportClientError(e.message, e.error?.stack));
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  if (r?.silent) return; // 確認画面の「キャンセル」など
  reportClientError(r?.message || String(r), r?.stack);
});


// ---------- MTGを終えたときの「どれだけ進んだか」：進み具合の棒が、前の位置から今の位置へ伸びる ----------
// from・to：済んだ項目の数（MTGの前・後）、total：全体の数、items：このMTGで済んだ項目（順にチェックが入る）
// 閉じる（または数秒たつ）と解決する Promise を返す
export function celebrateProgress({ title, sub = "", from, to, total, items = [] }) {
  return new Promise((resolve) => {
    document.querySelector(".celebrate")?.remove();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    const box = document.createElement("div");
    box.className = "celebrate progress-celebrate";
    box.setAttribute("role", "status");
    box.innerHTML = `
      <div class="celebrate-card progress-card">
        <strong>${esc(title)}</strong>
        ${sub ? `<small>${esc(sub)}</small>` : ""}
        <div class="pg-bar" aria-hidden="true">
          <span class="pg-before" style="width:${pct(from)}%"></span>
          <span class="pg-gain" style="left:${pct(from)}%;width:0"></span>
        </div>
        <div class="pg-numbers"><span class="pg-pct">${pct(from)}%</span><small>${from} → <b>${to}</b> / ${total}項目</small></div>
        ${items.length ? `<ul class="pg-items">${items.map((t, i) => `<li style="animation-delay:${reduce ? 0 : 0.9 + i * 0.35}s"><span class="pg-check">✓</span>${esc(t)}</li>`).join("")}</ul>` : ""}
        <button type="button" class="primary small pg-ok">OK</button>
      </div>`;
    const close = () => { if (!box.isConnected) return; box.classList.add("is-leaving"); setTimeout(() => { box.remove(); resolve(); }, 350); };
    box.querySelector(".pg-ok").addEventListener("click", close);
    document.body.append(box);
    box.querySelector(".pg-ok").focus();
    // 少し待ってから、前の位置 → 今の位置へ「ぐいっ」と伸ばし、数字も数え上げる
    const gain = box.querySelector(".pg-gain");
    const label = box.querySelector(".pg-pct");
    setTimeout(() => {
      gain.style.width = `${pct(to) - pct(from)}%`;
      const start = performance.now();
      const dur = reduce ? 0 : 1100;
      const step = (now) => {
        const k = dur ? Math.min(1, (now - start) / dur) : 1;
        const eased = 1 - Math.pow(1 - k, 3);
        label.textContent = `${Math.round(pct(from) + (pct(to) - pct(from)) * eased)}%`;
        if (k < 1) requestAnimationFrame(step);
        else box.classList.add("is-done");
      };
      requestAnimationFrame(step);
    }, reduce ? 0 : 450);
    setTimeout(close, 4500 + items.length * 350);
  });
}


// MTGを終えてPJ画面に戻ったとき、数直線を「MTGの前 → 後」に伸ばすための合図（画面を開いているあいだだけ）
let progressHint = null;
export function setProgressHint(hint) { progressHint = hint; }
export function takeProgressHint(projectId) {
  if (!progressHint || progressHint.projectId !== projectId) return null;
  const h = progressHint;
  progressHint = null;
  return h;
}
