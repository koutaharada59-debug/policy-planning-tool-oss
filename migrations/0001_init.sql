-- 政策立案ツール：フェーズ1a（認証・PJ・工程・タスク・MTG・議事録）
-- 日付は JST の 'YYYY-MM-DD'、日時は JST の 'YYYY-MM-DDTHH:MM' で持つ（部門は全員日本時間で動くため）

CREATE TABLE users (
  id TEXT PRIMARY KEY,             -- Discord ユーザーID
  name TEXT NOT NULL,              -- サーバー内表示名
  avatar TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'teigen',     -- PJの型（src/project-types.js）
  description TEXT NOT NULL DEFAULT '',
  doc_url TEXT NOT NULL DEFAULT '',        -- 本文を書く Google ドキュメント
  start_date TEXT NOT NULL,                -- 1週目の初日
  presentation_date TEXT,                  -- 政調での最終発表日（決まったら入力）
  current_stage INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',   -- active / done / archived
  meeting_mode TEXT NOT NULL DEFAULT 'adhoc', -- regular（定例）/ adhoc（毎回決める）
  meeting_weekdays TEXT NOT NULL DEFAULT '',  -- 定例の曜日（0=日〜6=土、カンマ区切り）
  meeting_time TEXT NOT NULL DEFAULT '',      -- 'HH:MM'
  meeting_interval INTEGER NOT NULL DEFAULT 1, -- 1=毎週, 2=隔週
  meeting_duration INTEGER NOT NULL DEFAULT 60,
  meeting_place TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_members_user ON project_members(user_id);

CREATE TABLE project_stages (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_no INTEGER NOT NULL,
  start_date TEXT,
  due_date TEXT,
  due_manual INTEGER NOT NULL DEFAULT 0,   -- 1 なら手で変更した期限（自動再計算しない）
  completed_at INTEGER,
  PRIMARY KEY (project_id, stage_no)
);

CREATE TABLE checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_no INTEGER NOT NULL,
  label TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  is_custom INTEGER NOT NULL DEFAULT 0,
  done_by TEXT,
  done_at INTEGER
);
CREATE INDEX idx_checklist_project ON checklist_items(project_id, stage_no, sort);

CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,                 -- 'YYYY-MM-DDTHH:MM'
  duration_min INTEGER NOT NULL DEFAULT 60,
  kind TEXT NOT NULL DEFAULT 'adhoc',      -- regular（定例から自動生成）/ adhoc
  slot TEXT,                               -- 定例の自動生成元の日時。日時を動かしても同じ回を作り直さないため
  place TEXT NOT NULL DEFAULT '',
  cancelled INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_meetings_project ON meetings(project_id, starts_at);
CREATE INDEX idx_meetings_starts ON meetings(starts_at);
CREATE UNIQUE INDEX idx_meetings_slot ON meetings(project_id, slot) WHERE slot IS NOT NULL;

CREATE TABLE minutes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agenda TEXT NOT NULL DEFAULT '',         -- 今回話し合うこと
  summary TEXT NOT NULL DEFAULT '',        -- 話し合いの概要（短く）
  keywords TEXT NOT NULL DEFAULT '',       -- 方向性に関わるキーワード（カンマ区切り）
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_minutes_project ON minutes(project_id);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_no INTEGER,
  title TEXT NOT NULL,
  assignee_id TEXT REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo',     -- todo / doing / done
  source_minute_id INTEGER REFERENCES minutes(id) ON DELETE SET NULL, -- 議事録の「次回までにやること」
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_tasks_project ON tasks(project_id, status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX idx_tasks_minute ON tasks(source_minute_id);
