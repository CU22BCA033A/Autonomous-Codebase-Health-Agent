import type { Page } from "@playwright/test";

export const STUDENT = { email: process.env.E2E_STUDENT_EMAIL ?? "veeru@example.com", password: process.env.E2E_STUDENT_PASSWORD ?? "veeru-test-1" };
export const MENTOR = { email: process.env.E2E_MENTOR_EMAIL ?? "gb@example.com", password: process.env.E2E_MENTOR_PASSWORD ?? "gb-test-12" };

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
