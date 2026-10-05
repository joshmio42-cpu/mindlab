import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

for (const device of ["desktop", "mobile"]) {
  test(`${device}: scenario, conversation, notebook, debrief, replay and persistence`, async ({
    page,
  }) => {
    if (device === "mobile")
      await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Meet Alex." }),
    ).toBeVisible();
    await expect(page.getByLabel("Conversation source")).toHaveValue(
      "scripted",
    );
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      device === "mobile" ? 390 : 1440,
    );
    await mkdir("../artifacts", { recursive: true });
    await page.screenshot({
      path: `../artifacts/practice-${device}-library.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Begin practice", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "A conversation with Alex." }),
    ).toBeVisible();
    await expect(page.locator(".source-pill")).toHaveText(
      "Offline scripted demonstration",
    );
    await page
      .getByLabel("Your response to Alex")
      .fill(
        "The purpose is to understand what has been difficult. What questions would you like to ask?",
      );
    await page
      .getByRole("button", { name: "Send response", exact: true })
      .click();
    await expect(page.locator(".transcript .practice-message")).toHaveCount(3);
    await page
      .getByLabel("Observed behavior or exact quotation")
      .fill("Alex asked about report sharing.");
    await page
      .getByLabel("Interpretation or hypothesis")
      .fill("Privacy may be a concern; not a measured state.");
    await page
      .getByLabel("Follow-up or information still needed")
      .fill("Check who receives the report.");
    await page.getByLabel("Link to transcript").selectOption({ index: 3 });
    await page
      .getByRole("button", { name: "Save private note", exact: true })
      .click();
    await expect(page.locator(".saved-note")).toContainText(
      "Privacy may be a concern",
    );
    await page
      .getByLabel("Your response to Alex")
      .fill(
        "I don't know the report arrangements. We can check before you decide what to share.",
      );
    await page
      .getByRole("button", { name: "Send response", exact: true })
      .click();
    await expect(page.locator(".transcript .practice-message")).toHaveCount(5);
    await expect(
      page.locator(".transcript .practice-message").last(),
    ).toBeInViewport();
    await page.screenshot({
      path: `../artifacts/practice-${device}-conversation.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "End session & reflect", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "A moment to reflect." }),
    ).toBeVisible();
    await expect(
      page.getByText("Private notes were excluded from this debrief.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".feedback-card").first()).toContainText(
      "Transcript #2",
    );
    await page.screenshot({
      path: `../artifacts/practice-${device}-debrief.png`,
      fullPage: true,
    });
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("link", {
        name: "Export fictional record (includes private notes)",
        exact: true,
      })
      .click();
    const download = await downloadEvent;
    const original = JSON.parse(
      await readFile((await download.path())!, "utf8"),
    );
    expect(original.record_type).toBe("fictional_simulation_record");
    expect(original.notes).toHaveLength(1);
    expect(original.feedback.notes).toHaveLength(0);
    await page
      .getByRole("button", { name: "Choose an exchange", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Replay from here", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Same moment. Another possible conversation.",
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Try your response", exact: true })
      .click();
    await page
      .getByLabel("Your response to Alex")
      .fill("Don't worry, you'll be fine.");
    await page
      .getByRole("button", { name: "Send response", exact: true })
      .click();
    await expect(
      page.locator(".transcript .practice-message").last(),
    ).toContainText("I'm not sure");
    await page
      .getByLabel("Observed behavior or exact quotation")
      .fill("Alex said they were not sure.");
    await page
      .getByLabel("Include my private notes in the debrief for reflection.")
      .check();
    await page
      .getByRole("button", { name: "End session & reflect", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Potential reassurance or leading wording",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Included by your choice for your own reflection; no automated judgment of notebook content is made.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Compare branches", exact: true })
      .click();
    await expect(page.locator(".comparison-explainer")).toContainText(
      "not proof",
    );
    await expect(page.locator(".branch-column").first()).toContainText(
      "The purpose is to understand",
    );
    await expect(page.locator(".branch-column").last()).toContainText(
      "Don't worry",
    );
    await page
      .getByRole("tab", { name: "Compare branches", exact: true })
      .focus();
    await page.keyboard.press("Home");
    await expect(
      page.getByRole("tab", { name: "Conversation & notes", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("End");
    await expect(
      page.getByRole("tab", { name: "Compare branches", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      device === "mobile" ? 390 : 1440,
    );
    await page.screenshot({
      path: `../artifacts/practice-${device}-replay.png`,
      fullPage: true,
    });
    const preserved = await page.request.get(
      `/api/practice/sessions/${original.id}/export`,
    );
    expect(await preserved.json()).toEqual(original);
    await page.reload();
    await page
      .getByRole("button", { name: "History & replays", exact: true })
      .click();
    await page
      .locator(".practice-history>button")
      .filter({ hasText: original.id.slice(-8) })
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "A moment to reflect." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
