-- 事務連絡の書き置きを、定例の日ごとに持つ（「事務連絡を書く」で予定の日時を選んで書く）
-- その日の定例を始めると、その日の事務連絡に移して消す。日付を選ばずに書いたものは、これまでどおり dept_notice_draft
CREATE TABLE dept_notice_days (
  held_on TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'（定例の日）
  notice TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1
);
