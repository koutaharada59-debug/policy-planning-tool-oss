-- 工程のチェック項目を、それをやったMTG（議事録）に結び付ける。後から「この段階の議事録はこれ」と分かるように
ALTER TABLE checklist_items ADD COLUMN meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL;
