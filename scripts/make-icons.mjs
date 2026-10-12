// public/icon.svg から、ホーム画面に追加したときのアイコン（PNG）を作る
//   node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const svg = readFileSync(new URL("../public/icon.svg", import.meta.url), "utf8");
// [ファイル名, 大きさ, 余白の割合（Androidの「マスク可能」アイコンは丸く切られるので、絵を小さめにする）]
const SIZES = [["apple-touch-icon.png", 180, 0], ["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["icon-maskable-512.png", 512, 0.12], ["favicon-32.png", 32, 0]];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size * (1 - pad * 2);
  await page.setContent(`<html><body style="margin:0;background:#c2efd8">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:linear-gradient(135deg,#4fd2b8,#c2efd8)">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" style="width:${inner}px;height:${inner}px"></div></body></html>`);
  await page.screenshot({ path: fileURLToPath(new URL(`../public/${name}`, import.meta.url)) });
  console.log("made", name);
}
await browser.close();
