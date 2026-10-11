-- 代表（ヒアリングの最終確認をする人）を、管理者メニューから選べるようにする。
-- wrangler.toml の REP_IDS で決めた人（固定）に加えて、ここに入っている人も代表になる
CREATE TABLE reps (
  user_id TEXT PRIMARY KEY,
  added_by TEXT,
  created_at INTEGER NOT NULL
);
