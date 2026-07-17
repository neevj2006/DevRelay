import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /public-status\.spec\.ts/,
    },
  ],
  reporter: process.env.CI ? "github" : "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node tests/e2e/mock-api.mjs",
      reuseExistingServer: true,
      url: "http://127.0.0.1:4000/health",
    },
    {
      command: "pnpm --filter @devrelay/web build && pnpm --filter @devrelay/web start",
      env: {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:4000",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      },
      reuseExistingServer: true,
      timeout: 120_000,
      url: "http://127.0.0.1:3000/sign-in",
    },
  ],
});
