import { expect, type Page } from "@playwright/test";
import crypto from "crypto";

export const unique = (p: string) => `${p}${Date.now()}${Math.floor(Math.random() * 1000)}`;

export async function signup(page: Page, cabinet = "Cabinet Test") {
  const email = `${unique("e2e")}@cabinet.ro`;
  await page.goto("/signup");
  const inputs = page.locator("form input");
  await inputs.nth(0).fill(cabinet);
  await inputs.nth(1).fill("Ana Avocat");
  await inputs.nth(2).fill(email);
  await inputs.nth(3).fill("parola-sigura-1");
  await page.locator("form input[type=checkbox]").check();
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
  return email;
}

export async function addClient(page: Page, name: string) {
  await page.goto("/clients?nou=1");
  await expect(page.getByText("Client nou")).toBeVisible();
  await page.locator("[role=dialog] input").nth(1).fill(name);
  await page.click("button:has-text('Salvează clientul')");
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  return page.url();
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** Generează codul TOTP curent, ca o aplicație de autentificare. */
export function totp(secret: string, offset = 0) {
  let bits = 0, v = 0; const out: number[] = [];
  for (const ch of secret) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = crypto.createHmac("sha1", Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
