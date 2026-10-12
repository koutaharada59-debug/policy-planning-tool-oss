-- メンバーのアカウントの対応（Discordのアカウントが主体）：Googleアカウント（メールアドレス）・Notionアカウント
-- 見られるのは管理者だけ（管理者メニュー）
ALTER TABLE users ADD COLUMN google_email TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN notion_user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN notion_name TEXT NOT NULL DEFAULT '';
