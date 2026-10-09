-- PJ決め：種ごとのコメント
CREATE TABLE seed_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id INTEGER NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_seed_comments_seed ON seed_comments(seed_id, created_at);

-- 工程のチェック：チェックが入ったら部門長・副部門長に知らせる項目（資料の送付は部門長が行うため）
ALTER TABLE checklist_items ADD COLUMN notify_leaders INTEGER NOT NULL DEFAULT 0;

-- 既存のPJの「資料を送付する」項目を、「部門長をメンションしてフォーラムに投稿する」に変える（src/project-types.js と同じ文言）
UPDATE checklist_items SET label = '部門長をメンションして、共有資料を前日までにフォーラムに投稿する',
  hint = '政調への送付は部門長が行います。チェックすると部門長・副部門長に通知が届きます', notify_leaders = 1
  WHERE label = '共有資料を前日までに送付する' AND is_custom = 0;
UPDATE checklist_items SET label = '部門長をメンションして、発表資料を前日までにフォーラムに投稿する',
  hint = '党本部への送付は部門長が行います。チェックすると部門長・副部門長に通知が届きます', notify_leaders = 1
  WHERE label = '発表資料を前日までに党本部へ送付する' AND is_custom = 0;
UPDATE checklist_items SET label = '部門長をメンションして、改訂版をフォーラムに投稿する',
  hint = '党本部への提出は部門長が行います。チェックすると部門長・副部門長に通知が届きます', notify_leaders = 1
  WHERE label = '改訂版を党本部へ提出する' AND is_custom = 0;
