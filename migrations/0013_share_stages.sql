-- 提言書型：課題・現状リサーチのあとに「課題共有の資料作成・発表準備」（工程2）と「政調での課題共有」（工程3）を足す
-- 既存PJの施策考案以降（工程2〜5）は、工程4〜7にずらす

UPDATE projects SET current_stage = current_stage + 2 WHERE type = 'teigen' AND current_stage >= 2;

-- project_stages は (project_id, stage_no) が主キーなので、いったん大きな番号に逃がしてから戻す
UPDATE project_stages SET stage_no = stage_no + 100
  WHERE stage_no >= 2 AND project_id IN (SELECT id FROM projects WHERE type = 'teigen');
UPDATE project_stages SET stage_no = stage_no - 98
  WHERE stage_no >= 100 AND project_id IN (SELECT id FROM projects WHERE type = 'teigen');

UPDATE checklist_items SET stage_no = stage_no + 2
  WHERE stage_no >= 2 AND project_id IN (SELECT id FROM projects WHERE type = 'teigen');
UPDATE tasks SET stage_no = stage_no + 2
  WHERE stage_no >= 2 AND project_id IN (SELECT id FROM projects WHERE type = 'teigen');

-- リサーチの期限を短くし（手で変えたものはそのまま）、新しい2工程の予定期間を入れる。すでに先へ進んだPJでは済みにする
UPDATE project_stages SET due_date = date((SELECT start_date FROM projects p WHERE p.id = project_id), '+9 days')
  WHERE stage_no = 1 AND due_manual = 0 AND project_id IN (SELECT id FROM projects WHERE type = 'teigen');

INSERT OR IGNORE INTO project_stages (project_id, stage_no, start_date, due_date, completed_at)
  SELECT id, 2, date(start_date, '+10 days'), date(start_date, '+12 days'),
         CASE WHEN current_stage > 2 THEN CAST(strftime('%s', 'now') AS INTEGER) * 1000 END
  FROM projects WHERE type = 'teigen';
INSERT OR IGNORE INTO project_stages (project_id, stage_no, start_date, due_date, completed_at)
  SELECT id, 3, date(start_date, '+13 days'), date(start_date, '+13 days'),
         CASE WHEN current_stage > 3 THEN CAST(strftime('%s', 'now') AS INTEGER) * 1000 END
  FROM projects WHERE type = 'teigen';

-- 新しい2工程のチェックリスト（src/project-types.js と同じ内容）
INSERT INTO checklist_items (project_id, stage_no, label, hint, sort)
  SELECT p.id, 2, c.label, c.hint, c.sort FROM projects p, (
    SELECT 1 AS sort, '共有する内容（理想像・現状・対象・絞った課題）を資料にまとめる' AS label, 'どこが問題かを数字で示す。出典のない数字は使わない' AS hint
    UNION ALL SELECT 2, '資料の形式を決める（ドキュメント or スライド）', ''
    UNION ALL SELECT 3, '役割分担を決める（司会・資料係・議事録係）', ''
    UNION ALL SELECT 4, 'リハーサルをする', 'PJメンバー以外にも見てもらう'
    UNION ALL SELECT 5, '共有資料を前日までに送付する', ''
  ) c WHERE p.type = 'teigen';
INSERT INTO checklist_items (project_id, stage_no, label, hint, sort)
  SELECT p.id, 3, c.label, c.hint, c.sort FROM projects p, (
    SELECT 1 AS sort, '自己紹介を入れる（関心を持ったきっかけ・バックグラウンド）' AS label, '' AS hint
    UNION ALL SELECT 2, '議事録係（発表しないメンバー）を決めておく', ''
    UNION ALL SELECT 3, '政調からのフィードバックを記録する', ''
    UNION ALL SELECT 4, '共有の直後にふり返りをし、施策考案の方針を決める', ''
  ) c WHERE p.type = 'teigen';
