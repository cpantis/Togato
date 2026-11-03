import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signup, unique } from "./helpers";

async function axe(page: Page) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`);
}

test("autoevaluare gratuită → alegerea cabinetului după județ și nume → cabinetul acceptă", async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  // cabinetul apare în director
  const cabinetName = unique("Lex Napoca ");
  await signup(page, cabinetName);
  await page.goto("/settings#director");
  const card = page.locator("form", { has: page.getByRole("heading", { name: "Directorul cabinetelor" }) });
  await card.getByRole("switch", { name: "Apare în director" }).click();
  await card.locator("select").selectOption("Cluj");
  await card.getByLabel("Localitatea").fill("Cluj-Napoca");
  await card.getByLabel("Prezentare scurtă").fill("Protecția datelor, AI Act, dreptul muncii.");
  await card.getByRole("button", { name: "Salvează profilul" }).click();
  await expect(card.getByText("Cabinetul apare în director.")).toBeVisible();

  // firma, într-un alt browser, fără cont
  const firm = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await firm.emulateMedia({ reducedMotion: "reduce" });
  await firm.goto("/autoevaluare");
  expect(await axe(firm)).toEqual([]);
  await firm.getByLabel("Denumirea firmei").fill("Transport Rapid SRL");
  await firm.getByLabel("Județul").selectOption("Cluj");
  await firm.getByLabel("Numele dumneavoastră").fill("Maria Ionescu");
  await firm.getByLabel("Email").fill(`${unique("maria")}@firma.ro`);
  await firm.getByRole("checkbox").check();
  await firm.getByRole("button", { name: "Continuă" }).click();
  await firm.waitForURL(/\/autoevaluare\/[A-Za-z0-9_-]{20,}$/);

  await firm.getByRole("button", { name: "Adaugă un instrument" }).click();
  await firm.getByLabel("Numele instrumentului").fill("Selecție CV");
  await firm.getByRole("group", { name: "Îl folosiți la recrutare?" }).getByRole("button", { name: "Da" }).click();
  await firm.getByRole("button", { name: "Salvează instrumentul" }).click();
  await expect(firm.getByText("Risc ridicat", { exact: true })).toBeVisible();
  await expect(firm.getByText(/Vă recomandăm să alegeți un cabinet/)).toBeVisible();
  expect(await axe(firm)).toEqual([]);

  // directorul: județul e preselectat; căutare după nume
  await firm.getByLabel("Caută cabinet după nume").fill(cabinetName.slice(0, 12));
  const entry = firm.locator("li", { hasText: cabinetName });
  await expect(entry).toBeVisible();
  await expect(entry).toContainText("Cluj-Napoca, Cluj");
  await entry.getByRole("button", { name: "Trimite autoevaluarea" }).click();
  await firm.getByRole("dialog").getByRole("checkbox").check();
  await firm.getByRole("dialog").getByLabel(/Mesaj pentru cabinet/).fill("Avem nevoie de ajutor până în martie.");
  await firm.getByRole("dialog").getByRole("button", { name: "Trimite" }).click();
  await expect(firm.getByText("Trimisă — așteaptă răspuns")).toBeVisible();

  // cabinetul acceptă
  await page.goto("/solicitari");
  await page.getByRole("link", { name: /Transport Rapid SRL/ }).click();
  await expect(page.getByText("Avem nevoie de ajutor până în martie.")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByRole("button", { name: "Acceptă și creează clientul" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByText("din autoevaluare")).toBeVisible();

  await firm.reload();
  await expect(firm.getByText("Acceptată", { exact: true })).toBeVisible();
});
