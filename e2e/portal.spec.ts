import { expect, test } from "@playwright/test";
import { addClient, signup } from "./helpers";

test("portalul clientului: link, completare pe telefon, apare la cabinet", async ({ page, browser }) => {
  await signup(page, "Cabinet Portal");
  const clientUrl = await addClient(page, "Logistic Express SRL");
  await page.click("button:has-text('Generează link')");
  const link = await page.inputValue("input[aria-label='Link portal']");
  await page.click("button:has-text('Gata')");

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const m = await phone.newPage();
  await m.goto(link);
  await m.click("button:has-text('Adaugă un instrument AI')");
  await m.fill("input[placeholder='ex. ChatGPT']", "Robot recrutare");
  await m.locator("div.border-b", { hasText: "Îl folosiți la recrutare?" }).first().getByRole("button", { name: "Da" }).click();
  await m.locator("input[autocomplete=name]").fill("Paul Ionescu");
  await m.click("button:has-text('Trimite către cabinet')");
  await expect(m.getByText("Mulțumim!")).toBeVisible();
  expect(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto(clientUrl);
  await expect(page.getByText("din portal")).toBeVisible();
  await page.click("a:has-text('Robot recrutare')");
  await expect(page.getByText("Trimis de client prin portal")).toBeVisible();
});
