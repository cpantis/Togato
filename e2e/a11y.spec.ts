import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { addClient, signup } from "./helpers";

/** încălcările grave (serious / critical) ale WCAG 2.1 AA, pe pagina curentă */
async function audit(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = bad.map((v) => `${name}: [${v.impact}] ${v.id} — ${v.help}\n  ${v.nodes.slice(0, 6).map((n) => `${n.target.join(" ")} :: ${n.html.slice(0, 140)} :: ${(n.any[0]?.message ?? "").slice(0, 120)}`).join("\n  ")}`);
  return report;
}

test("accesibilitate (WCAG 2.1 AA): paginile principale", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const problems: string[] = [];
  await page.goto("/login");
  problems.push(...(await audit(page, "login")));
  await page.goto("/signup");
  problems.push(...(await audit(page, "signup")));
  await page.goto("/forgot");
  problems.push(...(await audit(page, "forgot")));
  await page.goto("/termeni");
  problems.push(...(await audit(page, "termeni")));

  await signup(page, "Cabinet Accesibil");
  problems.push(...(await audit(page, "dashboard")));
  const clientUrl = await addClient(page, "Acces SRL");
  problems.push(...(await audit(page, "client")));
  await page.click("text=Adaugă primul sistem");
  await page.waitForURL("**/systems/new");
  problems.push(...(await audit(page, "sistem nou")));
  await page.fill("text=Nume >> xpath=following::input[1]", "Chatbot");
  await page.click("label:has-text('Da, este un sistem de IA')");
  await page.click("button:has-text('Salvează și generează obligațiile')");
  await page.waitForURL(/\/systems\/[0-9a-f-]{36}$/);
  problems.push(...(await audit(page, "sistem")));
  for (const path of ["/clients", "/team", "/settings", "/legislation"]) {
    await page.goto(path);
    problems.push(...(await audit(page, path)));
  }
  // portalul public, pe telefon
  await page.goto(clientUrl);
  await page.getByRole("button", { name: "Generează link" }).click();
  const link = await page.inputValue("input[aria-label='Link portal']");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(link);
  problems.push(...(await audit(page, "portal")));

  expect(problems, problems.join("\n")).toEqual([]);
});
