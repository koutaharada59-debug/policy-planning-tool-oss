-- Discordに投稿したアンケートの回答状況（src/discord-post.js）。回答が入るたびに、この投稿を書き直す
-- kind：a（アンケート）／ r（PJ決め）／ p（日程調整アンケート）。webhook_id：投稿したWebhook（ほかのWebhookの投稿は書き直せない）
CREATE TABLE discord_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  ref_id INTEGER NOT NULL,
  webhook_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT NOT NULL DEFAULT '',
  rev INTEGER NOT NULL DEFAULT 0,        -- 書き直しの順番（後から始めた書き直しが、最新の内容で終わるように）
  has_image INTEGER NOT NULL DEFAULT 0,  -- 画面そっくりの画像を付けているか（日程調整。画像は答えた人の画面で作って送る）
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_discord_posts_ref ON discord_posts(kind, ref_id);
