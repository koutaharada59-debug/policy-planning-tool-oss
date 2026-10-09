-- 「正式なPJにする」を取り消しても、PJの記録（議事録・タスク・MTGなど）は消さずに残す
-- 取り消したPJはアーカイブ（一覧から隠す）にし、どの種から取り消したかを覚えておく。もう一度PJにするときに、そのPJを戻せる
ALTER TABLE seeds ADD COLUMN prev_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
