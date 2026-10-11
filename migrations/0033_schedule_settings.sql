-- 工程の目安日程（部門の基本）。管理者が「期日を設定する」で変える。PJごとに手で変えた期限は、そちらが優先
CREATE TABLE schedule_settings (
  type TEXT PRIMARY KEY,          -- PJの型（teigen など）
  value TEXT NOT NULL,            -- JSON：{ "stages": { "1": [開始日, 終了日], ... }, "presentationDay": 55, "finalDays": 28 }（日＝開始日からの日数）
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
