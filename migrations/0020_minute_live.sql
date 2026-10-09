-- 議事録の同時編集：いま議事録を開いている人と、項目ごとに入力している人（数秒ごとに更新。古いものは無視する）
CREATE TABLE minute_viewers (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (meeting_id, user_id)
);
-- field: agenda（今回話し合うこと）/ summary（概要）/ todos（次回までにやること）。1項目を書けるのは1人ずつ
CREATE TABLE minute_editors (
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (meeting_id, field)
);
