import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addClient, signup } from "./helpers";

async function axe(page: Page) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

test("GDPR: registrul prelucrărilor, o cerere de acces, un incident cu termenul de 72 de ore", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signup(page);
  const clientUrl = await addClient(page, "Farmacia Verde SRL");
  await page.getByRole("link", { name: "Deschide ›" }).click();
  await page.waitForURL(/\/gdpr$/);

  // registru: pornind de la o activitate tipică
  await page.getByRole("button", { name: "Salarizare și personal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Denumirea activității")).toHaveValue("Gestiunea personalului și salarizare");
  await expect(dialog.getByText(/Descrieți măsurile tehnice/)).toBeVisible();
  await dialog.getByLabel("Controlul accesului pe roluri și parole puternice / 2FA").check();
  await expect(dialog.getByText(/Descrieți măsurile tehnice/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText("Complet")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descarcă .docx" }).click()]);
  expect(docx.suggestedFilename()).toMatch(/^Registrul_activitatilor_de_prelucrare_Farmacia_Verde_SRL_.*\.docx$/);

  // cerere de acces
  await page.getByRole("tab", { name: /Cereri ale persoanelor/ }).click();
  await page.getByRole("button", { name: "Înregistrează o cerere" }).click();
  await page.getByRole("dialog").getByLabel("Solicitant").fill("Ion Ionescu");
  await page.getByRole("dialog").getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText("Acces la date — Ion Ionescu")).toBeVisible();
  await expect(page.getByText(/Termen .* · (30|31|28|29) zile/)).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // incident cu risc → termenul de 72 de ore
  await page.getByRole("tab", { name: /Incidente/ }).click();
  await page.getByRole("button", { name: "Înregistrează un incident" }).click();
  const d2 = page.getByRole("dialog");
  await d2.getByLabel("Titlu").fill("Laptop pierdut cu rețete");
  await d2.getByLabel("Date privind sănătatea").check();
  await d2.getByLabel("Evaluarea riscului pentru persoane").selectOption("risc_ridicat");
  await expect(d2.getByText(/informați fără întârziere nejustificată persoanele vizate/)).toBeVisible();
  await d2.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText(/Notificare ANSPDCP: mai sunt (7[0-2]|6\d) ore/)).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // apare pe pagina clientului și pe panou
  await page.goto(clientUrl);
  await expect(page.getByText("1 deschise").first()).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText("Incident: Laptop pierdut cu rețete")).toBeVisible();
});
