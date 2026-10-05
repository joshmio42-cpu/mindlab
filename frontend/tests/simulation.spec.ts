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
  await page.getByRole("button", { name: "New study", exact: true }).click();
  await page
    .getByLabel("Study title", { exact: true })
    .fill("Monte Carlo browser verification");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Study rehearsal/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Configure repeated studies" }),
  ).toBeVisible();
});

test("simulation, diagram, independent sample sizes, exports and frozen records", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("spinbutton", { name: /^Participants per condition/ })
    .fill("50");
  await page
    .getByRole("spinbutton", { name: /^Monte Carlo repetitions/ })
    .fill("30");
  await page
    .getByRole("spinbutton", { name: /^Baseline answer-change/ })
    .fill("0");
  await page
    .getByRole("spinbutton", { name: /^Peer-adoption probability/ })
    .fill("0");
  await page.getByLabel("Compare sample sizes", { exact: true }).check();
  await page
    .getByLabel(/^Additional participants per condition/)
    .fill("10, 200");
  await page
    .getByRole("button", { name: "Peer-adoption step", exact: true })
    .click();
  await expect(page.locator("#simulation-step-explanation")).toContainText(
    "mathematical rule",
  );
  await page
    .getByRole("button", { name: "Run study simulation", exact: true })
    .click();
  await expect(page.locator(".sim-progress")).toContainText(
    "90 / 90 simulated studies complete",
  );
  await expect(page.locator(".sim-results .badge")).toHaveText("completed");
  await expect(
    page.getByRole("img", { name: /Distribution of final peer-answer/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Participants per condition versus width/ }),
  ).toBeVisible();
  await expect(page.locator(".sim-size-explorer tbody tr")).toHaveCount(3);
  await page
    .getByLabel("Result sample size", { exact: true })
    .selectOption("10");
  await expect(page.locator(".sim-results")).toContainText(
    "30 / 30 repetitions completed",
  );
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Simulation JSON", exact: true })
    .click();
  const download = await downloadEvent;
  const record = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(record.repetitions).toHaveLength(90);
  expect(record.provenance.response_origin).toBe("probability_simulation");
  for (const row of record.repetitions) {
    expect(row.control.answer_change.count).toBe(0);
    expect(row.treatment.answer_change.count).toBe(0);
  }
  const csvEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Per-repetition CSV", exact: true })
    .click();
  const csv = await csvEvent;
  const csvText = await readFile((await csv.path())!, "utf8");
  expect(csvText.trim().split("\r\n")).toHaveLength(91);
  expect(csvText).toContain("control_adoption_denominator");
  await page
    .getByRole("spinbutton", { name: /^Peer-adoption probability/ })
    .fill("1");
  await page
    .getByRole("button", { name: "Peer-adoption step", exact: true })
    .click();
  await expect(page.locator("#simulation-step-explanation")).toContainText(
    "0% probability",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Research & rehearsal", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Saved records/ })
    .click();
  await page
    .locator(".sim-history-item")
    .filter({ hasText: record.id })
    .click();
  await expect(page.locator(".sim-results .badge")).toHaveText("completed");
  await expect(page.locator(".sim-progress")).toContainText("90 / 90");
  await mkdir("../artifacts", { recursive: true });
  await page.screenshot({
    path: "../artifacts/simulation-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("mobile vertical diagram, keyboard explanation, run and cancel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  const branches = await page.locator(".sim-branch").all();
  const control = (await branches[0].boundingBox())!;
  const treatment = (await branches[1].boundingBox())!;
  expect(treatment.y).toBeGreaterThan(control.y + control.height);
  await page
    .getByRole("button", { name: "Peer-adoption step", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#simulation-step-explanation")).toContainText(
    "mathematical rule",
  );
  await page
    .getByRole("spinbutton", { name: /^Participants per condition/ })
    .fill("10000");
  await page
    .getByRole("spinbutton", { name: /^Monte Carlo repetitions/ })
    .fill("1000");
  await page
    .getByRole("button", { name: "Run study simulation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cancel simulation", exact: true })
    .click();
  await expect(page.locator(".sim-results .badge")).toHaveText("cancelled");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "../artifacts/simulation-mobile.png",
    fullPage: true,
  });
});
