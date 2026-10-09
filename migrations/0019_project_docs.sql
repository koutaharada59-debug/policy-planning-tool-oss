-- PJのドキュメントを3種類にする
--   memo_doc_url   … リサーチドキュメント（調べたことをメンバーがタブを分けて書き残す）。議事録に埋め込む
--   doc_url        … 政調用の本文（政策提言として形の整ったもの）。これまでの「本文ドキュメント」
--   script_doc_url … 政調用の台本
ALTER TABLE projects ADD COLUMN memo_doc_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN script_doc_url TEXT NOT NULL DEFAULT '';
