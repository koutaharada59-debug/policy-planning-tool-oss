-- 次の定例の事務連絡（定例を始める前に、部門長・副部門長が書いておく）。1行だけ持つ
-- 「定例を始める」を押すと、その定例の事務連絡に移して空にする
CREATE TABLE dept_notice_draft (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  notice TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO dept_notice_draft (id) VALUES (1);
