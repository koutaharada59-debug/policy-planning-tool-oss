import { test } from "node:test";
import assert from "node:assert/strict";
import { notionPageId, minutesBlocks } from "../src/notion.js";

test("NotionのURLからページIDを取り出す", () => {
  assert.equal(notionPageId("https://app.notion.com/p/3f72f6877cc180bfa782cc337e9aa440?source=copy_link"), "3f72f6877cc180bfa782cc337e9aa440");
  assert.equal(notionPageId("https://www.notion.so/team/PJ-3f72f6877cc180b2a36afd2a39f2696b"), "3f72f6877cc180b2a36afd2a39f2696b");
  assert.equal(notionPageId("https://example.com/"), null);
});

test("議事録をNotionのブロックにする", () => {
  const blocks = minutesBlocks({
    homework: [{ title: "資料を集める", assignee_name: "佐藤", status: "done" }],
    agenda: "・課題を絞る\n・次の担当",
    summary: "",
    todos: [{ title: "事例を3件", assignee_name: "山田", due_date: "2026-10-19", status: "todo" }],
  });
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types, ["heading_3", "to_do", "heading_3", "bulleted_list_item", "bulleted_list_item", "heading_3", "paragraph", "heading_3", "to_do"]);
  assert.equal(blocks[1].to_do.checked, true);
  assert.equal(blocks[3].bulleted_list_item.rich_text[0].text.content, "課題を絞る");
  assert.equal(blocks[8].to_do.rich_text[0].text.content, "事例を3件（山田・10/19まで）");
});
