import { expect, test } from "@playwright/test";
import { addClient, signup } from "./helpers";

test("accesul la client: administratorul îl restricționează din pagina clientului", async ({ page }) => {
  await signup(page, "Cabinet Acces");
  await addClient(page, "Client Confidential SRL");
  const card = page.locator("div", { has: page.getByRole("heading", { name: "Acces la client" }) }).last();
  await card.getByLabel("Acces restricționat").check();
  await card.getByRole("button", { name: "Salvează accesul" }).click();
  await expect(card.getByRole("status")).toHaveText("Salvat");
  await expect(page.getByText(/Client cu acces restricționat/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Client cu acces restricționat/)).toBeVisible();
});
