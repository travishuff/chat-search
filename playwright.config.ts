import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Keep in sync with tests/e2e/seed.ts, which seeds this database.
const E2E_DB_PATH = path.join(__dirname, "tests", "e2e", ".tmp", "e2e.db");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Seed first: Playwright launches web servers before globalSetup runs,
    // so the seed must be part of the server command.
    command: "npx tsx tests/e2e/seed.ts && npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      CHAT_SEARCH_DB_PATH: E2E_DB_PATH,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
