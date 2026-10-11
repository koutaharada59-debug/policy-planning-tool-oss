-- 部門長を、管理者メニューから選べるようにする（設定ファイルの HEAD_IDS に頼らない）
CREATE TABLE heads (
  user_id TEXT PRIMARY KEY,
  added_by TEXT,
  created_at INTEGER NOT NULL
);
