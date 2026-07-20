import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const incidentId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "devrelay.session_token", url: "http://127.0.0.1:3000", value: "mock" },
  ]);
});

test("sign-in and organization onboarding remain keyboard-operable", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.context().clearCookies();
  await page.goto("/sign-in?state=expired-session");
  await expect(
    page.getByRole("heading", { name: "Return to the calm control room." }),
  ).toBeVisible();
  await expect(page.getByText("Session expired")).toBeVisible();
  await page.getByRole("link", { name: "Open seeded demo" }).click();
  await expect(page).toHaveURL(/\/app\/acme$/);
  await expect(page.getByText("Read-only product demo:")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Service health" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create service" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Create incident" })).toHaveCount(0);
  await page.goto("/sign-in?state=expired-session");
  await page
    .context()
    .addCookies([{ name: "devrelay.session_token", url: "http://127.0.0.1:3000", value: "mock" }]);
  await page.goto("/onboarding");
  await expect(page.getByText("Create your organization", { exact: true })).toBeVisible();
  await page.getByLabel("Organization name").fill("Northstar Labs");
  await expect(page.getByLabel("Organization slug")).toHaveValue("northstar-labs");
  await page.getByRole("button", { name: "Continue" }).focus();
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Northstar Labs is ready", { exact: true })).toBeVisible();
  await expect(page.getByText(/workspace will start empty/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("a newly created organization starts with an empty real-data dashboard", async ({ page }) => {
  await page.goto("/app/empty-cloud");

  await expect(
    page.getByRole("heading", { name: "Start monitoring your first service" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Create first service" })).toBeVisible();
  await expect(page.getByText("API Gateway")).toHaveCount(0);
});

test("monitor wizard saves, tests, and activates a safe monitor", async ({ page }) => {
  await page.goto(`/app/team-cloud/services/${serviceId}/monitors/new`);
  await expect(page.getByText("Monitor basics", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Request behavior", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Open an incident after 3 consecutive failures.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Run test check" }).click();
  await expect(page.getByText("Endpoint is reachable")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Review and activate", { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole("button", { name: "Activate monitor" }).click();
  await expect(page.getByText("Monitor activated")).toBeVisible();
});

test("incident console keeps public and private communication distinct", async ({ page }) => {
  await page.goto(`/app/team-cloud/incidents/${incidentId}`);
  await expect(page.getByRole("heading", { name: "API errors elevated" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public update" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Internal only" })).toBeVisible();
  const publicUpdate = page.getByLabel("Public update message");
  await publicUpdate.pressSequentially("Mitigation is in progress.");
  await expect(publicUpdate).toHaveValue("Mitigation is in progress.");
  await expect(page.getByRole("button", { name: "Review public update" })).toBeEnabled();
  await page.getByRole("button", { name: "Review public update" }).click();
  await expect(page.getByRole("heading", { name: "Publish this customer update?" })).toBeVisible();
  await page.getByRole("button", { name: "Publish update" }).click();
  await expect(page.getByText("Public update published")).toBeVisible();
});

test("member navigation hides owner-only settings while API authorization stays independently tested", async ({
  page,
}) => {
  await page.goto("/app/member-cloud");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "API keys" })).toHaveCount(0);
});
