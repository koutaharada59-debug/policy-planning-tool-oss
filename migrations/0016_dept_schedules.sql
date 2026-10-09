-- 定例の予定（「毎週◯曜日の◯時、この日からこの日まで」）。「定例を始める」で直近の候補を出すのに使う
CREATE TABLE dept_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL,          -- 0=日〜6=土
  time TEXT NOT NULL,                -- 'HH:MM'
  from_date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  to_date TEXT NOT NULL,             -- 'YYYY-MM-DD'
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 定例の開始日時（予定から始めたとき。予定外で始めたときは空）
ALTER TABLE dept_meetings ADD COLUMN starts_at TEXT;
