-- 管理者（画面から追加・削除できる）。wrangler.toml の HEAD_IDS（部門長）は常に管理者で、ここには入れない
CREATE TABLE admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  added_by TEXT,
  created_at INTEGER NOT NULL
);
