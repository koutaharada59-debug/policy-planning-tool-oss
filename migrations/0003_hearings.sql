-- フェーズ1b：外部ヒアリングの申請（部門長 → 代表の承認、渉外フォーラムへのスレッド作成）と通知
-- 外部の方の連絡先は持たない（所属と名前だけ）

CREATE TABLE hearings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id TEXT NOT NULL REFERENCES users(id),
  target_affiliation TEXT NOT NULL,        -- 誰に：所属
  target_name TEXT NOT NULL,               -- 誰に：名前
  target_type TEXT NOT NULL,               -- 相手の種類（src/api/hearings.js の TARGET_TYPES）
  requires_approval INTEGER NOT NULL,      -- 相手の種類からサーバー側で決める
  purpose TEXT NOT NULL,                   -- 何のために
  related_issue TEXT NOT NULL DEFAULT '',  -- 関連する課題（フェーズ2で樹形図のノードに置き換える）
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  memo TEXT NOT NULL DEFAULT '',
  -- pending（申請中）/ head_ok（部門長確認済）/ rep_ok（代表確認済）/ done（実施済）
  -- returned（差し戻し）/ recorded（承認不要・記録のみ）/ withdrawn（取り下げ）
  status TEXT NOT NULL,
  thread_id TEXT,                          -- 渉外フォーラムに作ったスレッド
  result_summary TEXT NOT NULL DEFAULT '', -- 実施後に聞けた内容の要点
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_hearings_status ON hearings(status, updated_at);
CREATE INDEX idx_hearings_applicant ON hearings(applicant_id);

-- 申請・承認・差し戻しの記録
CREATE TABLE hearing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hearing_id INTEGER NOT NULL REFERENCES hearings(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id),      -- NULL = システム（Bot）
  action TEXT NOT NULL,                    -- submit / resubmit / head_approve / head_return / rep_approve / rep_return / thread_created / thread_failed / done / withdraw
  comment TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_hearing_events ON hearing_events(hearing_id, created_at);

-- DM通知の記録。DMが届かなかった（相手がDMを受け取らない設定など）ものは、ツールの「確認する」に出す
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  dm_ok INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);
