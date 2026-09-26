import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node ../zhilume-server/dist/main.js",
      url: "http://127.0.0.1:4319/api/v1/system",
      env: {
        ZHILUME_PORT: "4319",
        ZHILUME_DATA: ".test-data/playwright",
        ZHILUME_TOKEN: "e2e-local-fixture-only",
      },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173",
      env: { ZHILUME_DEV_SERVER: "http://127.0.0.1:4319" },
      reuseExistingServer: false,
    },
  ],
});
