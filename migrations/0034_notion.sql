-- Notion連携：PJのNotionページ（議事録を作る先）と、MTGごとに作った議事録ページ
ALTER TABLE projects ADD COLUMN notion_url TEXT NOT NULL DEFAULT '';
ALTER TABLE meetings ADD COLUMN notion_url TEXT NOT NULL DEFAULT '';
