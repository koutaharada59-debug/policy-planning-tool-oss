// エラーの監視：起きたエラーを D1 の error_logs に残し（管理者メニューで見られる）、
// SENTRY_DSN（シークレット）を入れていれば Sentry にも送る（アクションボードと同じ監視の仕組みにそろえられるように）
// 個人情報は送らない：送るのはエラーの内容・場所・ユーザーID（Discordの数字のID）だけ。入力した文章などは送らない

const MAX_TEXT = 2000;
const cut = (s, n = MAX_TEXT) => String(s ?? "").slice(0, n);

export async function reportError(env, { source, message, stack = "", url = "", userId = null }, ctx = null) {
  const at = Date.now();
  const jobs = [
    env.DB.prepare("INSERT INTO error_logs (source, message, stack, url, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(source, cut(message, 500), cut(stack), cut(url, 500), userId, at).run()
      // 古い記録は消す（最新500件だけ残す）
      .then(() => env.DB.prepare("DELETE FROM error_logs WHERE id NOT IN (SELECT id FROM error_logs ORDER BY id DESC LIMIT 500)").run()),
  ];
  if (env.SENTRY_DSN) jobs.push(sendToSentry(env, { source, message, stack, url, userId, at }));
  const all = Promise.allSettled(jobs);
  if (ctx?.waitUntil) ctx.waitUntil(all);
  else await all;
}

// Sentry の envelope API にそのまま送る（SDK を入れずに済むよう、必要な最小限だけ）
async function sendToSentry(env, { source, message, stack, url, userId, at }) {
  const m = String(env.SENTRY_DSN).match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
  if (!m) return;
  const [, key, host, projectId] = m;
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: at / 1000,
    platform: "javascript",
    level: "error",
    environment: env.SITE_LABEL ? "test" : "production",
    tags: { source, app: "policy-planning-tool" },
    user: userId ? { id: userId } : undefined,
    request: url ? { url } : undefined,
    exception: { values: [{ type: "Error", value: cut(message, 500), stacktrace: undefined }] },
    extra: { stack: cut(stack) },
  };
  const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date(at).toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
  await fetch(`https://${host}/api/${projectId}/envelope/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=policy-planning-tool/1.0`,
    },
    body,
  });
}
