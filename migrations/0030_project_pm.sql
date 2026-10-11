-- PM（PJのマネージャー）。初回のMTGで決める
ALTER TABLE projects ADD COLUMN pm_id TEXT REFERENCES users(id);
