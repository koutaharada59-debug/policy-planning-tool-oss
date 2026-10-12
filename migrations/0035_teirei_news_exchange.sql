-- 定例の議事録のテンプレート：事務連絡／各PJの進捗共有／ニュース勉強会／意見交換会
-- ニュース勉強会・意見交換会の欄（事務連絡と同じく、定例の前に書いておけて、定例を始めると議事録に移る）
ALTER TABLE dept_meetings ADD COLUMN news TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_meetings ADD COLUMN exchange TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_notice_days ADD COLUMN news TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_notice_days ADD COLUMN exchange TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_notice_draft ADD COLUMN news TEXT NOT NULL DEFAULT '';
ALTER TABLE dept_notice_draft ADD COLUMN exchange TEXT NOT NULL DEFAULT '';
