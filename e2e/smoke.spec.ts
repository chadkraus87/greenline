import { test, expect } from "@playwright/test";

test("loads the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Greenline" })).toBeVisible();
  await expect(page.getByText("Cash runway")).toBeVisible();
});

test("adds a bill and marks it paid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Bills" }).click();
  await page.getByRole("button", { name: "Add bill" }).click();
  await page.getByPlaceholder("Rent, Internet, Car insurance…").fill("Internet");
  await page.getByLabel("Amount").fill("80");
  await page.getByRole("button", { name: "Add bill" }).last().click();
  await expect(page.getByText("Internet")).toBeVisible();
  await page.getByRole("button", { name: "Mark paid" }).first().click();
  await expect(page.getByRole("button", { name: "Mark unpaid" }).first()).toBeVisible();
});

test("adds an income source and sees it on the calendar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Income" }).click();
  await page.getByRole("button", { name: "Add source" }).click();
  await page.getByPlaceholder("Salary, freelance, side project…").fill("Paycheck");
  await page.getByLabel("Amount per payment").fill("2500");
  await page.getByLabel("Frequency").selectOption("monthly");
  await page.getByRole("button", { name: "Add income" }).click();
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("+ Paycheck").first()).toBeVisible();
});
