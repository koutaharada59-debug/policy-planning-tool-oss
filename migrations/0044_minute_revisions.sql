-- 議事録の文章（今回話し合うこと・概要）の履歴。保存した内容は、あとから消されたり上書きされたりしても、ここから戻せる
-- 自動保存のたびに行を増やさないよう、同じ人が続けて書いている間（2分以内）は同じ行を書き直す
CREATE TABLE minute_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  field TEXT NOT NULL,                     -- agenda / summary
  body TEXT NOT NULL,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_minute_revisions ON minute_revisions(meeting_id, field, updated_at);
