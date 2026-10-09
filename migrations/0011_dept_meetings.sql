-- 部門の定例：事務連絡・各PJの進捗共有・定例のあとのイベント

-- 定例（1日に1回。部門長・副部門長が「定例を始める」で作る）
CREATE TABLE dept_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  held_on TEXT NOT NULL UNIQUE,          -- 'YYYY-MM-DD'
  notice TEXT NOT NULL DEFAULT '',       -- 事務連絡（部門長・副部門長が記入）
  event TEXT NOT NULL DEFAULT '',        -- 定例のあとのイベント：'' / news（ニュース勉強会）/ exchange（意見交換会）
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- 各PJの進捗共有（dept_meeting_id が NULL のものは、次の定例に向けて書いているもの）
CREATE TABLE dept_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dept_meeting_id INTEGER REFERENCES dept_meetings(id) ON DELETE CASCADE,
  done TEXT NOT NULL DEFAULT '',         -- 前回の定例からやったこと
  next TEXT NOT NULL DEFAULT '',         -- 次の定例までにやること
  issues TEXT NOT NULL DEFAULT '',       -- 困っていること・相談したいこと
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX idx_dept_reports_target ON dept_reports(project_id, COALESCE(dept_meeting_id, 0));
CREATE INDEX idx_dept_reports_meeting ON dept_reports(dept_meeting_id);
