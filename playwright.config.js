// 画面を実際に動かす自動テスト（Playwright。アクションボードと同じ道具）
//   npm run test:e2e
// テスト用の空のデータベース（.wrangler/e2e）でローカルのサーバーを立ち上げ、ローカル確認用ログインで入って操作する。
// 本番・テスト版・ふだんのローカルのデータには触らない
import { defineConfig } from "@playwright/test";

const PORT = 8799;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx wrangler d1 migrations apply policy-planning --local --persist-to .wrangler/e2e && npx wrangler dev --port ${PORT} --persist-to .wrangler/e2e`,
    url: `http://localhost:${PORT}/api/session`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
