-- PJの完了：最終提出が済んだらPJメンバーが部門長に承認を依頼し、部門長（管理者）が承認すると完了になる
ALTER TABLE projects ADD COLUMN completion_requested_at INTEGER;
ALTER TABLE projects ADD COLUMN completion_requested_by TEXT;
ALTER TABLE projects ADD COLUMN completed_at INTEGER;
ALTER TABLE projects ADD COLUMN completed_by TEXT;
