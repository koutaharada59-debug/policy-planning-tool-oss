-- 課題共有の準備（工程2）にも、Figmaでスライドを作るタスクを足す
UPDATE checklist_items SET
  label = 'Figmaで課題共有のスライドを作る',
  hint = 'Figmaのスライドテンプレートを使う。理想像・現状・対象・絞った課題を、数字と出典つきで。ドキュメントで共有する場合はスキップ'
WHERE label = '課題共有のスライドを作る';

-- 進行中で、まだ課題共有（工程3）を終えていないPJに、タスクを足す（担当は未定、期限は工程2の期限）
INSERT INTO tasks (project_id, stage_no, title, due_date, status, created_by, created_at, updated_at)
SELECT p.id, 2, 'Figmaで課題共有のスライドを作る',
  (SELECT s.due_date FROM project_stages s WHERE s.project_id = p.id AND s.stage_no = 2),
  'todo', p.created_by, CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM projects p
WHERE p.type = 'teigen' AND p.status = 'active' AND p.current_stage <= 3
  AND p.id NOT IN (SELECT project_id FROM tasks WHERE title = 'Figmaで課題共有のスライドを作る');
