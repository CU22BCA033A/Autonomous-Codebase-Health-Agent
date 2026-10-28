import { expect, test } from "@playwright/test";
import { MENTOR, STUDENT, login } from "./helpers";

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/exam-day");
  await expect(page).toHaveURL(/\/login\?next=%2Fexam-day/);
});

test("student sees home with countdown and daily loop", async ({ page }) => {
  await login(page, STUDENT);
  await expect(page.getByText(/Good (morning|afternoon|evening), Veeru/)).toBeVisible();
  await expect(page.getByText("Next milestone")).toBeVisible();
  await expect(page.getByText("Daily test")).toBeVisible();
  await page.screenshot({ path: "test-results/m1-home.png", fullPage: true });
});

test("student ticks a logistics checklist item and it persists", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/exam-day");
  const box = page.getByLabel(/Pencils: HB, 2B, 4B/);
  const was = await box.isChecked();
  await box.click();
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByLabel(/Pencils: HB, 2B, 4B/)).toBeChecked({ checked: !was });
  await page.screenshot({ path: "test-results/m1-exam-day.png", fullPage: true });
});

test("mentor edits the home message and the student sees it", async ({ page, browser }) => {
  await login(page, MENTOR);
  await expect(page).toHaveURL(/\/admin/);
  await page.goto("/admin/settings");
  const msg = `Proud of you — ${Date.now()}`;
  await page.getByLabel(/Message on Veeru/).fill(msg);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  const ctx = await browser.newContext();
  const student = await ctx.newPage();
  await login(student, STUDENT);
  await expect(student.getByText(msg)).toBeVisible();
  await ctx.close();
});

test("student cannot open mentor pages", async ({ page }) => {
  await login(page, STUDENT);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
});
