import { expect, test } from "@playwright/test";
import { addClient, signup } from "./helpers";

test("fluxul principal: client, sistem AI, încadrare, aprobare, aviz PDF, documente", async ({ page }) => {
  await signup(page);
  await addClient(page, "Talent Hub SRL");
  await page.click("text=Adaugă primul sistem");
  await page.waitForURL("**/systems/new");
  await page.fill("text=Nume >> xpath=following::input[1]", "Filtrare CV-uri");
  await page.click("label:has-text('Da, este un sistem de IA')");
  await page.click("label:has-text('HR: recrutare și selecție')");
  await expect(page.getByText("Încadrare propusă").locator("xpath=following::span[1]")).toHaveText("Risc ridicat");
  await page.click("button:has-text('Salvează și generează obligațiile')");
  await page.waitForURL(/\/systems\/[0-9a-f-]{36}$/);
  await expect(page.getByText("De ce această încadrare")).toBeVisible();

  // textul oficial al legii
  await page.locator("button[title='Vezi textul oficial al legii']", { hasText: "Art. 26(2)" }).first().click();
  await expect(page.locator("[role=dialog]")).toContainText("Implementatorii încredințează supravegherea umană");
  await page.keyboard.press("Escape");

  // aprobare → aviz înghețat → PDF
  await page.click("button:has-text('Aprob încadrarea')");
  await expect(page.getByText("Aprobat de avocat")).toBeVisible();
  await expect(page.getByText(/v1 · Risc ridicat/)).toBeVisible();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.locator("li", { hasText: "v1" }).getByRole("button", { name: "PDF" }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^Aviz_AI_Act_.*_v1_.*\.pdf$/);

  // documente Word
  await page.getByText("‹ Talent Hub SRL").click();
  const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descarcă .docx" }).first().click()]);
  expect(docx.suggestedFilename()).toMatch(/\.docx$/);
});
