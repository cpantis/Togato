import { expect, test } from "@playwright/test";
import { signup } from "./helpers";

test("accesul de suport: acordat și retras de administrator; consola platformei invizibilă pentru cabinete", async ({ page }) => {
  await signup(page, "Cabinet Suport");
  await expect(page.getByRole("link", { name: "Platformă" })).toHaveCount(0);
  await page.goto("/settings");
  const card = page.locator("div", { has: page.getByRole("heading", { name: "Acces pentru echipa de suport Togato" }) }).last();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Acordă 24 de ore" }).click();
  await expect(card.getByText(/Acces acordat până la/)).toBeVisible();
  await card.getByRole("button", { name: "Retrage accesul" }).click();
  await expect(card.getByRole("button", { name: "Acordă 24 de ore" })).toBeVisible();
});
