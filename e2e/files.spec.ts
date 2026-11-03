import { expect, test } from "@playwright/test";
import { addClient, signup } from "./helpers";

test("dovezi la obligații, export dosar, arhivare și ștergere definitivă", async ({ page }) => {
  await signup(page);
  await addClient(page, "Dovada Plus SRL");
  await page.click("text=Adaugă primul sistem");
  await page.fill("text=Nume >> xpath=following::input[1]", "Chatbot site");
  await page.click("label:has-text('Da, este un sistem de IA')");
  await page.click("button:has-text('Salvează și generează obligațiile')");
  await page.waitForURL(/\/systems\/[0-9a-f-]{36}$/);
  await page.getByText("‹ Dovada Plus SRL").click();

  // o obligație generală a clientului: atașăm o dovadă
  const first = page.locator("li").filter({ has: page.locator("button[aria-expanded]") }).first();
  await first.locator("button[aria-expanded]").click();
  await first.locator("input[aria-label='Atașează dovezi']").setInputFiles({ name: "Proces-verbal instruire.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nproces-verbal\n") });
  await expect(first.getByRole("button", { name: "Proces-verbal instruire.pdf", exact: true })).toBeVisible();
  const [ev] = await Promise.all([page.waitForEvent("download"), first.getByRole("button", { name: "Proces-verbal instruire.pdf", exact: true }).click()]);
  expect(ev.suggestedFilename()).toBe("Proces-verbal instruire.pdf");

  // un fișier deghizat e refuzat
  await first.locator("input[aria-label='Atașează dovezi']").setInputFiles({ name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(first.getByRole("alert")).toContainText("Tip de fișier nepermis");

  // export dosar
  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export dosar (ZIP)" }).click()]);
  expect(zip.suggestedFilename()).toMatch(/^Dosar_AI_Act_Dovada_Plus_SRL_.*\.zip$/);

  // arhivare → nu mai apare în listă → ștergere definitivă
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Arhivează" }).click();
  await expect(page.getByText(/Client arhivat la/)).toBeVisible();
  page.once("dialog", (d) => d.accept("Dovada Plus SRL"));
  await page.getByRole("button", { name: "Șterge definitiv" }).click();
  await page.waitForURL("**/clients?archived=1");
  await expect(page.getByText("Niciun client arhivat")).toBeVisible();
});
