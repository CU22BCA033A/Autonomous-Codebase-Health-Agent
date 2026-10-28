import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a running local stack:
 *   npx supabase start && npm run content:seed && npm run setup:users -- …(test accounts below)
 *   npm run build && npm run e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3000", ...devices["Pixel 7"] },
  webServer: { command: "npm run start -- -p 3000", url: "http://127.0.0.1:3000/login", reuseExistingServer: true },
  projects: [{ name: "mobile-chromium", use: { browserName: "chromium" } }],
});
