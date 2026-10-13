// PJの人事（メンバー）が変わったら、NotionのPJページの「参加者」も合わせる
import { notionConfigured, syncProjectPeople } from "./notion.js";

export async function syncPeopleFor(env, projectIds) {
  if (!notionConfigured(env)) return;
  const { results: known } = await env.DB.prepare("SELECT notion_user_id FROM users WHERE notion_user_id != ''").all();
  const knownIds = known.map((r) => r.notion_user_id);
  for (const pid of [...new Set(projectIds)].filter(Boolean)) {
    const project = await env.DB.prepare("SELECT id, notion_url FROM projects WHERE id = ?").bind(pid).first();
    if (!project?.notion_url) continue;
    const { results } = await env.DB.prepare(
      "SELECT u.notion_user_id FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? AND u.notion_user_id != ''"
    ).bind(pid).all();
    await syncProjectPeople(env, project.notion_url, results.map((r) => r.notion_user_id), knownIds)
      .catch((err) => console.error("notion people sync failed", pid, err?.status, err?.code));
  }
}

// 後回しで動かす（返事を待たせない）
export const syncPeopleLater = (env, ctx, projectIds) => ctx?.waitUntil(syncPeopleFor(env, projectIds));
