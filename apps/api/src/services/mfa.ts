/** Verificarea celui de-al doilea factor (cod TOTP sau cod de recuperare), cu protecție la refolosire. */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { decrypt } from "../lib/crypto";
import { hashRecoveryCode, verifyTotp } from "../lib/totp";

type User = typeof users.$inferSelect;

export async function checkSecondFactor(user: User, rawCode: string): Promise<{ ok: boolean; usedRecovery?: boolean; recoveryLeft?: number }> {
  const code = rawCode.trim();
  if (!user.totpEnabled || !user.totpSecret) return { ok: false };

  if (/^\d{3}\s?\d{3}$/.test(code)) {
    const step = verifyTotp(decrypt(user.totpSecret), code, { lastStep: user.totpLastStep });
    if (step === null) return { ok: false };
    // actualizare condiționată: două cereri simultane cu același cod nu pot reuși amândouă
    const updated = await db.update(users).set({ totpLastStep: step })
      .where(and(eq(users.id, user.id), sql`coalesce(${users.totpLastStep}, -1) < ${step}`))
      .returning({ id: users.id });
    return { ok: updated.length === 1 };
  }

  // cod de recuperare (XXXXX-XXXXX): se poate folosi o singură dată
  const hash = hashRecoveryCode(code);
  const codes = user.recoveryCodes ?? [];
  if (!codes.includes(hash)) return { ok: false };
  const remaining = codes.filter((h) => h !== hash);
  const updated = await db.update(users).set({ recoveryCodes: remaining })
    .where(and(eq(users.id, user.id), sql`${users.recoveryCodes} @> ${JSON.stringify([hash])}::jsonb`))
    .returning({ id: users.id });
  return { ok: updated.length === 1, usedRecovery: true, recoveryLeft: remaining.length };
}
