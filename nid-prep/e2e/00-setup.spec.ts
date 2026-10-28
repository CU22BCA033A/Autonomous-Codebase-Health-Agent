import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { MENTOR, STUDENT } from "./helpers";

config({ path: ".env.local", quiet: true });

// Runs first. On a fresh database it performs the one-time setup; afterwards it checks the page is locked.
test("one-time setup creates both accounts, then locks", async ({ page }) => {
  await page.goto("/setup");
  if (await page.getByText("Setup is complete").isVisible()) {
    await expect(page.getByRole("link", { name: "Go to sign in" })).toBeVisible();
    return;
  }
  await page.getByLabel("Email").first().fill(STUDENT.email);
  await page.getByLabel("Password").first().fill(STUDENT.password);
  await page.getByLabel("Email").nth(1).fill(MENTOR.email);
  await page.getByLabel("Password").nth(1).fill(MENTOR.password);

  await page.getByLabel(/service_role/).fill("not-the-key");
  await page.getByRole("button", { name: /Create accounts/ }).click();
  await expect(page.getByText("isn't this project's")).toBeVisible();
  await page.screenshot({ path: "test-results/setup-form.png", fullPage: true });

  await page.getByLabel(/service_role/).fill(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
  await page.getByRole("button", { name: /Create accounts/ }).click();
  await expect(page).toHaveURL(/\/login\?setup=done/);
  await expect(page.getByText("Setup complete")).toBeVisible();

  await page.goto("/setup");
  await expect(page.getByText("Setup is complete")).toBeVisible();
});
