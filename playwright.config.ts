import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 90000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3101",
    trace: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run start -- --port 3101 --hostname 127.0.0.1",
        url: "http://127.0.0.1:3101",
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
});
