-- 最近削除した項目：消したMTG（議事録・そこで作ったタスクごと）やタスクを30日のあいだ残し、元に戻せるようにする
CREATE TABLE trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                 -- 'meeting' | 'task'
  project_id INTEGER NOT NULL,
  title TEXT NOT NULL,                -- 一覧に出す名前（例：10/13（火） 20:00 のMTG）
  data TEXT NOT NULL,                 -- 消したときの中身（JSON）
  deleted_by TEXT,
  deleted_at INTEGER NOT NULL
);
CREATE INDEX idx_trash_project ON trash(project_id, deleted_at);
