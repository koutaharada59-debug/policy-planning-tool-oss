-- 工程の目安日程を運用マニュアルに合わせる（すでにあるPJも、手で変えていない期限だけ直す）
--   工程1 課題・現状リサーチ：1〜2週目（開始日〜13日後）
--   工程2 課題共有の資料作成：2週目、リサーチと並行（7〜13日後）
--   工程3 政調での課題共有  ：3週目のはじめ（14〜16日後）
UPDATE project_stages SET
  start_date = (SELECT p.start_date FROM projects p WHERE p.id = project_stages.project_id),
  due_date = (SELECT date(p.start_date, '+13 days') FROM projects p WHERE p.id = project_stages.project_id)
WHERE stage_no = 1 AND due_manual = 0
  AND project_id IN (SELECT id FROM projects WHERE type = 'teigen' AND start_date IS NOT NULL);

UPDATE project_stages SET
  start_date = (SELECT date(p.start_date, '+7 days') FROM projects p WHERE p.id = project_stages.project_id),
  due_date = (SELECT date(p.start_date, '+13 days') FROM projects p WHERE p.id = project_stages.project_id)
WHERE stage_no = 2 AND due_manual = 0
  AND project_id IN (SELECT id FROM projects WHERE type = 'teigen' AND start_date IS NOT NULL);

UPDATE project_stages SET
  start_date = (SELECT date(p.start_date, '+14 days') FROM projects p WHERE p.id = project_stages.project_id),
  due_date = (SELECT date(p.start_date, '+16 days') FROM projects p WHERE p.id = project_stages.project_id)
WHERE stage_no = 3 AND due_manual = 0
  AND project_id IN (SELECT id FROM projects WHERE type = 'teigen' AND start_date IS NOT NULL);

-- 工程5の「スライドを作る」を、Figmaで作ることが分かる名前にする
UPDATE checklist_items SET
  label = 'Figmaで発表資料（スライド）を作る',
  hint = 'Figmaのスライドテンプレートを使う（スライドは政策立案部門が作成）。ドキュメントで発表する場合はスキップ'
WHERE label = '最終発表のスライドを作る';

-- タスク「Figmaで発表資料（スライド）を作る」を、進行中のPJに足す（担当は未定、期限は工程5の期限）
INSERT INTO tasks (project_id, stage_no, title, due_date, status, created_by, created_at, updated_at)
SELECT p.id, 5, 'Figmaで発表資料（スライド）を作る',
  (SELECT s.due_date FROM project_stages s WHERE s.project_id = p.id AND s.stage_no = 5),
  'todo', p.created_by, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM projects p
WHERE p.type = 'teigen' AND p.status = 'active'
  AND p.id NOT IN (SELECT project_id FROM tasks WHERE title = 'Figmaで発表資料（スライド）を作る');
