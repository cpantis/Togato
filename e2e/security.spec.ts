import { expect, test } from "@playwright/test";
import { signup, totp } from "./helpers";

test("autentificare în doi pași: configurare, politică obligatorie, login cu cod", async ({ page, browser }) => {
  const email = await signup(page, "Cabinet Sigur");
  await page.goto("/settings");
  await page.click("button:has-text('Configurează')");
  const secret = (await page.locator("code").first().innerText()).trim();
  await page.fill("input[aria-label='Cod din aplicație']", totp(secret));
  await page.click("button:has-text('Activează')");
  await expect(page.getByText("Nu vor mai fi afișate")).toBeVisible();
  await page.click("button:has-text('Descarcă (.txt)')");
  await page.click("button:has-text('Le-am salvat')");
  await page.click("button[aria-label='Autentificare în doi pași obligatorie']");
  await expect(page.locator("button[aria-label='Autentificare în doi pași obligatorie']")).toHaveAttribute("aria-checked", "true");

  // un coleg nou e oprit la configurare
  await page.goto("/team");
  await page.click("button:has-text('Invită un coleg')");
  await page.locator("[role=dialog] input[type=email]").fill(`coleg${Date.now()}@sigur.ro`);
  await page.click("button:has-text('Creează invitația')");
  const link = await page.inputValue("input[aria-label='Link invitație']");
  await page.click("button:has-text('Gata')");
  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await other.locator("input[autocomplete=name]").fill("Dan Coleg");
  await other.fill("input[type=password]", "parola-coleg-1");
  await other.click("button:has-text('Creează contul')");
  await expect(other.getByText("Activați autentificarea în doi pași")).toBeVisible();

  // autentificare din nou, în doi pași
  await page.click("button[aria-label='Ieșire']");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", "parola-sigura-1");
  await page.click("button:has-text('Intră în cont')");
  await page.fill("input[aria-label='Cod de verificare']", "000000");
  await page.click("button:has-text('Verifică')");
  await expect(page.getByText(/Cod incorect/)).toBeVisible();
  await page.fill("input[aria-label='Cod de verificare']", totp(secret, 1));
  await page.click("button:has-text('Verifică')");
  await page.waitForURL("**/dashboard");
});
