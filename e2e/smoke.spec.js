// 主な使い方を、実際の画面で通しで確かめる（テスト用の空のデータベースで動く）
// PJを作る → 臨時のMTGを始める → 議事録を書く（自動保存）→ MTGを終える → 記録タブ・議事録を探す・タイムラインに出る
import { test, expect } from "@playwright/test";

const stamp = Date.now().toString(36);

// 画面のエラー（想定外のもの）が出たら失敗にする
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return errors;
}

async function login(page, name = "部門長") {
  await page.goto(`/auth/dev?name=${encodeURIComponent(name)}`);
  await expect(page.locator("#nav")).toBeVisible();
}

// 確認画面のボタンを押す
async function confirm(page, label) {
  await page.locator(".dialog").getByRole("button", { name: label }).click();
}

test("ホームとメニュー", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page);
  await expect(page.locator(".choice strong")).toHaveText(["ミーティングを始める", "確認する", "発表する", "定例"]);
  await expect(page.locator("#nav a")).toHaveText([/ホーム/, /自分のPJ/, /タイムライン/, /カレンダー/]);
  for (const hash of ["#/check", "#/projects", "#/timeline", "#/calendar", "#/teirei", "#/minutes-search", "#/notices", "#/admin"]) {
    await page.goto(`/${hash}`);
    // 読み込みが終わり、エラーの表示が出ていないこと
    await expect(page.locator("#app > .loading")).toHaveCount(0);
    await expect(page.locator("#app > *").first()).toBeVisible();
    await expect(page.locator("#app > .empty a[href=\"#/\"]")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("PJを作ってMTGをし、記録に残る", async ({ page }) => {
  const errors = watchErrors(page);
  await login(page);
  const name = `自動テストPJ ${stamp}`;
  const word = `検索語${stamp}`;

  // PJを作る（メンバーは自分だけ。毎回決めるMTG）
  await page.goto("/#/projects/new");
  await page.fill("#pj-form [name=name]", name);
  await page.check("#pj-form [name=meeting_mode][value=adhoc]");
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page.locator(".pj-header h1")).toHaveText(name);

  // PJ画面から臨時のMTGを始める
  await page.locator(".pj-quick").getByRole("link", { name: /MTG/ }).click();
  await page.getByRole("button", { name: /臨時のMTG/ }).click();
  await page.getByRole("button", { name: "この内容で始める" }).click();
  await expect(page.locator("#minutes-form")).toBeVisible();

  // 議事録を書く（自動保存）
  await page.fill("[name=agenda]", `・${word}について話す`);
  await expect(page.locator("#live-status")).toContainText("自動で保存しました", { timeout: 10_000 });

  // MTGを終える → PJ画面に戻る
  await page.locator("#end-meeting").click();
  await confirm(page, "MTGを終える");
  // PJ画面に戻り、工程の数直線に「いまの工程 → 次」の進み具合の線が出る
  await expect(page.locator(".pj-header h1")).toHaveText(name);
  await expect(page.locator(".stepper li.is-next")).toHaveCount(1);
  await expect(page.locator(".toast")).toContainText("MTGを終えました");

  // 記録タブに出る
  await page.locator(".tabs").getByRole("tab", { name: "記録" }).click();
  await expect(page.locator(".search-hit").first()).toContainText("MTGの議事録");

  // 議事録を探すで見つかる
  await page.goto(`/#/minutes-search?q=${encodeURIComponent(word)}`);
  await expect(page.locator(".search-hit")).toHaveCount(1);
  await expect(page.locator(".search-hit mark").first()).toHaveText(word);

  // タイムラインに出る
  await page.goto("/#/timeline");
  await expect(page.locator(".timeline")).toContainText(`「${name}」が始まりました`);
  await expect(page.locator(".timeline")).toContainText(`「${name}」のMTGの議事録が書かれました`);
  expect(errors).toEqual([]);
});

test("一般のメンバーには管理者メニューが出ない", async ({ page }) => {
  await login(page, `メンバー${stamp}`);
  await expect(page.locator(".home-admin")).toHaveCount(0);
  await page.goto("/#/admin");
  await expect(page.locator("#app")).toContainText("管理者だけ");
});
