import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("VeriStack End-to-End & WCAG 2.2 AA Accessibility", () => {
  test("full live scan, persona briefing, Q&A, modal accessibility, custom policy, and Axe audit", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));

    await page.goto("/");

    // Verify no horizontal overflow on active viewport
    const overflowInitial = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowInitial).toBe(false);

    // Run Axe accessibility audit on landing dashboard
    const initialA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(initialA11y.violations).toEqual([]);

    // 1. Trigger live supply-chain scan on Legacy Express API sample
    await page.getByRole("button", { name: "Legacy Express API" }).click();
    await page.getByRole("button", { name: /Run Supply-Chain Audit/i }).click();

    await expect(
      page.getByRole("heading", { name: "legacy-checkout-service", exact: true })
    ).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole("heading", { name: /Dependency Risk Ledger/i })).toBeVisible();

    const overflowAfterScan = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflowAfterScan).toBe(false);

    // Verify Axe zero-violation compliance with populated report + dependency table
    const reportA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(reportA11y.violations).toEqual([]);

    // 2. Switch AI briefing persona and verify adaptive headline
    await page.getByRole("button", { name: "Security Auditor" }).click();
    await expect(
      page.getByRole("heading", { name: /Security & Compliance Finding Summary/i })
    ).toBeVisible({ timeout: 10_000 });

    // 3. Interact with Grounded Q&A Assistant
    await page.getByLabel("Ask a question about this scan").fill("What is wrong with lodash?");
    await page.getByRole("button", { name: /^Ask$/ }).click();
    await expect(page.getByRole("log")).toContainText(/lodash/i, { timeout: 15_000 });

    // 4. Filter dependency table & open Detail Modal + verify Axe + Escape key closes cleanly
    await page.getByRole("button", { name: "Vulnerable", exact: true }).click();
    await page.getByRole("button", { name: "Inspect" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const modalA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(modalA11y.violations).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // 5. Create workspace policy via modal
    await page.getByRole("button", { name: /Custom Policy/i }).click();
    const policyDialog = page.getByRole("dialog");
    await policyDialog.getByLabel("Policy Name").fill("Playwright Strict Policy");
    await policyDialog.getByRole("button", { name: "Save Custom Policy" }).click();
    await expect(policyDialog.getByText("Playwright Strict Policy")).toBeVisible();
    await page.keyboard.press("Escape");

    // 6. Verify error handling for broken JSON input
    await page.getByLabel("package.json manifest JSON content").fill("{broken");
    await page.getByRole("button", { name: /Run Supply-Chain Audit/i }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Audit Input or Telemetry Error" })
    ).toContainText(/Invalid JSON/i);

    expect(consoleErrors).toEqual([]);
  });
});
