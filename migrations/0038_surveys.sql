-- ホームに出すアンケート（管理者が追加する）
-- kind = 'pj'：PJ決めアンケート（PJ決めの募集回 round_id へ投票しに行くボタン）
-- kind = 'other'：その他のアンケート。method で決め方を選ぶ
--   majority（多数決：1つ選ぶ）／ wish（希望を聞く：いくつでも選べる＋ひとこと）／ rcv（順位を付ける・1つに決める）／ stv（順位を付ける・seats 個に決める）
CREATE TABLE surveys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '[]',   -- 選択肢（JSONの文字列の配列）
  seats INTEGER NOT NULL DEFAULT 1,
  round_id INTEGER,
  closed_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 回答（1人1つ。書き直せる）。だれが何に入れたかは、管理者だけが見られる
CREATE TABLE survey_answers (
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  answer TEXT NOT NULL,                 -- JSON：{ picks: [選択肢の番号…（順位の順）], comment }
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (survey_id, user_id)
);
