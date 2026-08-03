import { test, expect, type Page } from "@playwright/test";

/**
 * Greenline is auth-gated, so the suite splits in two:
 *  - Public tests always run and cover the sign-in / sign-up / reset surface.
 *  - Authenticated tests run only when E2E_EMAIL + E2E_PASSWORD are set, so CI
 *    and fresh clones stay green without embedding credentials in the repo.
 *    Use a dedicated throwaway account, never a real one:
 *      E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe("public (unauthenticated)", () => {
  test("shows the sign-in screen, not the budget", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    // The app itself must never render without a session.
    await expect(page.getByText("Cash runway")).toHaveCount(0);
  });

  test("can switch to create-account and back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.getByPlaceholder("At least 8 characters")).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("rejects a too-short password on sign-up", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create an account" }).click();
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("forgot-password flow is reachable", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("button", { name: "Email me a reset link" })).toBeVisible();
    // Password field is hidden in reset mode.
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to sign in" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

});

test.describe("live backend", () => {
  // Needs a real Supabase project to answer. CI builds against placeholder
  // config, so this is opt-in: E2E_LIVE_BACKEND=1 npm run test:e2e
  test.skip(!process.env.E2E_LIVE_BACKEND, "set E2E_LIVE_BACKEND=1 to test against a real Supabase project");

  test("wrong credentials show an error and do not sign in", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid|credential/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Cash runway")).toHaveCount(0);
  });
});

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(EMAIL!);
  await page.getByLabel("Password").fill(PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Greenline" })).toBeVisible({ timeout: 20000 });
}

test.describe("authenticated", () => {
  test.skip(!EMAIL || !PASSWORD, "set E2E_EMAIL and E2E_PASSWORD to run authenticated tests");

  test("signs in and renders the dashboard", async ({ page }) => {
    await signIn(page);
    await expect(page.getByText("Cash runway")).toBeVisible();
    await expect(page.getByText("Expected income")).toBeVisible();
  });

  test("every tab renders without error", async ({ page }) => {
    await signIn(page);
    for (const name of ["Bills", "Income", "Expenses", "Budgets", "Goals", "Reserves", "Debt", "Reports"]) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    }
  });

  test("adds a bill, marks it paid, then deletes it", async ({ page }) => {
    await signIn(page);
    const unique = `E2E Bill ${Date.now()}`;
    await page.getByRole("tab", { name: "Bills" }).click();
    await page.getByRole("button", { name: "Add bill" }).first().click();
    await page.getByPlaceholder("Rent, Internet, Car insurance…").fill(unique);
    await page.getByLabel("Amount").fill("42");
    await page.getByRole("button", { name: "Add bill" }).last().click();

    const row = page.locator(".gl-row", { hasText: unique });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.getByRole("button", { name: "Mark paid" }).click();
    await expect(row.getByRole("button", { name: "Mark unpaid" })).toBeVisible();

    // Clean up so reruns stay idempotent.
    await row.getByRole("button", { name: "Delete bill" }).click();
    await expect(page.locator(".gl-row", { hasText: unique })).toHaveCount(0);
  });

  test("signing out returns to the sign-in screen", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
