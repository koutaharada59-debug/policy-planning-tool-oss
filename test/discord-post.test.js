// Discordに投稿して、回答が入るたびに書き直す（src/discord-post.js）
// 本物のDiscordの代わりに、送ったものを記録する。DBは node の SQLite で D1 の代わりをする
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { routes, refreshDiscord } from "../src/discord-post.js";

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, avatar TEXT, is_dept INTEGER DEFAULT 0, updated_at INTEGER)");
  db.exec(readFileSync(new URL("../migrations/0038_surveys.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../migrations/0045_discord_posts.sql", import.meta.url), "utf8"));
  const prepare = (sql) => {
    const st = {
      args: [],
      bind(...a) { st.args = a; return st; },
      async first() { return db.prepare(sql).get(...st.args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...st.args) }; },
      async run() { const r = db.prepare(sql).run(...st.args); return { meta: { changes: Number(r.changes) } }; },
    };
    return st;
  };
  return { prepare, async batch(list) { for (const s of list) await s.run(); }, raw: db };
}

function fakeDiscord({ patchStatus = [200] } = {}) {
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, { method, body }) => {
    calls.push({ url, method, body: JSON.parse(body) });
    if (method === "POST") return new Response(JSON.stringify({ id: "900000000000000001", channel_id: "800000000000000001" }), { status: 200 });
    const status = patchStatus[Math.min(n++, patchStatus.length - 1)];
    return new Response(status === 429 ? JSON.stringify({ retry_after: 0.01 }) : "{}", { status });
  };
  return calls;
}

const handler = (method, path) => routes.find(([m, p]) => m === method && p === path)[2];
const admin = { id: "u-admin", isAdmin: true };

async function setup() {
  const DB = fakeD1();
  DB.raw.exec("INSERT INTO users (id, name, is_dept) VALUES ('u1', 'A', 1), ('u2', 'B', 1), ('u3', 'C', 1), ('u4', 'D', 1)");
  DB.raw.exec(`INSERT INTO surveys (id, kind, title, method, options, created_by, created_at) VALUES (1, 'other', '合宿の行き先', 'majority', '["箱根","軽井沢"]', 'u-admin', 0)`);
  const env = { DB, DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123456789012345678/secret-token", APP_URL: "https://example.com", DISCORD_GUILD_ID: "700000000000000001", SESSION_SECRET: "s" };
  return { env, DB };
}

test("Discordに投稿して、回答が入るたびに人数を書き直す", async () => {
  const { env, DB } = await setup();
  const calls = fakeDiscord();
  const req = new Request("https://example.com/api/discord-posts", { method: "POST", body: JSON.stringify({ kind: "a", id: 1 }), headers: { "Content-Type": "application/json" } });
  const res = await handler("POST", "/api/discord-posts")({ request: req, env, user: admin });
  assert.equal(res.url, "https://discord.com/channels/700000000000000001/800000000000000001/900000000000000001");
  assert.match(calls[0].body.embeds[0].description, /回答 0人 ／ 部門 4人/);
  assert.equal(calls[0].body.allowed_mentions.parse.length, 0, "メンションしない");

  // 2人が答えた → 書き直す
  DB.raw.exec(`INSERT INTO survey_answers (survey_id, user_id, answer, updated_at) VALUES (1, 'u1', '{"picks":[1]}', 1), (1, 'u2', '{"picks":[0]}', 2)`);
  await refreshDiscord(env, null, "a", 1);
  const patch = calls.at(-1);
  assert.equal(patch.method, "PATCH");
  assert.ok(patch.url.endsWith("/messages/900000000000000001"));
  assert.match(patch.body.embeds[0].description, /回答 2人 ／ 部門 4人（あと2人）/);
  assert.match(patch.body.embeds[0].description, /■■■■■□□□□□ 2 \/ 4人/);
  assert.ok(!/軽井沢|箱根/.test(patch.body.embeds[0].description), "締め切る前は、どれに何票かは出さない");

  // 締め切った → 結果を出す
  DB.raw.exec("UPDATE surveys SET closed_at = 5 WHERE id = 1");
  await refreshDiscord(env, null, "a", 1);
  assert.match(calls.at(-1).body.embeds[0].description, /締め切りました・回答 2人/);

  // 削除した → 「削除されました」
  DB.raw.exec("DELETE FROM surveys WHERE id = 1");
  await refreshDiscord(env, null, "a", 1);
  assert.match(calls.at(-1).body.embeds[0].title, /削除されました/);
});

test("Discordが混んでいたら待ってやり直し、投稿が消されていたら書き直しをやめる", async () => {
  const { env, DB } = await setup();
  fakeDiscord();
  const req = new Request("https://example.com/api/discord-posts", { method: "POST", body: JSON.stringify({ kind: "a", id: 1 }), headers: { "Content-Type": "application/json" } });
  await handler("POST", "/api/discord-posts")({ request: req, env, user: admin });

  const calls = fakeDiscord({ patchStatus: [429, 200] });
  await refreshDiscord(env, null, "a", 1);
  assert.deepEqual(calls.map((c) => c.method), ["PATCH", "PATCH"], "429のあと、もう一度送る");

  fakeDiscord({ patchStatus: [404] });
  await refreshDiscord(env, null, "a", 1);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM discord_posts").first()).n, 0, "消された投稿は忘れる");
});

test("日程調整：画面そっくりの画像を付け直す。古い状態の画像は送らない。決まったら画像を外す", async () => {
  const { env, DB } = await setup();
  DB.raw.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT)");
  DB.raw.exec("CREATE TABLE project_members (project_id INTEGER, user_id TEXT)");
  DB.raw.exec("CREATE TABLE meetings (id INTEGER PRIMARY KEY, starts_at TEXT)");
  DB.raw.exec(readFileSync(new URL("../migrations/0039_schedule_polls.sql", import.meta.url), "utf8"));
  DB.raw.exec("INSERT INTO projects VALUES (1, '防災PJ'); INSERT INTO project_members VALUES (1, 'u1'), (1, 'u2')");
  DB.raw.exec("INSERT INTO schedule_polls (id, project_id, created_by, created_at) VALUES (1, 1, 'u1', 0); INSERT INTO schedule_poll_slots (id, poll_id, starts_at) VALUES (1, 1, '2026-11-05T23:00')");
  const { pollVersion } = await import("../src/discord-post.js");
  let calls = fakeDiscord();
  const post = (body, user = { id: "u1", isAdmin: false }) => handler("POST", "/api/discord-posts" + (body.png ? "/image" : ""))({
    request: new Request("https://example.com/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), env, user,
  });
  // PJのメンバーが投稿する
  await post({ kind: "p", id: 1 });
  assert.match(calls[0].body.embeds[0].title, /防災PJ：次回MTGの日程調整/);

  // 画像（PNGの頭を持つ中身）
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200)]).toString("base64");
  DB.raw.exec("INSERT INTO schedule_poll_answers VALUES (1, 'u1', 'yes', 10)");
  const version = await pollVersion(env, 1);
  // 画像を作ったあとに、ほかの人が答えていた → 送らない
  DB.raw.exec("INSERT INTO schedule_poll_answers VALUES (1, 'u2', 'maybe', 11)");
  calls = fakeDiscord();
  assert.equal((await post({ kind: "p", id: 1, version, png })).stale, true);
  assert.equal(calls.length, 0);
  // いまの状態の画像 → 投稿に付け直す（PATCH・ファイル付き）
  const uploads = [];
  globalThis.fetch = async (url, { method, body }) => { uploads.push({ method, body }); return new Response("{}", { status: 200 }); };
  await post({ kind: "p", id: 1, version: await pollVersion(env, 1), png });
  assert.equal(uploads[0].method, "PATCH");
  assert.ok(uploads[0].body instanceof FormData && uploads[0].body.get("files[0]"));
  assert.match(JSON.parse(uploads[0].body.get("payload_json")).embeds[0].image.url, /attachment:\/\/schedule\.png/);
  assert.equal((await DB.prepare("SELECT has_image FROM discord_posts").first()).has_image, 1);

  // 受付中の書き直し（サーバー）では、画像の付いた投稿に触らない（画面が画像と一緒に書き直す）
  calls = fakeDiscord();
  await refreshDiscord(env, null, "p", 1);
  assert.equal(calls.length, 0);
  // 決まった → 画像を外して、決まった日時を出す
  DB.raw.exec("INSERT INTO meetings VALUES (5, '2026-11-05T23:00'); UPDATE schedule_polls SET closed_at = 20, meeting_id = 5 WHERE id = 1");
  await refreshDiscord(env, null, "p", 1);
  assert.deepEqual(calls[0].body.attachments, []);
  assert.match(calls[0].body.embeds[0].description, /決まりました：11\/5\(木\) 23:00/);
  assert.equal((await DB.prepare("SELECT has_image FROM discord_posts").first()).has_image, 0);
  // メンバーでない人は画像を送れない
  await assert.rejects(post({ kind: "p", id: 1, version: "x", png }, { id: "u9", isAdmin: false }), /PJメンバー/);
});

test("管理者でない人は、アンケートを投稿できない。Webhookがなければ何もしない", async () => {
  const { env } = await setup();
  fakeDiscord();
  const req = () => new Request("https://example.com/api/discord-posts", { method: "POST", body: JSON.stringify({ kind: "a", id: 1 }), headers: { "Content-Type": "application/json" } });
  await assert.rejects(handler("POST", "/api/discord-posts")({ request: req(), env, user: { id: "u1", isAdmin: false } }), /管理者/);
  const calls = fakeDiscord();
  await refreshDiscord({ ...env, DISCORD_WEBHOOK_URL: "" }, null, "a", 1);
  assert.equal(calls.length, 0);
});
