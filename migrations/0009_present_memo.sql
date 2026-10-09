-- 「発表する」画面の雑メモ（発表中・質疑応答のメモを自由に書く）
ALTER TABLE presentation_prep ADD COLUMN present_memo TEXT NOT NULL DEFAULT '';
