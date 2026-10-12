-- 定例の議事録を、Notionの部門の「議事録」データベースにも自動で入れる（作ったページのURL）
ALTER TABLE dept_meetings ADD COLUMN notion_url TEXT;
