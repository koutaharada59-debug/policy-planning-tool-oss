-- 定例の議事録：話したことのメモと、「定例を終わる」を押した時刻
ALTER TABLE dept_meetings ADD COLUMN memo TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_meetings ADD COLUMN ended_at INTEGER;
