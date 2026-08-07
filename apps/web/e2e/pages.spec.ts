import { expect, test } from "@playwright/test";

test("landing renders", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBe(true);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("how-it-works renders", async ({ page }) => {
  const res = await page.goto("/how-it-works");
  expect(res?.ok()).toBe(true);
  await expect(page.locator("h1").first()).toBeVisible();
});
