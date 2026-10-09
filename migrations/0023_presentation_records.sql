-- 発表の記録：発表ごとに、種類（政調MTG：課題共有／政策発表・その他の発表）・発表とフィードバックの時間・メモを残す
-- 時間はサーバーに記録した開始・終了の時刻から出す（再読み込みしても、ほかの人の画面でも同じ）
CREATE TABLE presentation_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'seicho',          -- seicho（政調MTG）/ other（その他の発表）
  sub TEXT NOT NULL DEFAULT 'share',            -- 政調MTGのとき：share（課題共有）/ policy（政策発表）
  present_target INTEGER NOT NULL DEFAULT 10,   -- 目標時間（分）
  fb_target INTEGER NOT NULL DEFAULT 10,
  present_start INTEGER, present_end INTEGER, fb_start INTEGER, fb_end INTEGER,
  memo TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_presentation_records_project ON presentation_records(project_id, created_at);
-- 発表中に追加したフィードバックを、その発表の記録に結び付ける
ALTER TABLE feedback_items ADD COLUMN presentation_id INTEGER REFERENCES presentation_records(id) ON DELETE SET NULL;
-- 同時編集の「いま開いている人・書いている欄」（発表の記録など。scope ごと）
CREATE TABLE live_presence (
  scope TEXT NOT NULL,
  user_id TEXT NOT NULL,
  field TEXT,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (scope, user_id)
);
-- PJのドキュメントに「課題共有」の資料を追加
ALTER TABLE projects ADD COLUMN share_doc_url TEXT NOT NULL DEFAULT '';
