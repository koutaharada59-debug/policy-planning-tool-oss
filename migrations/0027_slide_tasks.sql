-- 工程2（課題共有の資料作成）と工程5（提言書作成・発表準備）に「スライドを作る」を足す。
-- これから作るPJは雛形（src/project-types.js）から入る。すでにあるPJには、形式を決める項目のすぐ後ろに足す
-- （形式を決める項目がないPJは、その工程の最後に足す）

-- 工程2：「資料の形式を決める」の後ろ
UPDATE checklist_items SET sort = sort + 1
WHERE stage_no = 2
  AND project_id IN (SELECT id FROM projects WHERE type = 'teigen')
  AND project_id NOT IN (SELECT project_id FROM checklist_items WHERE label = '課題共有のスライドを作る')
  AND sort > (SELECT f.sort FROM checklist_items f WHERE f.project_id = checklist_items.project_id AND f.stage_no = 2
              AND f.label = '資料の形式を決める（ドキュメント or スライド）');

INSERT INTO checklist_items (project_id, stage_no, label, hint, sort)
SELECT p.id, 2, '課題共有のスライドを作る', '理想像・現状・対象・絞った課題を、数字と出典つきで。ドキュメントで共有する場合はスキップ',
  COALESCE((SELECT f.sort + 1 FROM checklist_items f WHERE f.project_id = p.id AND f.stage_no = 2
            AND f.label = '資料の形式を決める（ドキュメント or スライド）'),
           (SELECT COALESCE(MAX(c.sort), -1) + 1 FROM checklist_items c WHERE c.project_id = p.id AND c.stage_no = 2))
FROM projects p
WHERE p.type = 'teigen'
  AND p.id NOT IN (SELECT project_id FROM checklist_items WHERE label = '課題共有のスライドを作る');

-- 工程5：「アウトプットの形式を決める」の後ろ
UPDATE checklist_items SET sort = sort + 1
WHERE stage_no = 5
  AND project_id IN (SELECT id FROM projects WHERE type = 'teigen')
  AND project_id NOT IN (SELECT project_id FROM checklist_items WHERE label = '最終発表のスライドを作る')
  AND sort > (SELECT f.sort FROM checklist_items f WHERE f.project_id = checklist_items.project_id AND f.stage_no = 5
              AND f.label = 'アウトプットの形式を決める（ドキュメント or スライド）');

INSERT INTO checklist_items (project_id, stage_no, label, hint, sort)
SELECT p.id, 5, '最終発表のスライドを作る', 'Figmaのテンプレートを使う。ドキュメントで発表する場合はスキップ',
  COALESCE((SELECT f.sort + 1 FROM checklist_items f WHERE f.project_id = p.id AND f.stage_no = 5
            AND f.label = 'アウトプットの形式を決める（ドキュメント or スライド）'),
           (SELECT COALESCE(MAX(c.sort), -1) + 1 FROM checklist_items c WHERE c.project_id = p.id AND c.stage_no = 5))
FROM projects p
WHERE p.type = 'teigen'
  AND p.id NOT IN (SELECT project_id FROM checklist_items WHERE label = '最終発表のスライドを作る');
