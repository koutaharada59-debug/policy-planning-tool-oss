-- タスクの担当を複数人に（例：最初のリサーチは全員で同じことを調べる）
-- tasks.assignee_id は「1人目の担当」として残す（これまでの画面・集計のため）。担当の全員はこの表
CREATE TABLE task_assignees (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  notified INTEGER NOT NULL DEFAULT 0,   -- 「担当になりました」を知らせたか
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_task_assignees_user ON task_assignees(user_id);

-- これまでのタスクの担当を移す
INSERT INTO task_assignees (task_id, user_id, notified)
  SELECT id, assignee_id, CASE WHEN notified_assignee = assignee_id THEN 1 ELSE 0 END FROM tasks WHERE assignee_id IS NOT NULL;
