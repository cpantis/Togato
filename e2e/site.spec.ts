import { expect, test } from "@playwright/test";
import { signup } from "./helpers";

test("site public: prezentare, prețuri, ajutor; contul nou explorează clientul demonstrativ", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) cspErrors.push(m.text()); });
  const res = await page.goto("/");
  // CSP cu nonce per cerere: fără 'unsafe-inline' efectiv
  expect(res!.headers()["content-security-policy"]).toMatch(/'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Conformitatea AI Act");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Prețuri" }).click();
  await expect(page.getByRole("heading", { name: "Prețuri" })).toBeVisible();
  await expect(page.getByText("Start", { exact: true })).toBeVisible();
  await page.goto("/ajutor");
  await page.getByText("Cum închid contul?").click();
  await expect(page.getByText(/Datele se șterg definitiv după 30 de zile/)).toBeVisible();

  await signup(page, "Cabinet Demo");
  // un utilizator autentificat ajunge direct în aplicație
  await page.goto("/");
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: "Explorează un client demonstrativ" }).click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Client demonstrativ cu date fictive/)).toBeVisible();
  await expect(page.getByText("Selecția automată a CV-urilor")).toBeVisible();
  expect(cspErrors).toEqual([]);
});
