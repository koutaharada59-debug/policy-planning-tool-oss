// Discord OAuth2 ログインと署名付きCookieセッション（希望PJアンケートの実装を流用）
import { HttpError, json, idList } from "./util.js";

const SESSION_COOKIE = "ppt_session";
const STATE_COOKIE = "ppt_oauth_state";
// 部門のロールはログイン時に確認する。外れた人が長く使い続けないよう、セッションは2週間で切る
const SESSION_TTL = 60 * 60 * 24 * 14;

export async function handleAuth(request, env, url) {
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  if (url.pathname === "/auth/login") {
    if (!/^\d{17,20}$/.test(env.DISCORD_CLIENT_ID || "") || !env.DISCORD_CLIENT_SECRET) {
      console.error("DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET が正しく設定されていません");
      return redirect("/?error=config");
    }
    const state = randomId();
    const authorize = new URL("https://discord.com/oauth2/authorize");
    authorize.search = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID.trim(),
      response_type: "code",
      redirect_uri: `${url.origin}/auth/callback`,
      scope: "identify guilds.members.read",
      state,
      prompt: "none",
    });
    return redirect(authorize.toString(), [
      cookie(STATE_COOKIE, `${state}.${encodeURIComponent(returnTo)}`, { maxAge: 600, secure: isSecure(url) }),
    ]);
  }

  if (url.pathname === "/auth/callback") {
    const raw = getCookie(request, STATE_COOKIE) || "";
    const savedState = raw.slice(0, raw.indexOf("."));
    const savedReturn = raw.slice(raw.indexOf(".") + 1);
    const code = url.searchParams.get("code");
    if (!code || !savedState || url.searchParams.get("state") !== savedState) {
      console.error("oauth callback rejected", { hasCode: !!code, hasStateCookie: !!savedState });
      return redirect("/?error=login");
    }
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID.trim(),
        client_secret: env.DISCORD_CLIENT_SECRET.trim(),
        grant_type: "authorization_code",
        code,
        redirect_uri: `${url.origin}/auth/callback`,
      }),
    });
    if (!tokenRes.ok) {
      console.error("discord token exchange failed", tokenRes.status);
      return redirect("/?error=login");
    }
    const { access_token } = await tokenRes.json();
    const auth = { headers: { Authorization: `Bearer ${access_token}` } };

    const me = await (await fetch("https://discord.com/api/users/@me", auth)).json();
    const res = await fetch(`https://discord.com/api/users/@me/guilds/${env.DISCORD_GUILD_ID}/member`, auth);
    if (res.status === 404) return redirect("/?error=guild");
    if (!res.ok) {
      console.error("discord guild member fetch failed", res.status);
      return redirect("/?error=login");
    }
    const member = await res.json();
    // サーバーのメンバーなら誰でもログインできる。部門のロールの有無は、外部ヒアリングの閲覧範囲に使う
    const user = {
      isDept: !env.DEPT_ROLE_ID || (member.roles || []).includes(env.DEPT_ROLE_ID),
      id: me.id,
      name: member.nick || me.global_name || me.username,
      avatar: member.avatar
        ? `https://cdn.discordapp.com/guilds/${env.DISCORD_GUILD_ID}/users/${me.id}/avatars/${member.avatar}.png?size=64`
        : me.avatar
          ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
          : null,
    };
    return loginAs(env, url, user, safeReturnTo(decodeURIComponent(savedReturn || "/")));
  }

  // ローカル確認用。.dev.vars で DEV_LOGIN=true かつ localhost のときだけ有効
  if (url.pathname === "/auth/dev" && env.DEV_LOGIN === "true" && isLocal(url)) {
    const name = (url.searchParams.get("name") || "テストユーザー").slice(0, 32);
    // 名前が「部外」で始まると、政策立案部門のロールがない人として入る
    return loginAs(env, url, { id: `dev-${name}`, name, avatar: null, isDept: !name.startsWith("部外") }, returnTo);
  }

  if (url.pathname === "/auth/logout") {
    return redirect("/", [cookie(SESSION_COOKIE, "", { maxAge: 0, secure: isSecure(url) })]);
  }

  return json({ error: "Not found" }, 404);
}

async function loginAs(env, url, user, returnTo) {
  await env.DB.prepare(
    `INSERT INTO users (id, name, avatar, updated_at, is_dept) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(id) DO UPDATE SET name = ?2, avatar = ?3, updated_at = ?4, is_dept = ?5`
  ).bind(user.id, user.name, user.avatar, Date.now(), user.isDept ? 1 : 0).run();
  const token = await signSession(env, { uid: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
  return redirect(returnTo, [
    cookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL, secure: isSecure(url) }),
    cookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(url) }),
  ]);
}

export async function currentUser(request, env) {
  const session = await verifySession(env, getCookie(request, SESSION_COOKIE));
  if (!session) return null;
  const row = await env.DB.prepare("SELECT id, name, avatar, is_dept FROM users WHERE id = ?").bind(session.uid).first();
  if (!row) return null;
  const { is_dept, ...user } = row;
  // 部門長・代表はヒアリングの承認者（wrangler.toml で固定）。
  // 管理者は部門長 ＋ 管理者メニューで追加された人（PJ決め・全PJの編集などができる）
  user.isHead = idList(env.HEAD_IDS).includes(user.id);
  user.isRep = idList(env.REP_IDS).includes(user.id);
  user.isAdmin = user.isHead || idList(env.ADMIN_IDS).includes(user.id)
    || Boolean(await env.DB.prepare("SELECT 1 FROM admins WHERE user_id = ?").bind(user.id).first());
  user.isDept = Boolean(is_dept);
  // 外部ヒアリング（外部の方の情報）を見られるのは、政策立案部門のメンバー・代表・管理者
  user.canSeeHearings = user.isDept || user.isRep || user.isAdmin;
  return user;
}

export async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "ログインしてください");
  return user;
}

// ---------- Session signing (HMAC-SHA256) ----------

async function hmacKey(env) {
  if (!env.SESSION_SECRET) throw new Error("SESSION_SECRET is not set");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signSession(env, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifySession(env, token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), fromB64url(sig), new TextEncoder().encode(body));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

// ---------- Helpers ----------

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function randomId() {
  return b64url(crypto.getRandomValues(new Uint8Array(12)));
}

function safeReturnTo(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function isLocal(url) {
  return ["localhost", "127.0.0.1"].includes(url.hostname);
}

function isSecure(url) {
  return url.protocol === "https:";
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

function cookie(name, value, { maxAge, secure }) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}
