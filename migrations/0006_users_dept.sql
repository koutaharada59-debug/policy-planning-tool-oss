-- ログインを学生チームのサーバー全員に広げる。政策立案部門のロールの有無はログイン時に記録し、
-- 外部ヒアリングの閲覧範囲（部門メンバー・代表・管理者のみ）に使う
ALTER TABLE users ADD COLUMN is_dept INTEGER NOT NULL DEFAULT 0;
-- これまでは部門のロールがないとログインできなかったので、既存のユーザーは部門メンバー
UPDATE users SET is_dept = 1;
