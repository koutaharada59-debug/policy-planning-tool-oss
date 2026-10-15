-- PJのDiscordのチャンネル（日程調整アンケートの回答状況をここに投稿する。src/discord-post.js）
ALTER TABLE projects ADD COLUMN discord_channel_id TEXT NOT NULL DEFAULT '';
