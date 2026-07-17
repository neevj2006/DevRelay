import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("public outage, incident update, and subscription surfaces remain accessible", async ({
  page,
}) => {
  await page.goto("/status/acme");
  await expect(page.getByRole("heading", { name: "major outage in progress" })).toBeVisible();
  await expect(page.getByText("API errors elevated", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API Gateway" })).toBeVisible();
  await page.getByLabel("Email address").fill("subscriber@example.test");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("public status fits a mobile viewport without horizontal overflow", async ({ page }) => {
  await page.goto("/status/acme");
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  await expect(page.getByText("Current status")).toBeVisible();
});
