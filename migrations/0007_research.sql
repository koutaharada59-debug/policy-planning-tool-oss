-- フェーズ2：資料管理・因果の樹形図・施策

-- 資料。project_id が NULL なら部門共通の資料
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,                      -- paper / book / whitepaper / statistics / news / hearing / government / other
  publisher TEXT NOT NULL DEFAULT '',      -- 出典（発行元・著者・媒体）
  published_on TEXT NOT NULL DEFAULT '',   -- 日付（年だけでもよいので文字列）
  summary TEXT NOT NULL DEFAULT '',        -- 要点メモ
  primary_checked INTEGER NOT NULL DEFAULT 0, -- 一次出典を確認済み
  checked_by TEXT,
  checked_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_sources_project ON sources(project_id, created_at);

-- 因果の樹形図のノード。親 = 結果、子 = その原因（原因 → 結果）。根は「課題」
CREATE TABLE tree_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES tree_nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'cause',      -- issue（課題）/ cause（原因）
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  evidence TEXT NOT NULL DEFAULT '',       -- 数字による根拠
  cases_domestic TEXT NOT NULL DEFAULT '', -- 参考事例（国内）
  cases_overseas TEXT NOT NULL DEFAULT '', -- 参考事例（海外）
  memo TEXT NOT NULL DEFAULT '',
  owner_id TEXT REFERENCES users(id),
  sort INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_tree_nodes_project ON tree_nodes(project_id, parent_id, sort);

-- ノードの出典（資料管理と紐づけ）
CREATE TABLE node_sources (
  node_id INTEGER NOT NULL REFERENCES tree_nodes(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, source_id)
);

-- 施策。どの課題（ノード）から生じたかを持つ
CREATE TABLE measures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id INTEGER REFERENCES tree_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  current_state TEXT NOT NULL DEFAULT '',  -- 現状
  problem TEXT NOT NULL DEFAULT '',        -- 課題（現状のどこが問題かを数字で）
  cases TEXT NOT NULL DEFAULT '',          -- 参考事例（国内・海外）
  what TEXT NOT NULL DEFAULT '',           -- 施策の内容：何をするか
  flow TEXT NOT NULL DEFAULT '',           -- 導入フロー
  budget TEXT NOT NULL DEFAULT '',         -- 予算感
  faq TEXT NOT NULL DEFAULT '',
  owner_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_measures_project ON measures(project_id, node_id);

-- ヒアリングの「関連する課題」を樹形図のノードから選べるようにする（自由記述も残す）
ALTER TABLE hearings ADD COLUMN node_id INTEGER REFERENCES tree_nodes(id) ON DELETE SET NULL;
