-- 定例の議事録の「枠」：並び順と、部門長・副部門長が足した枠（題名と中身）。JSON
-- {"order":["notice","reports","news","exchange","c1ab"],"custom":{"c1ab":{"title":"…","body":"…"}}}
ALTER TABLE dept_meetings ADD COLUMN layout TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_notice_days ADD COLUMN layout TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_notice_draft ADD COLUMN layout TEXT NOT NULL DEFAULT '';
