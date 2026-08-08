import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 4499);

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(port),
      NEXT_PUBLIC_DEMO_MODE: "1",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:beast@localhost:5544/beast",
      // demo throttles are product behaviour under test elsewhere; here they
      // would make repeated local runs flip live commissions into replays
      DEMO_RUNS_PER_IP_DAILY: "1000",
      DEMO_DAILY_TOKEN_BUDGET: "100000000",
    },
  },
});
