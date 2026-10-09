-- フェーズ3：発表準備・政調からのフィードバック・最終提出

-- 発表準備と最終提出（PJごとに1行。最初に保存したときに作る）
CREATE TABLE presentation_prep (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  abstract_status TEXT NOT NULL DEFAULT 'todo',   -- todo（未提出）/ done（提出済み）
  abstract_submitted_on TEXT,
  abstract_url TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT '',         -- document / slides
  slide_url TEXT NOT NULL DEFAULT '',             -- 発表資料（Figma・スライド等）
  role_mc TEXT REFERENCES users(id),              -- 司会
  role_slides TEXT REFERENCES users(id),          -- スライド係
  role_minutes TEXT REFERENCES users(id),         -- 議事録係（発表しないメンバー）
  role_screenshots TEXT REFERENCES users(id),     -- スクショ係
  materials_sent_on TEXT,                         -- 発表資料を党本部へ送付した日
  final_status TEXT NOT NULL DEFAULT 'todo',      -- todo（準備中）/ done（提出済み）
  final_submitted_on TEXT,
  final_url TEXT NOT NULL DEFAULT '',             -- 最終提出した改訂版
  final_memo TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

-- リハーサル（2週間前から複数回。PJメンバー以外・他部門の人にも見てもらう）
CREATE TABLE rehearsals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,                 -- 'YYYY-MM-DDTHH:MM'
  duration_min INTEGER NOT NULL DEFAULT 60,
  place TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',       -- 見てもらう人（他部門の人など）
  done INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',           -- 出た指摘（短く）
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rehearsals_project ON rehearsals(project_id, starts_at);
CREATE INDEX idx_rehearsals_starts ON rehearsals(starts_at);

-- 政調からのフィードバック（項目ごとに反映状況を管理）
CREATE TABLE feedback_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,                   -- 指摘の内容（短く）
  source TEXT NOT NULL DEFAULT '',         -- 誰から（政調・党本部など）
  status TEXT NOT NULL DEFAULT 'todo',     -- todo（未対応）/ doing（対応中）/ done（反映済み）
  owner_id TEXT REFERENCES users(id),
  response TEXT NOT NULL DEFAULT '',       -- どう反映したか
  measure_id INTEGER REFERENCES measures(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_feedback_project ON feedback_items(project_id, status);
