// 議事録が消えないための仕組みのテスト（Notionへの送り方・ログインの延長）
import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceNotionPage, createNotionPage } from "../src/notion.js";
import { renewSession } from "../src/auth.js";

// Notion のAPIの代わり。呼ばれた順に記録する
function fakeNotion(oldCount) {
  const calls = [];
  let n = 0;
  globalThis.fetch = async (url, { method, body } = {}) => {
    const path = url.replace("https://api.notion.com/v1", "");
    const data = body ? JSON.parse(body) : null;
    calls.push({ method, path, size: data?.children?.length });
    const ok = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { "content-type": "application/json" } });
    if (method === "GET" && path.includes("/children")) return ok({ results: Array.from({ length: oldCount }, () => ({ id: `old${n++}`, type: "paragraph" })), has_more: false });
    if (method === "POST" && path === "/pages") return ok({ id: "page1", url: "https://www.notion.so/page1" });
    return ok({});
  };
  return calls;
}
const env = { NOTION_TOKEN: "x" };
const blocks = (k) => Array.from({ length: k }, (_, i) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: `行${i}` } }] } }));

test("Notionの書き直しは、新しい中身を足してから古い中身を消す（途中で失敗しても空にならない）", async () => {
  const calls = fakeNotion(3);
  await replaceNotionPage(env, "https://www.notion.so/3f72f6877cc180b2a36afd2a39f2696b", "題名", blocks(250));
  const appends = calls.filter((c) => c.method === "PATCH" && c.path.endsWith("/children"));
  const deletes = calls.filter((c) => c.method === "DELETE");
  // 250個は 100・100・50 に分けて全部送る
  assert.deepEqual(appends.map((c) => c.size), [100, 100, 50]);
  assert.equal(deletes.length, 3);
  assert.ok(calls.indexOf(appends[appends.length - 1]) < calls.indexOf(deletes[0]), "消す前に足し終えている");
});

test("Notionのページを作るとき、100個を超えた分も足す", async () => {
  const calls = fakeNotion(0);
  await createNotionPage(env, "https://www.notion.so/3f72f6877cc180b2a36afd2a39f2696b", "題名", blocks(130));
  assert.equal(calls.find((c) => c.method === "POST").size, 100);
  assert.deepEqual(calls.filter((c) => c.method === "PATCH").map((c) => c.size), [30]);
});

// ログインの延長：残りが7日を切ったら14日に延ばす
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function token(secret, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}
test("ログインは、使っていれば切れる前に延びる", async () => {
  const secret = "test-secret";
  const url = new URL("https://example.com/api/x");
  const now = Math.floor(Date.now() / 1000);
  const env2 = { SESSION_SECRET: secret };
  // Cookie の名前は auth.js の SESSION_COOKIE と同じ
  const make = async (exp) => new Request(url, { headers: { Cookie: `ppt_session=${await token(secret, { uid: "u1", exp })}` } });
  assert.equal(await renewSession(await make(now + 13 * 86400), env2, url), null, "まだ十分残っていれば延ばさない");
  const renewed = await renewSession(await make(now + 2 * 86400), env2, url);
  assert.ok(renewed && renewed.startsWith("ppt_session=") && renewed.includes("Max-Age=1209600"), "残り2日なら14日に延ばす");
  assert.equal(await renewSession(await make(now - 10), env2, url), null, "切れたものは延ばさない");
});
