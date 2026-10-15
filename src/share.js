// Discordに貼ると、アンケートの回答状況が埋め込まれるリンク（/s/…）
// Discord はリンク先のページの og:title・og:description を読んで、メッセージの下にカードを出す。
// ツールの画面は「#/surveys/12」のような # 付きのURLで、# より後ろは Discord に届かないので、カード用のページを別に用意する。
//   ・ログインなしで開ける（Discord が読みに来るため）。出すのはアンケートの名前と回答状況（人数・締め切ったあとの結果）だけ。
//     だれが何に答えたかは出さない
//   ・URLには署名を付ける（/s/a12-xxxx）。番号を変えて、ほかのアンケートをのぞけないように
//   ・人がリンクを押したときは、すぐツールの画面（#/surveys/12 など）へ移る
//   ・カードは貼った時点の状況（Discord が覚えておくので、あとから自動では変わらない）。
//     画面の「Discord用にリンクをコピー」は毎回URLの最後を変えるので、コピーし直して貼れば、その時点の状況が出る
import { HttpError, nowJst } from "./util.js";
import { tallySurvey, METHODS } from "./api/surveys.js";

const KIND = { a: "アンケート", r: "PJ決め", p: "日程調整アンケート" };
const WEEK = "日月火水木金土";

export const routes = [["GET", "/api/share-link", shareLink]];

// 画面の「Discord用にリンクをコピー」：署名付きのURLを返す（見られるのはログインしている人だけ）
async function shareLink({ env, url }) {
  const kind = url.searchParams.get("kind");
  const id = Number(url.searchParams.get("id"));
  if (!KIND[kind] || !Number.isInteger(id) || id < 1) throw new HttpError(400, "共有するものが正しくありません");
  if (!(await card(env, kind, id))) throw new HttpError(404, `${KIND[kind]}が見つかりません`);
  const sig = await sign(env, `${kind}${id}`);
  // 最後の t は、貼るたびに Discord に読み直してもらうため（同じURLだと、前に読んだカードが使い回される）
  return { url: `${url.origin}/s/${kind}${id}-${sig}?t=${Date.now().toString(36)}` };
}

// /s/a12-xxxx：Discord が読むカード用のページ
export async function handleShare(request, env, url) {
  const m = url.pathname.match(/^\/s\/([arp])(\d+)-([\w-]+)$/);
  const ok = m && (await sign(env, `${m[1]}${m[2]}`)) === m[3];
  const info = ok ? await card(env, m[1], Number(m[2])) : null;
  if (!info) return page({ title: "政策立案ツール", description: "このリンクは見つかりませんでした。", to: "/" }, url, 404);
  return page(info, url);
}

async function sign(env, text) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`share:${env.SESSION_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 12);
}

// 'YYYY-MM-DDTHH:MM' → '10/20(火) 21:00'
const when = (dt) => {
  const d = new Date(`${dt.slice(0, 10)}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]}) ${dt.slice(11, 16)}`;
};
const left = (answered, total) => (total > answered ? `（あと${total - answered}人）` : total ? "（全員回答）" : "");

// カードの中身：{ title, description, to（人が押したときに開く画面） }
async function card(env, kind, id) {
  if (kind === "a") return surveyCard(env, id);
  if (kind === "r") return roundCard(env, id);
  if (kind === "p") return pollCard(env, id);
  return null;
}

async function surveyCard(env, id) {
  const s = await env.DB.prepare("SELECT * FROM surveys WHERE id = ?").bind(id).first();
  if (!s) return null;
  if (s.kind === "pj" && s.round_id) {
    const r = await roundCard(env, s.round_id);
    return r && { ...r, to: `/#/surveys/${id}` };
  }
  const survey = { ...s, options: JSON.parse(s.options || "[]") };
  const { results } = await env.DB.prepare("SELECT answer FROM survey_answers WHERE survey_id = ?").bind(id).all();
  const answers = results.map((r) => JSON.parse(r.answer));
  const dept = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE is_dept = 1").first())?.n || 0;
  const lines = [];
  if (survey.closed_at) {
    lines.push(`締め切りました・回答 ${answers.length}人`);
    // 結果（締め切ったあとは、部門のみんなが画面で見られるもの）。だれが何に入れたかは出さない
    if (answers.length) {
      const t = tallySurvey(survey, answers);
      if (["rcv", "stv"].includes(survey.method)) {
        if (t.winners?.length) lines.push(`決まったもの：${t.winners.map((i) => survey.options[i]).join("、")}`);
      } else {
        const top = t.counts.map((c, i) => [c, i]).filter(([c]) => c > 0).sort((a, b) => b[0] - a[0]).slice(0, 5);
        if (top.length) lines.push(`結果：${top.map(([c, i]) => `${survey.options[i]} ${c}票`).join(" ／ ")}`);
      }
    }
  } else {
    lines.push(`受付中・回答 ${answers.length}人${dept ? ` ／ 部門 ${dept}人${left(answers.length, dept)}` : ""}`);
    lines.push(`決め方：${(METHODS[survey.method] || "").replace(/（.*）/, "")}${survey.method === "stv" ? `（${survey.seats}つ決める）` : ""}・選択肢 ${survey.options.length}つ`);
  }
  if (survey.description) lines.push(survey.description.slice(0, 120));
  return { title: `📊 ${survey.title}`, description: lines.join("\n"), to: `/#/surveys/${id}` };
}

async function roundCard(env, id) {
  const r = await env.DB.prepare("SELECT * FROM seed_rounds WHERE id = ?").bind(id).first();
  if (!r) return null;
  const [voters, seeds] = await Promise.all([
    env.DB.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM seed_votes WHERE round_id = ?").bind(id).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM seeds WHERE round_id = ?").bind(id).first(),
  ]);
  const closed = r.archived || (r.deadline && nowJst() >= r.deadline);
  const lines = [
    `${closed ? "締め切りました" : "受付中"}・投票 ${voters?.n || 0}人・政策の種 ${seeds?.n || 0}個`,
    r.deadline ? `締め切り：${when(r.deadline)}` : "締め切り：まだ決まっていません",
    `決めるPJの数：${r.seats}つ`,
  ];
  return { title: `🗳️ ${r.title}`, description: lines.join("\n"), to: `/#/seeds/${id}` };
}

async function pollCard(env, id) {
  const poll = await env.DB.prepare(
    "SELECT sp.*, p.name AS project_name FROM schedule_polls sp JOIN projects p ON p.id = sp.project_id WHERE sp.id = ?"
  ).bind(id).first();
  if (!poll) return null;
  const [slots, answers, members, meeting] = await Promise.all([
    env.DB.prepare("SELECT id, starts_at FROM schedule_poll_slots WHERE poll_id = ? ORDER BY starts_at").bind(id).all(),
    env.DB.prepare("SELECT a.slot_id, a.user_id, a.answer FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = ?").bind(id).all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM project_members WHERE project_id = ?").bind(poll.project_id).first(),
    poll.meeting_id ? env.DB.prepare("SELECT starts_at FROM meetings WHERE id = ?").bind(poll.meeting_id).first() : null,
  ]);
  const answered = new Set(answers.results.map((a) => a.user_id)).size;
  const total = members?.n || 0;
  const lines = [];
  if (poll.closed_at) {
    lines.push(meeting ? `決まりました：${when(meeting.starts_at)}` : "締め切りました");
  } else {
    lines.push(`受付中・回答 ${answered} ／ ${total}人${left(answered, total)}`);
    // いちばん多い候補（○の数、同じなら△の数）
    const score = slots.results.map((s) => {
      const mine = answers.results.filter((a) => a.slot_id === s.id);
      return { s, yes: mine.filter((a) => a.answer === "yes").length, maybe: mine.filter((a) => a.answer === "maybe").length };
    }).sort((a, b) => b.yes - a.yes || b.maybe - a.maybe);
    if (score[0] && score[0].yes + score[0].maybe > 0) lines.push(`いちばん多い候補：${when(score[0].s.starts_at)}（○${score[0].yes} △${score[0].maybe}）`);
    lines.push(`候補 ${slots.results.length}つ`);
  }
  return { title: `🗓 ${poll.project_name}：次回MTGの日程調整`, description: lines.join("\n"), to: `/#/schedule-polls/${id}` };
}

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "&#10;");

function page({ title, description, to }, url, status = 200) {
  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>${escAttr(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="政策立案ツール">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(description)}">
<meta property="og:url" content="${escAttr(url.href)}">
<meta property="og:image" content="${escAttr(`${url.origin}/icon-512.png`)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#3cc4ad">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${escAttr(to)}">
</head><body><p><a href="${escAttr(to)}">政策立案ツールで開く</a></p>
<script>location.replace(${JSON.stringify(to)});</script></body></html>`;
  // Discord が古いカードを使い回さないよう、覚えておかないでもらう
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

