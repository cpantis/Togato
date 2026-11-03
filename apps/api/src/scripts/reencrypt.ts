/**
 * Rescrie secretele criptate cu cheia curentă (după rotirea ENCRYPTION_KEY).
 *   ENCRYPTION_KEY=<nouă> ENCRYPTION_KEY_PREVIOUS=<veche> npm run reencrypt -w @togato/api
 * Idempotent: valorile deja criptate cu cheia curentă rămân neatinse. La final, dacă nu a rămas nimic
 * criptat cu cheia veche, ENCRYPTION_KEY_PREVIOUS se poate elimina.
 */
import "dotenv/config";
import { eq, isNotNull, or } from "drizzle-orm";
import { closeDb, rootDb } from "../db";
import { users } from "../db/schema";
import { decryptDetailed, encrypt } from "../lib/crypto";

export async function reencryptAll(): Promise<{ checked: number; rewritten: number; failed: number }> {
  const rows = await rootDb.select({ id: users.id, totpSecret: users.totpSecret, totpPendingSecret: users.totpPendingSecret })
    .from(users).where(or(isNotNull(users.totpSecret), isNotNull(users.totpPendingSecret)));
  let rewritten = 0;
  let failed = 0;
  for (const r of rows) {
    const patch: Partial<typeof users.$inferInsert> = {};
    for (const field of ["totpSecret", "totpPendingSecret"] as const) {
      const value = r[field];
      if (!value) continue;
      try {
        const d = decryptDetailed(value);
        if (d.key === "previous") patch[field] = encrypt(d.plain);
      } catch {
        failed++;
        process.stderr.write(`utilizatorul ${r.id}: ${field} nu poate fi decriptat cu nicio cheie\n`);
      }
    }
    if (Object.keys(patch).length) {
      await rootDb.update(users).set(patch).where(eq(users.id, r.id));
      rewritten++;
    }
  }
  return { checked: rows.length, rewritten, failed };
}

if (require.main === module) {
  reencryptAll()
    .then((r) => { console.log(JSON.stringify(r)); return closeDb().then(() => process.exit(r.failed ? 1 : 0)); })
    .catch((e) => { console.error(e); process.exit(1); });
}
