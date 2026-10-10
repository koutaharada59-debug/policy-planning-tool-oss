// 起動・ログイン状態・ハッシュルーティング
import { api, esc, avatar, toast, state, hasUnsaved, forgetUnsaved, confirmDialog } from "./lib.js";
import { renderHome } from "./views/home.js";
import { renderMinutesSearch } from "./views/search.js";
import { renderTimeline } from "./views/timeline.js";
import { renderCheck } from "./views/check.js";
import { renderNotices, renderMyTasks } from "./views/notices.js";
import { renderStart } from "./views/start.js";
import { renderPresentList, renderPresent } from "./views/present.js";
import { renderProjects, renderProjectForm } from "./views/projects.js";
import { renderProject } from "./views/project.js";
import { renderMeeting } from "./views/meeting.js";
import { renderCalendar } from "./views/calendar.js";
import { renderRounds, renderRound, renderStaffing } from "./views/seeds.js";
import { renderHearings, renderHearingNew, renderHearing } from "./views/hearings.js";
import { renderAdmin } from "./views/admin.js";
import { renderSourcesView } from "./views/research.js";
import { renderTeireiHome, renderTeireiMinutes, renderTeireiNotice, renderTeireiSchedule, renderTeirei, renderReportList, renderReport } from "./views/teirei.js";

const ROUTES = [
  [/^\/$/, "home", () => renderHome],
  [/^\/start$/, "projects", () => renderStart],
  [/^\/check$/, "home", () => renderCheck],
  [/^\/notices$/, "home", () => renderNotices],
  [/^\/my-tasks$/, "home", () => renderMyTasks],
  [/^\/minutes-search$/, "home", () => renderMinutesSearch],
  [/^\/present$/, "projects", () => renderPresentList],
  [/^\/present\/(\d+)$/, "projects", (m) => (el) => renderPresent(el, Number(m[1]))],
  [/^\/projects$/, "projects", () => renderProjects],
  [/^\/projects\/new$/, "projects", () => (el) => renderProjectForm(el, null)],
  [/^\/projects\/(\d+)\/edit$/, "projects", (m) => (el) => renderProjectForm(el, Number(m[1]))],
  [/^\/projects\/(\d+)$/, "projects", (m) => (el) => renderProject(el, Number(m[1]))],
  [/^\/meetings\/(\d+)$/, "projects", (m) => (el) => renderMeeting(el, Number(m[1]))],
  [/^\/calendar$/, "calendar", () => renderCalendar],
  [/^\/timeline$/, "timeline", () => renderTimeline],
  [/^\/seeds$/, "projects", () => renderRounds],
  [/^\/admin$/, "home", () => renderAdmin],
  [/^\/teirei$/, "home", () => renderTeireiHome],
  [/^\/teirei\/minutes$/, "home", () => renderTeireiMinutes],
  [/^\/teirei\/notice$/, "home", () => renderTeireiNotice],
  [/^\/teirei\/schedule$/, "home", () => renderTeireiSchedule],
  [/^\/teirei\/(\d+)$/, "home", (m) => (el) => renderTeirei(el, Number(m[1]))],
  [/^\/report$/, "projects", () => renderReportList],
  [/^\/report\/(\d+)$/, "projects", (m) => (el) => renderReport(el, Number(m[1]))],
  [/^\/sources$/, "home", () => (el) => renderSourcesView(el)],
  [/^\/hearings$/, "projects", () => renderHearings],
  [/^\/hearings\/new$/, "projects", () => renderHearingNew],
  [/^\/hearings\/(\d+)$/, "projects", (m) => (el) => renderHearing(el, Number(m[1]))],
  [/^\/seeds\/(\d+)$/, "projects", (m) => (el) => renderRound(el, Number(m[1]))],
  [/^\/seeds\/(\d+)\/staffing$/, "projects", (m) => (el) => renderStaffing(el, Number(m[1]))],
];

const ERRORS = {
  login: "ログインに失敗しました。もう一度お試しください。",
  guild: "学生チームのDiscordサーバーに参加しているアカウントでログインしてください。",
  role: "このツールは政策立案部門のメンバー専用です。部門のロールが付いているか確認してください。",
  config: "ログインの設定が完了していません。管理者に連絡してください。",
};

let baseTitle = document.title;

async function boot() {
  const session = await api("/api/session");
  // テスト版などは、本番と見分けられるよう画面上部に帯を出す
  if (session.siteLabel) {
    const bar = document.createElement("div");
    bar.className = "site-label";
    bar.textContent = `${session.siteLabel}：ここで入力した内容は本番には反映されません`;
    document.body.prepend(bar);
    document.title = `【${session.siteLabel}】${document.title}`;
    baseTitle = document.title;
  }
  document.getElementById("boot-loading")?.remove();
  if (!session.user) return showLanding(session);
  const me = await api("/api/me");
  Object.assign(state, { me: me.user, users: me.users, types: me.types });
  document.getElementById("account").innerHTML = `
    ${avatar(me.user)}<span class="account-name">${esc(me.user.name)}${me.user.isHead ? '<span class="role-tag">部門長</span>' : ""}${me.user.isRep ? '<span class="role-tag">代表</span>' : ""}${me.user.isAdmin && !me.user.isHead ? '<span class="role-tag">管理者</span>' : ""}</span>
    <a class="button small" href="/auth/logout">ログアウト</a>`;
  document.getElementById("nav").hidden = false;
  document.getElementById("bell").hidden = false;
  refreshBell();
  setInterval(() => { if (!document.hidden) refreshBell(); }, 60000);
  
  document.getElementById("app").hidden = false;
  window.addEventListener("hashchange", route);
  document.getElementById("back-btn").addEventListener("click", goBack);
  route();
}

function showLanding(session) {
  document.getElementById("landing").hidden = false;
  const params = new URLSearchParams(location.search);
  const error = ERRORS[params.get("error")];
  if (error) {
    const el = document.getElementById("login-error");
    el.textContent = error;
    el.hidden = false;
  }
  const returnTo = params.get("returnTo");
  if (returnTo) {
    document.getElementById("login-button").href = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  }
  if (session.devLogin) {
    const dev = document.getElementById("dev-login");
    dev.hidden = false;
    if (returnTo) dev.querySelector("form").insertAdjacentHTML("beforeend", `<input type="hidden" name="returnTo" value="${esc(returnTo)}">`);
  }
}

// 「戻る」のために、このタブで開いた画面の順番を覚えておく（ブラウザの履歴と同じ並び。保存はしない）
const visited = [];

function trackHistory() {
  const hash = location.hash || "#/";
  if (visited.length >= 2 && visited[visited.length - 2] === hash) visited.pop(); // 戻ってきた
  else if (visited[visited.length - 1] !== hash) visited.push(hash);
}

function goBack() {
  if (visited.length > 1) {
    history.back();
    return;
  }
  // 直接開いたときなど戻る先がなければ、パンくずの1つ上（なければホーム）へ
  // 履歴を増やさずに置き換えるので、もう一度押すとさらに上の画面へ進む
  const crumbs = document.querySelectorAll("#app .breadcrumb a");
  const parent = crumbs.length ? crumbs[crumbs.length - 1].getAttribute("href") : "#/";
  visited.length = 0;
  location.replace(`${location.pathname}${location.search}${parent}`);
}

// サイトをズームさせない：iPhoneのピンチ（gesture）と、2本指の操作を止める（ダブルタップは CSS の touch-action で止める）
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// 画面の上の🔔：未読のお知らせの数（画面を移るたび・1分ごとに確かめる）
export async function refreshBell() {
  const count = document.getElementById("bell-count");
  if (!count) return;
  const { unread } = await api("/api/notices?count=1").catch(() => ({ unread: 0 }));
  count.textContent = unread > 99 ? "99+" : String(unread);
  count.hidden = !unread;
}

// 「戻る」はパンくずと同じ行に置く（縦の場所を取らないように）。パンくずのない画面では上の行に出す
// 画面の中身が描き直されるたびに（保存して再表示したときも）置き直す
function placeBackButton(el) {
  const bar = document.getElementById("back-bar");
  const crumb = el.querySelector(":scope > .breadcrumb");
  if (!crumb) {
    bar.hidden = (location.hash.replace(/^#/, "").split("?")[0] || "/") === "/";
    return;
  }
  bar.hidden = true;
  if (crumb.querySelector(".back-btn")) return;
  const btn = document.getElementById("back-btn").cloneNode(true);
  btn.removeAttribute("id");
  btn.addEventListener("click", goBack);
  crumb.prepend(btn);
}
// 横にスクロールするタブ：右に続きがあるあいだは右端をぼかす
function markScrollableTabs(el) {
  el.querySelectorAll(".tabs").forEach((t) => {
    const update = () => t.classList.toggle("has-more", t.scrollLeft + t.clientWidth < t.scrollWidth - 4);
    if (!t.dataset.watch) {
      t.dataset.watch = "1";
      t.addEventListener("scroll", update, { passive: true });
    }
    update();
  });
}
new MutationObserver(() => {
  const app = document.getElementById("app");
  placeBackButton(app);
  requestAnimationFrame(() => markScrollableTabs(app));
}).observe(document.getElementById("app"), { childList: true, subtree: true });

// 横スクロールする工程の数直線（スマホ）は、いまの工程が見える位置に合わせる
function centerSteppers(el) {
  el.querySelectorAll(".stepper").forEach((ol) => {
    const cur = ol.querySelector(".is-current");
    if (cur && ol.scrollWidth > ol.clientWidth) ol.scrollLeft = cur.offsetLeft - (ol.clientWidth - cur.clientWidth) / 2;
  });
}

// 書きかけを守る：保存していない内容があるまま移ろうとしたら確かめ、やめたら元の画面に戻す
let shownHash = location.hash || "#/";
let shownPath = null; // いま表示している画面（クエリを除く）
let returning = false;

export async function route() {
  // '#/projects/1?tab=tasks' のようなクエリは各画面が hashQuery() で読む
  const path = location.hash.replace(/^#/, "").split("?")[0] || "/";
  const el = document.getElementById("app");
  if (returning) {
    returning = false;
    return;
  }
  if (location.hash !== shownHash && hasUnsaved()) {
    const leave = await confirmDialog("保存していない内容があります。\n保存せずに、この画面を離れますか？", { ok: "保存せずに離れる" });
    if (!leave) {
      returning = true;
      location.replace(`${location.pathname}${location.search}${shownHash}`);
      return;
    }
  }
  forgetUnsaved();
  shownHash = location.hash || "#/";
  refreshBell();
  trackHistory();
  document.getElementById("back-bar").hidden = path === "/";
  for (const [re, nav, view] of ROUTES) {
    const m = path.match(re);
    if (!m) continue;
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === nav));
    // 同じ画面のタブを切り替えただけなら、読み込み中に画面を空にせず、スクロールの位置もそのまま
    const sameScreen = shownPath === path;
    const keepY = window.scrollY;
    // タブの列が画面のどこにあったか（切り替えたあとも、同じ位置に見えるようにする）
    const tabsTop = sameScreen ? el.querySelector(".tabs")?.getBoundingClientRect().top : null;
    shownPath = path;
    if (!sameScreen) el.innerHTML = `<p class="loading">読み込み中…</p>`;
    try {
      await view(m)(el);
      if (sameScreen) {
        const tabs = el.querySelector(".tabs");
        if (tabs && tabsTop != null) window.scrollBy(0, tabs.getBoundingClientRect().top - tabsTop);
        else window.scrollTo(0, keepY);
      }
      else window.scrollTo(0, 0);
      const h1 = el.querySelector("h1")?.textContent.replace(/\s+/g, " ").trim();
      document.title = h1 ? `${h1}｜${baseTitle}` : baseTitle;
      centerSteppers(el);
    } catch (e) {
      el.innerHTML = `<div class="empty"><p>${esc(e.message)}</p><a class="button" href="#/">ホームへ</a></div>`;
    }
    return;
  }
  location.hash = "#/";
}

boot().catch((e) => {
  const box = document.getElementById("boot-loading");
  if (box) box.innerHTML = `読み込めませんでした（${esc(e.message)}）。<button type="button" onclick="location.reload()">もう一度読み込む</button>`;
  else toast(e.message, "error");
});
