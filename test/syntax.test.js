// 画面側（public/js）のファイルが構文エラーなく読み込めるか（1つでも壊れると画面が真っ白になるため）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/js/", import.meta.url));
const files = ["", "views"].flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith(".js")).map((f) => join(root, d, f)));

for (const file of files) {
  test(`構文：${file.slice(root.length)}`, () => {
    const r = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: readFileSync(file) });
    assert.equal(r.status, 0, r.stderr.toString());
  });
}
