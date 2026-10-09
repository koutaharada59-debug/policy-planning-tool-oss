-- PJ決め（工程0）：政策の種の投稿 → ランク付け投票（RCV）→ 開票 → PJ化と人員の割り振り
-- 希望PJアンケートの仕組みをこのツールに移したもの

-- 募集回（例：「2026年秋のPJ決め」）。締め切りを過ぎると投稿・投票が止まり、開票結果が全員に公開される
CREATE TABLE seed_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  deadline TEXT,                           -- JST 'YYYY-MM-DDTHH:MM'。NULL なら締め切りなし
  seats INTEGER NOT NULL DEFAULT 3,        -- 開票で決めるPJの数
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES seed_rounds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                     -- 「なぜAはBなのか」の形を促す
  description TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',            -- 分野（例：教育、防災）
  icon TEXT NOT NULL DEFAULT '🌱',
  categories TEXT NOT NULL DEFAULT '[]',   -- 出どころ（news / seicho / bucho）。部門長だけが付けられる
  created_by TEXT,                         -- NULL = 部門の初期案・取り込み
  author_name TEXT NOT NULL DEFAULT '',    -- 取り込んだ種の投稿者名（ユーザーがいないとき用）
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, -- PJになったら、そのPJ
  sort INTEGER NOT NULL DEFAULT 0,         -- 掲載順（開票の同数決着にも使う）
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_seeds_round ON seeds(round_id, sort);

-- 軽いリサーチメモ（AIでの調査も可。ただし一次出典を確認する）
CREATE TABLE seed_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id INTEGER NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_seed_notes_seed ON seed_notes(seed_id);

-- 投票（＝そのPJに関わりたい）。rank 1 が第1希望
CREATE TABLE seed_votes (
  round_id INTEGER NOT NULL REFERENCES seed_rounds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  seed_id INTEGER NOT NULL REFERENCES seeds(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, seed_id)
);
CREATE INDEX idx_seed_votes_round ON seed_votes(round_id, user_id, rank);
