-- 日程調整アンケート（定例でないPJで、次回のMTGの日程が決められないとき）
-- 候補の日時を並べて、PJのメンバーが ○△× で答える。決めたらその日時でMTGを作る
CREATE TABLE schedule_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  note TEXT NOT NULL DEFAULT '',
  duration_min INTEGER NOT NULL DEFAULT 60,
  place TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  meeting_id INTEGER                     -- 決めた日時で作ったMTG
);
CREATE INDEX idx_schedule_polls_project ON schedule_polls(project_id, closed_at);

CREATE TABLE schedule_poll_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id INTEGER NOT NULL REFERENCES schedule_polls(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL                -- 'YYYY-MM-DDTHH:MM'（日本時間）
);
CREATE INDEX idx_schedule_poll_slots_poll ON schedule_poll_slots(poll_id);

-- 答え：yes（○ 行ける）／ maybe（△ たぶん）／ no（× 無理）
CREATE TABLE schedule_poll_answers (
  slot_id INTEGER NOT NULL REFERENCES schedule_poll_slots(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (slot_id, user_id)
);
