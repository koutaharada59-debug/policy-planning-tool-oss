// Notionをつなぐ前に書いた議事録を、あとからまとめてNotionに入れる（管理者）
// まだNotionに入っていないもの（notion_url が空）だけ。1回に少しずつ入れて、残りの数を返す（画面が残りがなくなるまで繰り返す）
import { HttpError } from "../util.js";
import { requireAdmin } from "./common.js";
import { notionConfigured } from "../notion.js";
import { syncNotion } from "./meetings.js";
import { syncTeireiNotion, teireiNotionOn } from "./dept.js";

export const routes = [
  ["GET", "/api/admin/notion-backfill", countBackfill],
  ["POST", "/api/admin/notion-backfill", runBackfill],
];

const BATCH = 8;
// 中身のあるMTGの議事録（PJのNotionページが登録されているPJ）
const MEETINGS_SQL = `FROM meetings m JOIN projects p ON p.id = m.project_id JOIN minutes n ON n.meeting_id = m.id
  WHERE (m.notion_url IS NULL OR m.notion_url = '') AND m.cancelled = 0 AND p.notion_url IS NOT NULL AND p.notion_url != ''
    AND (TRIM(COALESCE(n.agenda, '')) != '' OR TRIM(COALESCE(n.summary, '')) != '' OR EXISTS (SELECT 1 FROM tasks t WHERE t.source_minute_id = n.id))`;
// 終わった定例（回の番号は syncTeireiNotion が見て、決めた回より前は何もしない）
const TEIREI_SQL = "FROM dept_meetings d WHERE (d.notion_url IS NULL OR d.notion_url = '') AND d.ended_at IS NOT NULL";

async function counts(env) {
  const [a, b] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS n ${MEETINGS_SQL}`).first(),
    teireiNotionOn(env) ? env.DB.prepare(`SELECT COUNT(*) AS n ${TEIREI_SQL}`).first() : { n: 0 },
  ]);
  return { meetings: a.n, teirei: b.n };
}

async function countBackfill({ env, user }) {
  requireAdmin(user);
  return { notion: notionConfigured(env), ...(await counts(env)) };
}

async function runBackfill({ env, user }) {
  requireAdmin(user);
  if (!notionConfigured(env)) throw new HttpError(400, "Notion連携（NOTION_TOKEN）がまだ設定されていません");
  const { results: ms } = await env.DB.prepare(`SELECT m.id ${MEETINGS_SQL} ORDER BY m.starts_at LIMIT ?`).bind(BATCH).all();
  const { results: ds } = teireiNotionOn(env) && ms.length < BATCH
    ? await env.DB.prepare(`SELECT d.id ${TEIREI_SQL} ORDER BY d.held_on LIMIT ?`).bind(BATCH - ms.length).all() : { results: [] };
  let done = 0;
  const failed = [];
  for (const m of ms) await syncNotion(env, m.id).then(() => done++).catch((err) => failed.push(`MTG ${m.id}（${err.status || err.message}）`));
  for (const d of ds) {
    await syncTeireiNotion(env, d.id).then(() => done++).catch((err) => failed.push(`定例 ${d.id}（${err.status || err.message}）`));
  }
  if (failed.length) console.error("notion backfill failed", failed.join(", "));
  return { done, failed, ...(await counts(env)) };
}
