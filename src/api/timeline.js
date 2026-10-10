// 部門のタイムライン：PJの始まり・工程の完了・議事録・定例の進捗・発表・PJの完了・政策の種・定例の終わりを、新しい順に
// 新しい記録は作らず、それぞれの表にある時刻から組み立てる。mine=1 なら自分が入っているPJのものだけ（部門全体の出来事は出す）
import { getType } from "../project-types.js";

export const routes = [
  ["GET", "/api/timeline", getTimeline],
];

const DAYS = 30;
const LIMIT = 100;

async function getTimeline({ env, url, user }) {
  const mine = url.searchParams.get("mine") === "1";
  const since = Date.now() - DAYS * 86400 * 1000;
  const sinceJst = new Date(since + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const pj = mine ? "AND p.id IN (SELECT project_id FROM project_members WHERE user_id = ?2)" : "AND ?2 IS NOT NULL";
  const q = (sql) => env.DB.prepare(sql).bind(since, user.id).all().then((r) => r.results);
  const [started, stages, minutes, reports, presents, completed, seeds, teirei] = await Promise.all([
    q(`SELECT p.id, p.name, p.created_at AS at, p.created_by AS actor FROM projects p
       WHERE p.created_at >= ?1 AND p.status != 'archived' ${pj}`),
    q(`SELECT p.id, p.name, p.type, s.stage_no, s.completed_at AS at FROM project_stages s JOIN projects p ON p.id = s.project_id
       WHERE s.completed_at >= ?1 AND s.stage_no > 0 AND p.status != 'archived' ${pj}`),
    q(`SELECT p.id, p.name, n.meeting_id, n.created_at AS at, n.created_by AS actor FROM minutes n JOIN projects p ON p.id = n.project_id
       WHERE n.created_at >= ?1 AND p.status != 'archived' ${pj}`),
    q(`SELECT p.id, p.name, r.updated_at AS at, r.updated_by AS actor FROM dept_reports r JOIN projects p ON p.id = r.project_id
       WHERE r.updated_at >= ?1 AND p.status != 'archived' ${pj}`),
    q(`SELECT p.id, p.name, r.kind, r.sub, r.fb_end AS at, r.created_by AS actor FROM presentation_records r JOIN projects p ON p.id = r.project_id
       WHERE r.fb_end >= ?1 AND p.status != 'archived' ${pj}`),
    q(`SELECT p.id, p.name, p.completed_at AS at FROM projects p WHERE p.completed_at >= ?1 AND p.status = 'done' ${pj}`),
    // 政策の種・定例は部門全体の出来事（自分のPJだけでも出す）
    env.DB.prepare(`SELECT s.title, s.round_id, s.created_at AS at, s.created_by AS actor FROM seeds s WHERE s.created_at >= ?`).bind(since).all().then((r) => r.results),
    env.DB.prepare(`SELECT id, held_on, ended_at AS at FROM dept_meetings WHERE ended_at >= ? AND held_on >= ?`).bind(since, sinceJst).all().then((r) => r.results),
  ]);

  const stageName = (type, no) => getType(type)?.stages.find((s) => s.no === no)?.name || "";
  const items = [
    ...started.map((r) => ({ at: r.at, icon: "🚀", text: `「${r.name}」が始まりました`, href: `#/projects/${r.id}`, actor: r.actor, kind: "project" })),
    ...stages.map((r) => ({ at: r.at, icon: "✅", text: `「${r.name}」が工程${r.stage_no}「${stageName(r.type, r.stage_no)}」を完了しました`, href: `#/projects/${r.id}`, kind: "stage" })),
    ...minutes.map((r) => ({ at: r.at, icon: "📝", text: `「${r.name}」のMTGの議事録が書かれました`, href: `#/meetings/${r.meeting_id}?mode=view`, actor: r.actor, kind: "minutes" })),
    ...reports.map((r) => ({ at: r.at, icon: "📊", text: `「${r.name}」が定例の進捗を書きました`, href: `#/projects/${r.id}?tab=records`, actor: r.actor, kind: "report" })),
    ...presents.map((r) => ({ at: r.at, icon: "🎤", text: `「${r.name}」が発表しました（${r.kind === "seicho" ? `政調MTG・${r.sub === "policy" ? "政策発表" : "課題共有"}` : "その他の発表"}）`, href: `#/projects/${r.id}?tab=records`, actor: r.actor, kind: "present" })),
    ...completed.map((r) => ({ at: r.at, icon: "🎉", text: `「${r.name}」が完了しました！`, href: `#/projects/${r.id}`, kind: "done" })),
    ...seeds.map((r) => ({ at: r.at, icon: "🌱", text: `政策の種「${r.title}」が出されました`, href: `#/seeds/${r.round_id}`, actor: r.actor, kind: "seed" })),
    ...teirei.map((r) => ({ at: r.at, icon: "🏛️", text: "部門の定例が終わりました", href: `#/teirei/${r.id}`, kind: "teirei" })),
  ].sort((a, b) => b.at - a.at).slice(0, LIMIT);

  // した人の名前と顔（わかるものだけ）
  const ids = [...new Set(items.map((i) => i.actor).filter(Boolean))];
  const users = ids.length
    ? (await env.DB.prepare(`SELECT id, name, avatar FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results : [];
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));
  return { items: items.map(({ actor, ...i }) => ({ ...i, actor: actor && byId[actor] ? byId[actor] : null })), days: DAYS };
}
