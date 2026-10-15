// アンケート・日程調整の回答状況を、Discordの既存のスレッドにリアルタイムで出す
//   ・投稿先：PJごとのウェブフック（管理者メニューで登録。discord_hooks）＋ そのチャンネルの中の既存のスレッド
//     スレッドは新しく作らない（thread_name は送らない）。スレッドIDは、PJに登録したものを使い、投稿するときに変えられる
//   ・1回だけ投稿して、メッセージIDを残す（discord_posts）。回答・締め切り・決定のたびに、同じメッセージを書き直す
//   ・出すのは /s/…（src/share.js）のカードと同じ内容。日程調整は、画面そっくりの画像も付ける（答えた人の画面で描いて送る）
//   ・ウェブフックのURLはパスワードと同じ扱い：画面に返さない。ログにも、URL・本文は出さない
import { HttpError, readJson, nowJst, shortDateTime } from "./util.js";
import { requireAdmin, requireEditor } from "./api/common.js";
import { card, KIND } from "./share.js";

const API = "https://discord.com/api/v10";
const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{17,20})\/([\w-]+)\/?$/;

export const routes = [
  ["GET", "/api/discord-posts", getPosts],
  ["POST", "/api/discord-posts", createPost],
  ["POST", "/api/discord-posts/image", postImage],
  ["GET", "/api/admin/discord-hooks", listHooks],
  ["PUT", "/api/admin/discord-hooks/:id", saveHook],
];

const parseHook = (url) => {
  const m = String(url || "").trim().match(WEBHOOK_RE);
  return m ? { id: m[1], token: m[2] } : null;
};
// スレッドID：数字、またはスレッドのリンク（…/channels/サーバー/スレッド）。空なら未設定
function threadId(value, required = false) {
  const v = String(value ?? "").trim();
  if (!v) {
    if (required) throw new HttpError(400, "投稿先のスレッドIDを入れてください（新しいスレッドは作りません）");
    return "";
  }
  const m = v.match(/(\d{17,20})\/?$/);
  if (!m) throw new HttpError(400, "スレッドIDは、数字（またはスレッドのリンク）を入れてください");
  return m[1];
}
const appUrl = (env) => String(env.APP_URL || "").replace(/\/$/, "");
const messageUrl = (env, p) => (p.thread_id && env.DISCORD_GUILD_ID ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${p.thread_id}/${p.message_id}` : "");

function readTarget(kind, id) {
  if (!["a", "p"].includes(kind) || !Number.isInteger(id) || id < 1) throw new HttpError(400, "投稿するものが正しくありません");
}

// 投稿してよい人：アンケートは管理者、日程調整はそのPJのメンバー（と管理者）
async function assertCanPost(env, user, kind, id) {
  if (kind === "p") {
    const poll = await env.DB.prepare("SELECT project_id FROM schedule_polls WHERE id = ?").bind(id).first();
    if (!poll) throw new HttpError(404, "日程調整アンケートが見つかりません");
    await requireEditor(env, user, poll.project_id);
    return poll.project_id;
  }
  requireAdmin(user, "アンケートをDiscordに投稿できるのは、管理者です");
  return null;
}

// 書き直せる投稿（投稿したときと同じウェブフックが、いまもそのPJに登録されているもの）と、そのウェブフック
async function editablePosts(env, kind, id) {
  const { results } = await env.DB.prepare(
    `SELECT dp.*, h.webhook_url FROM discord_posts dp JOIN discord_hooks h ON h.project_id = dp.project_id
     WHERE dp.kind = ? AND dp.ref_id = ? ORDER BY dp.created_at DESC`
  ).bind(kind, id).all();
  return results.map((p) => ({ ...p, hook: parseHook(p.webhook_url) })).filter((p) => p.hook && p.hook.id === p.webhook_id);
}
const editPath = (p) => `/webhooks/${p.hook.id}/${p.hook.token}/messages/${p.message_id}${p.thread_id ? `?thread_id=${p.thread_id}` : ""}`;

// この日程調整アンケートを、Discordに投稿してあるか（画面が、画像を作って送るかどうかに使う）
export async function hasDiscordPost(env, kind, id) {
  return (await editablePosts(env, kind, id)).length > 0;
}

// 日程調整アンケートの「いまの状態」の印。画面はこの印と一緒に画像を送り、古い状態の画像で上書きしないようにする
export async function pollVersion(env, id) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(MAX(a.updated_at), 0) AS t, (SELECT closed_at IS NOT NULL FROM schedule_polls WHERE id = ?1) AS c
     FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = ?1`
  ).bind(id).first();
  return `${r.n}:${r.t}:${r.c ? 1 : 0}`;
}

// 画面：投稿してあるか（投稿へのリンク）・投稿できるか・選べる投稿先（ウェブフックを登録したPJと、そのスレッドID）
async function getPosts({ env, user, url }) {
  const kind = url.searchParams.get("kind");
  const id = Number(url.searchParams.get("id"));
  readTarget(kind, id);
  let pollProject = null;
  const canPost = await assertCanPost(env, user, kind, id).then((pid) => { pollProject = pid; return true; }, () => false);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, h.thread_id FROM discord_hooks h JOIN projects p ON p.id = h.project_id
     WHERE h.webhook_url != '' AND p.status != 'archived' ${kind === "p" ? "AND p.id = ?" : ""} ORDER BY p.created_at`
  ).bind(...(kind === "p" ? [pollProject || 0] : [])).all();
  return {
    canPost,
    targets: canPost ? results : [],
    posts: (await editablePosts(env, kind, id)).map((p) => ({ url: messageUrl(env, p), created_at: p.created_at })),
  };
}

// 既存のスレッドに1回投稿する（以後、回答が入るたびに、このメッセージを書き直す）
async function createPost({ request, env, user }) {
  const body = await readJson(request);
  const kind = String(body.kind || "");
  const id = Number(body.id);
  readTarget(kind, id);
  const pollProject = await assertCanPost(env, user, kind, id);
  const projectId = kind === "p" ? pollProject : Number(body.project_id);
  const row = await env.DB.prepare("SELECT * FROM discord_hooks WHERE project_id = ?").bind(projectId || 0).first();
  const hook = parseHook(row?.webhook_url);
  if (!hook) throw new HttpError(400, "このPJのDiscordのウェブフックが、まだ登録されていません。管理者メニューで登録してください");
  const thread = threadId(body.thread_id ?? row.thread_id, true);
  const info = await card(env, kind, id);
  if (!info) throw new HttpError(404, `${KIND[kind]}が見つかりません`);
  const res = await discord(`/webhooks/${hook.id}/${hook.token}?wait=true&thread_id=${thread}`, "POST", {
    username: "政策立案ツール",
    avatar_url: `${appUrl(env)}/icon-512.png`,
    embeds: [embed(env, info)],
    allowed_mentions: { parse: [] },
  });
  if (!res.ok) {
    if ([400, 404].includes(res.status)) throw new HttpError(400, "スレッドに投稿できませんでした。スレッドIDが、ウェブフックのチャンネルの中の（閉じていない）スレッドか確かめてください");
    if (res.status === 401 || res.status === 403) throw new HttpError(400, "ウェブフックが使えません（Discordで消されたかもしれません）。管理者メニューで登録し直してください");
    throw new HttpError(502, "Discordに投稿できませんでした。少し待ってからもう一度試してください");
  }
  const msg = await res.json();
  await env.DB.prepare(
    "INSERT INTO discord_posts (kind, ref_id, webhook_id, message_id, channel_id, project_id, thread_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(kind, id, hook.id, msg.id, msg.channel_id || thread, projectId, thread, user.id, Date.now()).run();
  return { ok: true, url: messageUrl(env, { thread_id: thread, message_id: msg.id }) };
}

// 画面そっくりの画像（答えた人の画面で作ったPNG）を、Discordの投稿に付け直す。日程調整アンケートだけ
async function postImage({ request, env, user }) {
  const body = await readJson(request);
  const id = Number(body.id);
  if (body.kind !== "p") throw new HttpError(400, "画像を付けられるのは、日程調整アンケートだけです");
  readTarget("p", id);
  await assertCanPost(env, user, "p", id);
  const posts = await editablePosts(env, "p", id);
  if (!posts.length) return { ok: false };
  // 画像を作ったあとに、ほかの人の回答が入っていたら送らない（その人の画面が、新しい画像を送る）
  if (String(body.version) !== await pollVersion(env, id)) return { ok: false, stale: true };
  const bytes = Uint8Array.from(atob(String(body.png || "")), (c) => c.charCodeAt(0));
  const PNG = [0x89, 0x50, 0x4e, 0x47];
  if (bytes.length < 100 || bytes.length > 3_000_000 || PNG.some((b, i) => bytes[i] !== b)) throw new HttpError(400, "画像が正しくありません");
  const info = await card(env, "p", id);
  if (!info) return { ok: false };
  for (const p of posts) {
    const form = () => {
      const f = new FormData();
      f.append("payload_json", JSON.stringify({
        embeds: [{ ...embed(env, info), image: { url: "attachment://schedule.png" } }],
        attachments: [{ id: 0, filename: "schedule.png" }],
        allowed_mentions: { parse: [] },
      }));
      f.append("files[0]", new Blob([bytes], { type: "image/png" }), "schedule.png");
      return f;
    };
    const res = await discord(editPath(p), "PATCH", form);
    if (res.status === 404) await env.DB.prepare("DELETE FROM discord_posts WHERE id = ?").bind(p.id).run();
    else if (res.ok) await env.DB.prepare("UPDATE discord_posts SET has_image = 1 WHERE id = ?").bind(p.id).run();
  }
  return { ok: true };
}

// ---------- 管理者メニュー：PJごとのウェブフックとスレッドID ----------
async function listHooks({ env, user }) {
  requireAdmin(user);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, COALESCE(h.webhook_url, '') != '' AS has_webhook, COALESCE(h.thread_id, '') AS thread_id
     FROM projects p LEFT JOIN discord_hooks h ON h.project_id = p.id WHERE p.status != 'archived' ORDER BY p.created_at`
  ).all();
  return { projects: results.map((r) => ({ ...r, has_webhook: Boolean(r.has_webhook) })) };
}

// webhook_url：入れたときだけ変える（空なら今のまま）。remove_webhook：消す。thread_id：いつもの投稿先のスレッド
async function saveHook({ request, env, user, params }) {
  requireAdmin(user);
  const project = await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(params.id).first();
  if (!project) throw new HttpError(404, "PJが見つかりません");
  const body = await readJson(request);
  const cur = await env.DB.prepare("SELECT * FROM discord_hooks WHERE project_id = ?").bind(project.id).first();
  let url = cur?.webhook_url || "";
  let channel = cur?.channel_id || "";
  if (body.remove_webhook) { url = ""; channel = ""; }
  const next = String(body.webhook_url || "").trim();
  if (next) {
    const hook = parseHook(next);
    if (!hook) throw new HttpError(400, "ウェブフックのURLは https://discord.com/api/webhooks/… の形です（チャンネルの「連携サービス → ウェブフック」でコピーできます）");
    // 本当に使えるかDiscordに聞く（投稿はしない）
    const res = await fetch(`${API}/webhooks/${hook.id}/${hook.token}`);
    if (!res.ok) throw new HttpError(400, "このウェブフックは使えませんでした。URLをコピーし直して貼ってください");
    const info = await res.json();
    if (env.DISCORD_GUILD_ID && info.guild_id && info.guild_id !== env.DISCORD_GUILD_ID) throw new HttpError(400, "学生チームのサーバーのウェブフックではありません");
    url = next;
    channel = info.channel_id || "";
  }
  const thread = "thread_id" in body ? threadId(body.thread_id) : cur?.thread_id || "";
  await env.DB.prepare(
    `INSERT INTO discord_hooks (project_id, webhook_url, channel_id, thread_id, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET webhook_url = excluded.webhook_url, channel_id = excluded.channel_id, thread_id = excluded.thread_id,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(project.id, url, channel, thread, user.id, Date.now()).run();
  return { ok: true, has_webhook: Boolean(url), thread_id: thread };
}

// 投稿の見た目（埋め込み）
function embed(env, info) {
  const s = info.stats;
  const filled = s && s.total ? Math.round((Math.min(s.answered, s.total) / s.total) * 10) : 0;
  const bar = s && s.total ? `\n${"■".repeat(filled)}${"□".repeat(10 - filled)} ${s.answered} / ${s.total}人` : "";
  return {
    title: info.title.slice(0, 256),
    url: `${appUrl(env)}${info.to}`,
    description: `${info.description}${bar}\n\n👉 タイトルを押すと、ツールで開いて答えられます`.slice(0, 4000),
    color: 0x3cc4ad,
    footer: { text: `回答が入るたびに自動で更新されます（最終更新 ${shortDateTime(nowJst())}）` },
  };
}

// Discord のAPI。混んでいる（429）ときは、言われた時間だけ待って3回までやり直す
// body：送る中身（JSON）。画像を付けるときは、毎回作り直す FormData を返す関数
async function discord(path, method, body) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = typeof body === "function"
      ? await fetch(`${API}${path}`, { method, body: body() })
      : await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status !== 429) break;
    const wait = Number((await res.clone().json().catch(() => ({}))).retry_after) || 1;
    await new Promise((r) => setTimeout(r, Math.min(10, wait) * 1000 + 100));
  }
  if (!res.ok) console.error("discord webhook failed", method, res.status);
  return res;
}

// 回答が入った・締め切った など：その投稿を書き直す（返事を待たずに、裏で）
//   PJ決めの投票が変わったときは、そのPJ決めを指す「PJ決めアンケート」の投稿を書き直す
export function refreshDiscord(env, ctx, kind, id) {
  const job = (async () => {
    if (kind === "r") {
      const { results } = await env.DB.prepare("SELECT id FROM surveys WHERE kind = 'pj' AND round_id = ?").bind(id).all();
      for (const s of results) await refreshOne(env, "a", s.id);
    } else {
      await refreshOne(env, kind, id);
    }
  })().catch((err) => console.error("discord refresh failed", err?.message));
  if (ctx?.waitUntil) ctx.waitUntil(job);
  return job;
}

async function refreshOne(env, kind, id) {
  for (const p of await editablePosts(env, kind, id)) {
    // 書き直しの順番を進める。書き終えたときに、あとから別の書き直しが始まっていたら、最新の内容でもう一度書く
    let rev = (await env.DB.prepare("UPDATE discord_posts SET rev = rev + 1 WHERE id = ? RETURNING rev").bind(p.id).first()).rev;
    for (let i = 0; i < 3; i++) {
      const info = await card(env, kind, id);
      // 画面そっくりの画像を付けている日程調整：受付中は、答えた人の画面が新しい画像と一緒に書き直すので、ここでは触らない
      if (p.has_image && info?.stats) break;
      const res = await discord(editPath(p), "PATCH", {
        embeds: [info ? embed(env, info) : { title: `${KIND[kind]}は削除されました`, color: 0x999999 }],
        // 締め切った・決まった：画像は外して、決まった日時だけにする
        ...(p.has_image ? { attachments: [] } : {}),
        allowed_mentions: { parse: [] },
      });
      if (res.ok && p.has_image) await env.DB.prepare("UPDATE discord_posts SET has_image = 0 WHERE id = ?").bind(p.id).run();
      // Discordで投稿が消されていたら、もう書き直さない
      if (res.status === 404) { await env.DB.prepare("DELETE FROM discord_posts WHERE id = ?").bind(p.id).run(); break; }
      const now = (await env.DB.prepare("SELECT rev FROM discord_posts WHERE id = ?").bind(p.id).first())?.rev;
      if (now === undefined || now === rev) break;
      rev = now;
    }
  }
}
