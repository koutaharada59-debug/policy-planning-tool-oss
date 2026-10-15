-- PJごとのDiscordの投稿先（管理者メニューで登録する）。アンケート・日程調整を、既存のスレッドに投稿して書き直す（src/discord-post.js）
-- webhook_url はパスワードと同じ扱い：画面には返さない（PJの情報とは別の表にして、PJの一覧などに混ざらないようにする）
CREATE TABLE discord_hooks (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT '',   -- ウェブフックのチャンネル（URLを登録したときにDiscordに聞いて入れる）
  thread_id TEXT NOT NULL DEFAULT '',    -- いつもの投稿先のスレッド（投稿するときに変えられる）
  updated_by TEXT,
  updated_at INTEGER
);

-- 投稿：どのPJのウェブフックで、どのスレッドに投稿したか（書き直すときに使う）
ALTER TABLE discord_posts ADD COLUMN project_id INTEGER;
ALTER TABLE discord_posts ADD COLUMN thread_id TEXT NOT NULL DEFAULT '';
