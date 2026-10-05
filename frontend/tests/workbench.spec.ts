import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1"
      ? route.continue()
      : route.abort(),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Research & rehearsal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Shape your next study." }),
  ).toBeVisible();
});

test("design, preview, paired rehearsal, actual records, downloads and frozen revisions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "New study", exact: true }).click();
  await page
    .getByLabel("Study title", { exact: true })
    .fill("Notebook conformity · browser verification");
  await page
    .getByLabel("Hypothesis", { exact: true })
    .fill("RESEARCHER_ONLY_CANARY");
  await mkdir("../artifacts", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/desktop-design.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save & preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "See what participants see." }),
  ).toBeVisible();
  await page
    .getByText("System instruction & response schema", { exact: true })
    .click();
  await expect(page.locator(".json").first()).not.toContainText(
    "RESEARCHER_ONLY_CANARY",
  );
  await page
    .getByRole("button", { name: "No-peer control", exact: true })
    .click();
  await expect(
    page.getByText("The same question, considered again.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Peer exposure", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/desktop-preview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Configure rehearsal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByText("6 / 6 sessions complete · 12 attempts recorded", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(6);
  await expect(page.locator(".metric-value").first()).toHaveText("2/ 3");
  const runId = await page.locator(".exports a").first().getAttribute("href");
  expect(runId).toBeTruthy();
  await page.locator(".attempt-list button").first().click();
  await expect(page.locator(".attempt-detail .json")).not.toContainText(
    "RESEARCHER_ONLY_CANARY",
  );
  await page.getByRole("tab", { name: "Raw response", exact: true }).click();
  await expect(page.locator(".attempt-detail .json")).toContainText("choice");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/desktop-rehearsal.png",
    fullPage: true,
  });
  for (const name of ["Complete JSON", "Sessions CSV", "Attempts CSV"]) {
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", { name, exact: true }).click();
    const download = await downloadEvent;
    const path = await download.path();
    expect(path).toBeTruthy();
    const content = await readFile(path!, "utf-8");
    expect(content).toContain("run_");
    if (name === "Complete JSON") {
      const record = JSON.parse(content);
      expect(record.attempts).toHaveLength(12);
      expect(record.provenance.response_origin).toBe("scripted_fixture");
      expect(
        JSON.stringify(
          record.attempts.map((a: { request: unknown }) => a.request),
        ),
      ).not.toContain("RESEARCHER_ONLY_CANARY");
    }
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Study design/ })
    .click();
  await page
    .getByLabel("Question", { exact: true })
    .fill("An edited question for a later revision.");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Revision 2 saved");
  await page.reload();
  await page
    .getByRole("button", { name: "Research & rehearsal", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Saved records/ })
    .click();
  await page.locator(".run-card").first().click();
  await page
    .getByText("Protocol, option mapping & run settings", { exact: true })
    .click();
  await expect(page.locator("details[open] .json").last()).toContainText(
    "A shelf has 4 green notebooks",
  );
  expect(errors).toEqual([]);
});

test("invalid fixtures and cancellation retain missing outcomes", async ({
  page,
}) => {
  await page.getByRole("button", { name: "New study", exact: true }).click();
  await page
    .getByRole("button", { name: "Save & preview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Configure rehearsal", exact: true })
    .click();
  await page.getByLabel("Matched pairs").fill("1");
  await page.getByLabel("Fixture profile").selectOption("malformed");
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByText("completed with errors", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("0 / 2 sessions complete · 2 attempts recorded", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Raw response", exact: true }).click();
  await expect(page.locator(".attempt-detail .json")).toContainText("choice");
  await page.getByLabel("Fixture profile").selectOption("stall");
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByText("0 / 2 sessions complete · 1 attempts recorded", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await expect(page.locator(".run-actions")).toContainText("cancelled");
  await expect(page.locator(".attempt-list button")).toHaveCount(1);
});

test("mobile layout and complete workflow remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "New study", exact: true }).click();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/mobile-design.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save & preview", exact: true })
    .click();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page
    .getByRole("button", { name: "Configure rehearsal", exact: true })
    .click();
  await page.getByLabel("Matched pairs").fill("1");
  await page
    .getByRole("button", { name: "Run rehearsal", exact: true })
    .click();
  await expect(
    page.getByText("2 / 2 sessions complete · 4 attempts recorded", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "../artifacts/mobile-rehearsal.png",
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Saved records/ })
    .click();
  await expect(page.locator(".run-card").first()).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
