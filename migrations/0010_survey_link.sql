-- PJ決めの募集回を、希望PJアンケートと連動させる（アンケートの選択肢・投票・締め切りを読み込むだけ。アンケートには書き込まない）

-- source = 'survey' の募集回は、希望PJアンケートの内容を映す（投票・種の追加はアンケートで行う）
ALTER TABLE seed_rounds ADD COLUMN source TEXT NOT NULL DEFAULT '';
ALTER TABLE seed_rounds ADD COLUMN synced_at INTEGER;

-- アンケート側の選択肢ID
ALTER TABLE seeds ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX idx_seeds_external ON seeds(round_id, external_id) WHERE external_id IS NOT NULL;

-- アンケートから取り込んだ募集回は、連動する募集回にする
UPDATE seed_rounds SET source = 'survey' WHERE title = '2026年秋のPJ決め';
