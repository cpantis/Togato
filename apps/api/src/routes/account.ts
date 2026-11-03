/** Securitatea contului propriu: autentificarea în doi pași. */
import { Hono } from "hono";
import { z } from "zod";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { organizations, users } from "../db/schema";
import type { AppEnv } from "../types/hono";
import { audit } from "../lib/audit";
import { decrypt, encrypt } from "../lib/crypto";
import { generateRecoveryCodes, generateSecret, hashRecoveryCode, otpauthUri, verifyTotp } from "../lib/totp";
import { checkSecondFactor } from "../services/mfa";

export const accountRoutes = new Hono<AppEnv>();

async function me(userId: string) {
  return (await db.query.users.findFirst({ where: eq(users.id, userId) }))!;
}

accountRoutes.get("/security", async (c) => {
  const auth = c.get("auth");
  const u = await me(auth.userId);
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId), columns: { require2fa: true } });
  return c.json({
    totpEnabled: u.totpEnabled,
    totpEnabledAt: u.totpEnabledAt?.toISOString() ?? null,
    recoveryCodesLeft: u.recoveryCodes?.length ?? 0,
    orgRequires2fa: !!org?.require2fa,
  });
});

/** GET/PUT /notifications — ce emailuri primește utilizatorul */
accountRoutes.get("/notifications", async (c) => {
  const u = await me(c.get("auth").userId);
  return c.json({ notifyDeadlines: u.notifyDeadlines, notifyPortal: u.notifyPortal });
});

accountRoutes.put("/notifications", async (c) => {
  const auth = c.get("auth");
  const body = z.object({ notifyDeadlines: z.boolean().optional(), notifyPortal: z.boolean().optional() }).parse(await c.req.json());
  await db.update(users).set(body).where(and(eq(users.id, auth.userId), eq(users.organizationId, auth.organizationId)));
  const u = await me(auth.userId);
  return c.json({ notifyDeadlines: u.notifyDeadlines, notifyPortal: u.notifyPortal });
});

/** POST /2fa/setup — generează un secret nou (încă inactiv) și codul QR */
accountRoutes.post("/2fa/setup", async (c) => {
  const auth = c.get("auth");
  const u = await me(auth.userId);
  if (u.totpEnabled) return c.json({ error: "Autentificarea în doi pași este deja activă." }, 409);
  const secret = generateSecret();
  await db.update(users).set({ totpPendingSecret: encrypt(secret) }).where(eq(users.id, u.id));
  const uri = otpauthUri(secret, u.email);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return c.json({ secret, uri, qr });
});

/** POST /2fa/enable { code } — confirmă codul din aplicație și activează; întoarce codurile de recuperare o singură dată */
accountRoutes.post("/2fa/enable", async (c) => {
  const auth = c.get("auth");
  const { code } = z.object({ code: z.string().trim().min(6).max(7) }).parse(await c.req.json());
  const u = await me(auth.userId);
  if (u.totpEnabled) return c.json({ error: "Autentificarea în doi pași este deja activă." }, 409);
  if (!u.totpPendingSecret) return c.json({ error: "Începeți configurarea din nou." }, 400);
  const secret = decrypt(u.totpPendingSecret);
  const step = verifyTotp(secret, code);
  if (step === null) return c.json({ error: "Cod incorect. Verificați ora telefonului și reîncercați." }, 400);
  const recovery = generateRecoveryCodes();
  await db.update(users).set({
    totpEnabled: true, totpSecret: encrypt(secret), totpPendingSecret: null, totpLastStep: step,
    recoveryCodes: recovery.map(hashRecoveryCode), totpEnabledAt: new Date(),
  }).where(eq(users.id, u.id));
  await audit(auth, "2fa_enable", "user", u.id);
  return c.json({ recoveryCodes: recovery });
});

/** POST /2fa/recovery-codes { code } — generează coduri noi (cele vechi devin invalide) */
accountRoutes.post("/2fa/recovery-codes", async (c) => {
  const auth = c.get("auth");
  const { code } = z.object({ code: z.string().trim().min(6).max(20) }).parse(await c.req.json());
  const u = await me(auth.userId);
  if (!(await checkSecondFactor(u, code)).ok) return c.json({ error: "Cod incorect sau deja folosit" }, 400);
  const recovery = generateRecoveryCodes();
  await db.update(users).set({ recoveryCodes: recovery.map(hashRecoveryCode) }).where(eq(users.id, u.id));
  await audit(auth, "2fa_recovery_regenerate", "user", u.id);
  return c.json({ recoveryCodes: recovery });
});

/** POST /2fa/disable { password, code } */
accountRoutes.post("/2fa/disable", async (c) => {
  const auth = c.get("auth");
  const body = z.object({ password: z.string().min(1).max(200), code: z.string().trim().min(6).max(20) }).parse(await c.req.json());
  const u = await me(auth.userId);
  if (!u.totpEnabled) return c.json({ error: "Autentificarea în doi pași nu este activă." }, 400);
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, auth.organizationId), columns: { require2fa: true } });
  if (org?.require2fa) return c.json({ error: "Cabinetul cere autentificarea în doi pași pentru toți membrii; nu poate fi dezactivată." }, 403);
  if (!(await bcrypt.compare(body.password, u.passwordHash))) return c.json({ error: "Parolă incorectă" }, 400);
  if (!(await checkSecondFactor(u, body.code)).ok) return c.json({ error: "Cod incorect sau deja folosit" }, 400);
  await db.update(users).set({ totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpLastStep: null, recoveryCodes: null, totpEnabledAt: null }).where(eq(users.id, u.id));
  await audit(auth, "2fa_disable", "user", u.id);
  return c.json({ ok: true });
});
