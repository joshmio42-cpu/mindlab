import { test, expect } from "@playwright/test";

for (const width of [1440, 390]) {
  test(`evidence practice and measurement at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page
      .getByLabel("Choose an encounter")
      .selectOption("score-understanding");
    await expect(
      page.getByRole("heading", { name: "Meet Jordan." }),
    ).toBeVisible();
    await page.getByLabel("Practice mode").selectOption("reflective");
    await page.getByLabel("Intended role").selectOption("psychometrician");
    await page
      .getByLabel("Setting and local scope")
      .fill("Supervised educational score discussion; confirm local scope.");
    await page
      .getByRole("button", { name: "Begin practice", exact: true })
      .click();
    await page
      .getByLabel("Your response to Jordan")
      .fill(
        "What concerns you about the score? We should check the intended use and comparison group.",
      );
    await page
      .getByRole("button", { name: "Send response", exact: true })
      .click();
    await expect(page.locator(".transcript .practice-message")).toHaveCount(3);
    await page
      .getByLabel("Reflection before feedback")
      .fill("I need the relevant norm group before interpreting the score.");
    await page
      .getByRole("button", { name: "End session & reflect", exact: true })
      .click();
    await expect(
      page.getByText(
        "I need the relevant norm group before interpreting the score.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.locator(".reference-notes summary").first().click();
    await expect(page.locator(".reference-notes a").first()).toHaveAttribute(
      "href",
      /^https:/,
    );
    await page
      .getByText("Disagree, correct, or submit a professional review", {
        exact: true,
      })
      .click();
    await page
      .getByLabel("Reviewer name or local identifier")
      .fill("Learner demo");
    await page
      .getByLabel("Correction and reasoning")
      .fill(
        "An open question can still contain an assumption; I want to revisit mine.",
      );
    await page
      .getByRole("button", { name: "Save review", exact: true })
      .click();
    await expect(
      page.getByText("Review saved. Original feedback preserved.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Measurement lab", exact: true })
      .click();
    await page.getByLabel("Simulated people / repetitions").fill("20");
    await page
      .getByRole("button", { name: "Run measurement rehearsal", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("completed · 20/20");
    await expect(page.locator(".lab-table tbody tr")).toHaveCount(4);
    await expect(
      page.getByRole("img", {
        name: "Item exposure for 15 item adaptive test",
      }),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    await page.screenshot({
      path: `../artifacts/evidence-measurement-${width}.png`,
      fullPage: true,
    });
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", {
        name: "Export assumptions, item bank & every repetition",
      })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
    await page
      .getByRole("button", {
        name: "Discuss a fictional score report →",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Choose an encounter")).toHaveValue(
      "score-understanding",
    );
    await page
      .getByLabel("Choose an encounter")
      .selectOption("everyday-change");
    await expect(
      page.getByRole("heading", { name: "Meet Sam." }),
    ).toBeVisible();
    await page
      .getByText("Source registry & permissions (36)", { exact: true })
      .click();
    await page.getByLabel("Find a source").fill("IPIP permission");
    await expect(
      page.locator(".source-registry article").first(),
    ).toContainText("public domain per owner");
    await page
      .getByText("Conversation simulator checks", { exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run conversation checks", exact: true })
      .click();
    await expect(
      page.getByText("3 repeats · 9 attempts · 0 failures"),
    ).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}
