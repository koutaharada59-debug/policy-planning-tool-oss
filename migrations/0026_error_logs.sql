-- エラーの記録（サーバーで起きたエラーと、画面で起きたエラー）。管理者メニューで見られる。最新500件だけ残す
CREATE TABLE error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,          -- server / client
  message TEXT NOT NULL,
  stack TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_error_logs_created ON error_logs(created_at);
