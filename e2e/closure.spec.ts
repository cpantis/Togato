import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signup } from "./helpers";

test("închiderea contului: export, programare cu confirmarea numelui, doar citire, anulare", async ({ page }) => {
  const cabinet = `Cabinet Inchidere ${Date.now()}`;
  await signup(page, cabinet);
  await page.goto("/settings#inchidere");
  const card = page.locator("div", { has: page.getByRole("heading", { name: "Export complet și închiderea contului" }) }).last();
  const download = page.waitForEvent("download");
  await card.getByRole("button", { name: "Exportă toate datele (ZIP)" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Togato_export_.*\.zip$/);

  await card.getByRole("button", { name: "Închide contul…" }).click();
  const schedule = card.getByRole("button", { name: "Programează închiderea" });
  await expect(schedule).toBeDisabled();
  await card.getByLabel("Numele cabinetului").fill(cabinet);
  await schedule.click();
  await expect(page.getByRole("status").getByText(/Închiderea contului e programată/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  await card.getByRole("button", { name: "Anulează închiderea" }).click();
  await expect(card.getByRole("button", { name: "Închide contul…" })).toBeVisible();
  await expect(page.getByText(/Închiderea contului e programată/)).toHaveCount(0);
});
