// アンケート・日程調整を、Discordの既存のスレッドに1回投稿して、回答のたびに同じメッセージを書き直す（src/discord-post.js）
// 本物のDiscordの代わりに、送ったものを記録する。DBは node の SQLite で D1 の代わりをする
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { routes, refreshDiscord, pollVersion } from "../src/discord-post.js";

const sql = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, avatar TEXT, is_dept INTEGER DEFAULT 0, updated_at INTEGER)");
  db.exec("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active', created_at INTEGER DEFAULT 0)");
  db.exec("CREATE TABLE project_members (project_id INTEGER, user_id TEXT)");
  db.exec("CREATE TABLE meetings (id INTEGER PRIMARY KEY, starts_at TEXT)");
  for (const f of ["0038_surveys.sql", "0039_schedule_polls.sql", "0045_discord_posts.sql", "0047_discord_hooks.sql"]) db.exec(sql(f));
  const prepare = (q) => {
    const st = {
      args: [],
      bind(...a) { st.args = a; return st; },
      async first() { return db.prepare(q).get(...st.args) ?? null; },
      async all() { return { results: db.prepare(q).all(...st.args) }; },
      async run() { const r = db.prepare(q).run(...st.args); return { meta: { changes: Number(r.changes) } }; },
    };
    return st;
  };
  return { prepare, async batch(list) { for (const s of list) await s.run(); }, raw: db };
}

const HOOK = "https://discord.com/api/webhooks/123456789012345678/secret-token";
const THREAD = "1559199970996002968";
// Discord の代わり：ウェブフックの確認（GET）・投稿（POST）・書き直し（PATCH）を記録する
function fakeDiscord({ patchStatus = [200], postStatus = 200 } = {}) {
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, { method = "GET", body } = {}) => {
    calls.push({ url, method, body: typeof body === "string" ? JSON.parse(body) : body });
    if (method === "GET") return new Response(JSON.stringify({ channel_id: "800000000000000001", guild_id: "700000000000000001" }), { status: 200 });
    if (method === "POST") return new Response(JSON.stringify({ id: "900000000000000001", channel_id: THREAD }), { status: postStatus });
    const status = patchStatus[Math.min(n++, patchStatus.length - 1)];
    return new Response(status === 429 ? JSON.stringify({ retry_after: 0.01 }) : "{}", { status });
  };
  return calls;
}

const handler = (method, path) => routes.find(([m, p]) => m === method && p === path)[2];
const req = (body) => new Request("https://example.com/x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const admin = { id: "u-admin", isAdmin: true };

async function setup() {
  const DB = fakeD1();
  DB.raw.exec("INSERT INTO users (id, name, is_dept) VALUES ('u1', 'A', 1), ('u2', 'B', 1), ('u3', 'C', 1), ('u4', 'D', 1)");
  DB.raw.exec("INSERT INTO projects (id, name) VALUES (1, '防災PJ'), (2, '就活PJ'); INSERT INTO project_members VALUES (1, 'u1'), (1, 'u2')");
  DB.raw.exec(`INSERT INTO surveys (id, kind, title, method, options, created_by, created_at) VALUES (1, 'other', '合宿の行き先', 'majority', '["箱根","軽井沢"]', 'u-admin', 0)`);
  const env = { DB, APP_URL: "https://example.com", DISCORD_GUILD_ID: "700000000000000001", SESSION_SECRET: "s" };
  return { env, DB };
}
// 管理者メニューで、PJ1にウェブフックとスレッドを登録する
async function register(env) {
  fakeDiscord();
  return handler("PUT", "/api/admin/discord-hooks/:id")({ request: req({ webhook_url: HOOK, thread_id: `https://discord.com/channels/700000000000000001/${THREAD}` }), env, user: admin, params: { id: 1 } });
}

test("管理者メニュー：PJごとにウェブフックとスレッドIDを登録する（URLは画面に返さない）", async () => {
  const { env } = await setup();
  const saved = await register(env);
  assert.deepEqual(saved, { ok: true, has_webhook: true, thread_id: THREAD }, "スレッドのリンクからIDを取り出す");
  const list = await handler("GET", "/api/admin/discord-hooks")({ env, user: admin });
  assert.ok(!JSON.stringify(list).includes("secret-token"), "ウェブフックのURLは返さない");
  assert.deepEqual(list.projects.find((p) => p.id === 1), { id: 1, name: "防災PJ", has_webhook: true, thread_id: THREAD });
  await assert.rejects(handler("GET", "/api/admin/discord-hooks")({ env, user: { id: "u1", isAdmin: false } }), /管理者/);
  await assert.rejects(handler("PUT", "/api/admin/discord-hooks/:id")({ request: req({ webhook_url: "https://example.com/hook" }), env, user: admin, params: { id: 1 } }), /ウェブフックのURL/);
});

test("アンケート：既存のスレッドに1回投稿し、回答のたびに同じメッセージを書き直す", async () => {
  const { env, DB } = await setup();
  await register(env);
  const calls = fakeDiscord();
  // 投稿できる先（登録したPJとスレッド）。URLは返さない
  const st = await handler("GET", "/api/discord-posts")({ env, user: admin, url: new URL("https://example.com/api/discord-posts?kind=a&id=1") });
  assert.deepEqual(JSON.parse(JSON.stringify(st.targets)), [{ id: 1, name: "防災PJ", thread_id: THREAD }]);
  assert.ok(!JSON.stringify(st).includes("secret-token"));
  // スレッドIDがないと投稿しない（新しいスレッドは作らない）
  await assert.rejects(handler("POST", "/api/discord-posts")({ request: req({ kind: "a", id: 1, project_id: 1, thread_id: "" }), env, user: admin }), /スレッドID/);
  const res = await handler("POST", "/api/discord-posts")({ request: req({ kind: "a", id: 1, project_id: 1, thread_id: THREAD }), env, user: admin });
  assert.equal(res.url, `https://discord.com/channels/700000000000000001/${THREAD}/900000000000000001`);
  const post = calls.find((c) => c.method === "POST");
  assert.ok(post.url.endsWith(`/webhooks/123456789012345678/secret-token?wait=true&thread_id=${THREAD}`));
  assert.ok(!("thread_name" in post.body), "スレッドは作らない");
  assert.match(post.body.embeds[0].description, /回答 0人 ／ 部門 4人/);

  // 2人が答えた → 同じメッセージを書き直す
  DB.raw.exec(`INSERT INTO survey_answers (survey_id, user_id, answer, updated_at) VALUES (1, 'u1', '{"picks":[1]}', 1), (1, 'u2', '{"picks":[0]}', 2)`);
  await refreshDiscord(env, null, "a", 1);
  const patch = calls.at(-1);
  assert.equal(patch.method, "PATCH");
  assert.ok(patch.url.endsWith(`/messages/900000000000000001?thread_id=${THREAD}`));
  assert.match(patch.body.embeds[0].description, /回答 2人 ／ 部門 4人（あと2人）/);
  assert.ok(!/軽井沢|箱根/.test(patch.body.embeds[0].description), "締め切る前は、どれに何票かは出さない");
  // 締め切った → 結果
  DB.raw.exec("UPDATE surveys SET closed_at = 5 WHERE id = 1");
  await refreshDiscord(env, null, "a", 1);
  assert.match(calls.at(-1).body.embeds[0].description, /締め切りました・回答 2人/);
  // 管理者でない人は投稿できない
  await assert.rejects(handler("POST", "/api/discord-posts")({ request: req({ kind: "a", id: 1, project_id: 1, thread_id: THREAD }), env, user: { id: "u1", isAdmin: false } }), /管理者/);
});

test("Discordが混んでいたら待ってやり直し、投稿が消されていたら書き直しをやめる。ウェブフックを外したら書き直さない", async () => {
  const { env, DB } = await setup();
  await register(env);
  fakeDiscord();
  await handler("POST", "/api/discord-posts")({ request: req({ kind: "a", id: 1, project_id: 1, thread_id: THREAD }), env, user: admin });
  let calls = fakeDiscord({ patchStatus: [429, 200] });
  await refreshDiscord(env, null, "a", 1);
  assert.deepEqual(calls.map((c) => c.method), ["PATCH", "PATCH"]);
  // ウェブフックを外す → 書き直さない
  fakeDiscord();
  await handler("PUT", "/api/admin/discord-hooks/:id")({ request: req({ remove_webhook: true }), env, user: admin, params: { id: 1 } });
  calls = fakeDiscord();
  await refreshDiscord(env, null, "a", 1);
  assert.equal(calls.length, 0);
  // 登録し直して、Discordで投稿が消されていたら忘れる
  await register(env);
  fakeDiscord({ patchStatus: [404] });
  await refreshDiscord(env, null, "a", 1);
  assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM discord_posts").first()).n, 0);
});

test("日程調整：PJのスレッドに投稿し、画面そっくりの画像を付け直す。古い状態の画像は送らない。決まったら画像を外す", async () => {
  const { env, DB } = await setup();
  await register(env);
  DB.raw.exec("INSERT INTO schedule_polls (id, project_id, created_by, created_at) VALUES (1, 1, 'u1', 0); INSERT INTO schedule_poll_slots (id, poll_id, starts_at) VALUES (1, 1, '2026-11-05T23:00')");
  let calls = fakeDiscord();
  const member = { id: "u1", isAdmin: false };
  // PJのメンバーが、登録してあるスレッドに投稿する（PJは日程調整のPJに決まっている）
  await handler("POST", "/api/discord-posts")({ request: req({ kind: "p", id: 1, project_id: 2, thread_id: THREAD }), env, user: member });
  assert.match(calls.find((c) => c.method === "POST").body.embeds[0].title, /防災PJ：次回MTGの日程調整/);
  assert.equal((await DB.prepare("SELECT project_id FROM discord_posts").first()).project_id, 1, "日程調整のPJのウェブフックを使う");

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(200)]).toString("base64");
  const image = (body, user = member) => handler("POST", "/api/discord-posts/image")({ request: req(body), env, user });
  DB.raw.exec("INSERT INTO schedule_poll_answers VALUES (1, 'u1', 'yes', 10)");
  const version = await pollVersion(env, 1);
  DB.raw.exec("INSERT INTO schedule_poll_answers VALUES (1, 'u2', 'maybe', 11)");
  calls = fakeDiscord();
  assert.equal((await image({ kind: "p", id: 1, version, png })).stale, true, "古い状態の画像は送らない");
  assert.equal(calls.length, 0);
  const uploads = [];
  globalThis.fetch = async (url, { method, body }) => { uploads.push({ url, method, body }); return new Response("{}", { status: 200 }); };
  await image({ kind: "p", id: 1, version: await pollVersion(env, 1), png });
  assert.ok(uploads[0].url.endsWith(`/messages/900000000000000001?thread_id=${THREAD}`));
  assert.ok(uploads[0].body instanceof FormData && uploads[0].body.get("files[0]"));
  assert.match(JSON.parse(uploads[0].body.get("payload_json")).embeds[0].image.url, /attachment:\/\/schedule\.png/);

  calls = fakeDiscord();
  await refreshDiscord(env, null, "p", 1);
  assert.equal(calls.length, 0, "受付中は、画面が画像と一緒に書き直す");
  DB.raw.exec("INSERT INTO meetings VALUES (5, '2026-11-05T23:00'); UPDATE schedule_polls SET closed_at = 20, meeting_id = 5 WHERE id = 1");
  await refreshDiscord(env, null, "p", 1);
  assert.deepEqual(calls[0].body.attachments, []);
  assert.match(calls[0].body.embeds[0].description, /決まりました：11\/5\(木\) 23:00/);
  await assert.rejects(image({ kind: "p", id: 1, version: "x", png }, { id: "u9", isAdmin: false }), /PJメンバー/);
});
