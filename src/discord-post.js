// アンケートの回答状況を、Discordにリアルタイムで出す
// ツールからDiscordのチャンネルに投稿し（Webhook）、回答が入るたびにその投稿を書き直す。
//   ・Webhook の URL は DISCORD_WEBHOOK_URL（シークレット。Discordのチャンネルの「連携サービス → ウェブフック」で作る）。
//     投稿されるのは、そのWebhookを作ったチャンネル
//   ・出すのは /s/…（src/share.js）のカードと同じ内容（名前・回答人数・締め切ったあとの結果）。だれが何に答えたかは出さない
//   ・ログに URL や本文は出さない
import { HttpError, readJson, nowJst, shortDateTime } from "./util.js";
import { requireAdmin, requireEditor } from "./api/common.js";
import { card, KIND } from "./share.js";

const API = "https://discord.com/api/v10";
const WEBHOOK_RE = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/(\d{17,20})\/([\w-]+)/;

export const routes = [
  ["GET", "/api/discord-posts", getPosts],
  ["POST", "/api/discord-posts", createPost],
  ["POST", "/api/discord-posts/image", postImage],
];

// この日程調整アンケートを、いまのWebhookでDiscordに投稿してあるか（画面が、画像を作って送るかどうかに使う）
export async function hasDiscordPost(env, kind, id) {
  const hook = webhook(env);
  if (!hook) return false;
  return Boolean(await env.DB.prepare("SELECT 1 FROM discord_posts WHERE kind = ? AND ref_id = ? AND webhook_id = ? LIMIT 1").bind(kind, id, hook.id).first());
}

// 日程調整アンケートの「いまの状態」の印。画面はこの印と一緒に画像を送り、古い状態の画像で上書きしないようにする
export async function pollVersion(env, id) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n, COALESCE(MAX(a.updated_at), 0) AS t, (SELECT closed_at IS NOT NULL FROM schedule_polls WHERE id = ?1) AS c
     FROM schedule_poll_answers a JOIN schedule_poll_slots s ON s.id = a.slot_id WHERE s.poll_id = ?1`
  ).bind(id).first();
  return `${r.n}:${r.t}:${r.c ? 1 : 0}`;
}

// 画面そっくりの画像（答えた人の画面で作ったPNG）を、Discordの投稿に付け直す。日程調整アンケートだけ
async function postImage({ request, env, user }) {
  const body = await readJson(request);
  const id = Number(body.id);
  if (body.kind !== "p") throw new HttpError(400, "画像を付けられるのは、日程調整アンケートだけです");
  readTarget("p", id);
  await assertCanPost(env, user, "p", id);
  const hook = webhook(env);
  if (!hook) return { ok: false };
  // 画像を作ったあとに、ほかの人の回答が入っていたら送らない（その人の画面が、新しい画像を送る）
  if (String(body.version) !== await pollVersion(env, id)) return { ok: false, stale: true };
  const bytes = Uint8Array.from(atob(String(body.png || "")), (c) => c.charCodeAt(0));
  const PNG = [0x89, 0x50, 0x4e, 0x47];
  if (bytes.length < 100 || bytes.length > 3_000_000 || PNG.some((b, i) => bytes[i] !== b)) throw new HttpError(400, "画像が正しくありません");
  const info = await card(env, "p", id);
  if (!info) return { ok: false };
  const { results: posts } = await env.DB.prepare("SELECT * FROM discord_posts WHERE kind = 'p' AND ref_id = ? AND webhook_id = ?").bind(id, hook.id).all();
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
    const res = await discord(`/webhooks/${hook.id}/${hook.token}/messages/${p.message_id}`, "PATCH", form);
    if (res.status === 404) await env.DB.prepare("DELETE FROM discord_posts WHERE id = ?").bind(p.id).run();
    else if (res.ok) await env.DB.prepare("UPDATE discord_posts SET has_image = 1 WHERE id = ?").bind(p.id).run();
  }
  return { ok: true };
}

const webhook = (env) => {
  const m = String(env.DISCORD_WEBHOOK_URL || "").trim().match(WEBHOOK_RE);
  return m ? { id: m[1], token: m[2] } : null;
};
const messageUrl = (env, p) => (p.channel_id && env.DISCORD_GUILD_ID ? `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${p.channel_id}/${p.message_id}` : "");

function readTarget(kind, id) {
  if (!KIND[kind] || !Number.isInteger(id) || id < 1) throw new HttpError(400, "投稿するものが正しくありません");
}

// 投稿してよい人：アンケート・PJ決めは管理者、日程調整はそのPJのメンバー（と管理者）
async function assertCanPost(env, user, kind, id) {
  if (kind === "p") {
    const poll = await env.DB.prepare("SELECT project_id FROM schedule_polls WHERE id = ?").bind(id).first();
    if (!poll) throw new HttpError(404, "日程調整アンケートが見つかりません");
    await requireEditor(env, user, poll.project_id);
  } else {
    requireAdmin(user, `${KIND[kind]}をDiscordに投稿できるのは、管理者です`);
  }
}

// 画面：Discordに投稿してあるか（投稿へのリンク）・投稿できるか
async function getPosts({ env, user, url }) {
  const kind = url.searchParams.get("kind");
  const id = Number(url.searchParams.get("id"));
  readTarget(kind, id);
  const hook = webhook(env);
  const { results } = await env.DB.prepare("SELECT * FROM discord_posts WHERE kind = ? AND ref_id = ? ORDER BY created_at DESC").bind(kind, id).all();
  const canPost = await assertCanPost(env, user, kind, id).then(() => true, () => false);
  return {
    configured: Boolean(hook),
    canPost,
    posts: results.filter((p) => hook && p.webhook_id === hook.id).map((p) => ({ url: messageUrl(env, p), created_at: p.created_at })),
  };
}

// Discordに投稿する（以後、回答が入るたびに書き直す）
async function createPost({ request, env, user }) {
  const body = await readJson(request);
  const kind = String(body.kind || "");
  const id = Number(body.id);
  readTarget(kind, id);
  await assertCanPost(env, user, kind, id);
  const hook = webhook(env);
  if (!hook) throw new HttpError(400, "Discordへの投稿先（Webhook）がまだ設定されていません。管理者に連絡してください");
  const info = await card(env, kind, id);
  if (!info) throw new HttpError(404, `${KIND[kind]}が見つかりません`);
  const res = await discord(`/webhooks/${hook.id}/${hook.token}?wait=true`, "POST", {
    username: "政策立案ツール",
    avatar_url: `${appUrl(env)}/icon-512.png`,
    embeds: [embed(env, info)],
    allowed_mentions: { parse: [] },
  });
  if (!res.ok) throw new HttpError(502, "Discordに投稿できませんでした。Webhookが消されていないか確かめてください");
  const msg = await res.json();
  await env.DB.prepare(
    "INSERT INTO discord_posts (kind, ref_id, webhook_id, message_id, channel_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(kind, id, hook.id, msg.id, msg.channel_id || "", user.id, Date.now()).run();
  return { ok: true, url: messageUrl(env, { channel_id: msg.channel_id, message_id: msg.id }) };
}

const appUrl = (env) => String(env.APP_URL || "").replace(/\/$/, "");

// 投稿の見た目（埋め込み）
function embed(env, info) {
  const bar = info.stats && info.stats.total
    ? `\n${"■".repeat(Math.round((Math.min(info.stats.answered, info.stats.total) / info.stats.total) * 10))}${"□".repeat(10 - Math.round((Math.min(info.stats.answered, info.stats.total) / info.stats.total) * 10))} ${info.stats.answered} / ${info.stats.total}人`
    : "";
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
//   PJ決めの投票が変わったときは、そのPJ決めを指す「PJ決めアンケート」の投稿も書き直す
export function refreshDiscord(env, ctx, kind, id) {
  if (!webhook(env)) return;
  const job = (async () => {
    await refreshOne(env, kind, id);
    if (kind === "r") {
      const { results } = await env.DB.prepare("SELECT id FROM surveys WHERE kind = 'pj' AND round_id = ?").bind(id).all();
      for (const s of results) await refreshOne(env, "a", s.id);
    }
  })().catch((err) => console.error("discord refresh failed", err?.message));
  if (ctx?.waitUntil) ctx.waitUntil(job);
  return job;
}

async function refreshOne(env, kind, id) {
  const hook = webhook(env);
  const { results: posts } = await env.DB.prepare("SELECT * FROM discord_posts WHERE kind = ? AND ref_id = ? AND webhook_id = ?").bind(kind, id, hook.id).all();
  for (const p of posts) {
    // 書き直しの順番を進める。書き終えたときに、あとから別の書き直しが始まっていたら、最新の内容でもう一度書く
    let rev = (await env.DB.prepare("UPDATE discord_posts SET rev = rev + 1 WHERE id = ? RETURNING rev").bind(p.id).first()).rev;
    for (let i = 0; i < 3; i++) {
      const info = await card(env, kind, id);
      // 画面そっくりの画像を付けている日程調整：受付中は、答えた人の画面が新しい画像と一緒に書き直すので、ここでは触らない
      if (p.has_image && info?.stats) break;
      const res = await discord(`/webhooks/${hook.id}/${hook.token}/messages/${p.message_id}`, "PATCH", {
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
