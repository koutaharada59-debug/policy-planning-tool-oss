-- タスクの担当に知らせた相手（議事録の自動保存のたびに知らせないよう、保存・MTGを終えるときにまとめて送るため）
ALTER TABLE tasks ADD COLUMN notified_assignee TEXT;
UPDATE tasks SET notified_assignee = assignee_id;
