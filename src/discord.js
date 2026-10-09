// Discord Bot（アクションボードのBot）でのDM送信とフォーラムのスレッド作成。
// トークンは DISCORD_BOT_TOKEN（シークレット）。ログにトークンや本文は出さない

const API = "https://discord.com/api/v10";

export function botConfigured(env) {
  return Boolean(env.DISCORD_BOT_TOKEN);
}

async function call(env, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 本文やトークンは出さず、どのAPIで何番が返ったかだけ残す
    console.error("discord api failed", path.replace(/\d{17,20}/g, ":id"), res.status);
    return null;
  }
  return res.json();
}

// DMを送る。送れたら true（ローカル確認用ユーザーやBot未設定なら false）
export async function sendDm(env, userId, content) {
  if (!botConfigured(env) || !/^\d{17,20}$/.test(userId)) return false;
  const channel = await call(env, "/users/@me/channels", { recipient_id: userId });
  if (!channel) return false;
  const msg = await call(env, `/channels/${channel.id}/messages`, {
    content: content.slice(0, 2000),
    allowed_mentions: { parse: [] },
  });
  return Boolean(msg);
}

// フォーラムにスレッド（投稿）を作る。作れたらスレッドID
export async function createForumThread(env, { name, content, mentionUserIds = [] }) {
  if (!botConfigured(env) || !env.HEARING_FORUM_ID) return null;
  const body = {
    name: name.slice(0, 100),
    message: { content: content.slice(0, 2000), allowed_mentions: { users: mentionUserIds.filter((id) => /^\d{17,20}$/.test(id)) } },
  };
  if (env.HEARING_FORUM_TAG_ID) body.applied_tags = [env.HEARING_FORUM_TAG_ID];
  const thread = await call(env, `/channels/${env.HEARING_FORUM_ID}/threads`, body);
  return thread?.id || null;
}

export function threadUrl(env, threadId) {
  return `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${threadId}`;
}

export function mention(userId) {
  return /^\d{17,20}$/.test(userId) ? `<@${userId}>` : "";
}
