-- 工程のチェック項目を「スキップ」できるようにする（PJによっては要らない項目があるため）
-- スキップした項目は未チェックのまま残り、取り消し線で表示される。工程を進めるときの「済んでいない項目」に数えない
ALTER TABLE checklist_items ADD COLUMN skipped_at INTEGER;
ALTER TABLE checklist_items ADD COLUMN skipped_by TEXT;
