-- MTGの画面で選んだけれど、まだ「保存する」「決める」を押していないもの（次回の日程・MTGの進め方）
-- 画面を移っても消えないように、選ぶたびに自動で残しておく。JSON
ALTER TABLE meetings ADD COLUMN draft TEXT NOT NULL DEFAULT '';
