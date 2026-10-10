import { defineConfig, devices } from "@playwright/test";

// e2e contra o dublê de teste (tests/fake-backend.mjs), usando o cliente HTTP real do frontend.
export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure", locale: "pt-BR", timezoneId: "America/Sao_Paulo" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  workers: 1,
  webServer: [
    { command: "node tests/fake-backend.mjs", port: 4010, reuseExistingServer: false, env: { FAKE_BACKEND_PORT: "4010", FAKE_ASSIGNMENT: "true" } },
    {
      command: "npx next build && npx next start -p 3100",
      port: 3100,
      timeout: 300_000,
      reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_MODE: "http", NEXT_PUBLIC_API_URL: "http://localhost:4010/api/v1", NEXT_PUBLIC_FEATURE_ASSIGNMENT: "true" },
    },
  ],
});
