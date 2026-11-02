# Togato — instrucțiuni pentru Claude

Togato e un SaaS pentru cabinete de avocatură / consultanță: conformitatea AI Act a firmelor-client. Interfața și mesajele sunt în limba română.

## Structură
- `packages/shared/src/aiAct.ts` — **sursa unică** pentru textul legii: opțiunile chestionarului, catalogul de obligații, datele de aplicare și `classifyAiSystem` (funcție pură; rulează în API la salvare și în browser pentru previzualizare). Orice schimbare de regulă se face aici și se acoperă cu un test în `aiAct.test.ts`.
- `apps/api` — Hono + Drizzle. Rute în `src/routes/`, logică în `src/services/`. Schema în `src/db/schema.ts`; migrațiile se generează cu `npm run db:generate -w @togato/api` (nu se scriu de mână).
- `apps/web` — Next.js 15 App Router, Tailwind 4. Componente comune în `src/components/ui.tsx`. Culoarea de brand: `brand` (#7a1f3a).

## Reguli
- **Multi-tenant**: orice citire/scriere filtrează pe `organizationId` din `c.get("auth")`, inclusiv în clauza WHERE a UPDATE/DELETE. Un id din alt cabinet → 404.
- Id-urile din URL trec prin `uuidParam()` (altfel Postgres dă 500).
- Încadrarea e o **propunere**: orice modificare a răspunsurilor resetează `reviewStatus` la `propus`.
- Obligațiile se sincronizează doar prin `services/obligationsSync.ts` (păstrează starea și notele celor care rămân aplicabile).
- Analiza AI: `services/memo.ts`, model `claude-opus-5-5`, cu fallback server-side (`fallbacks: "default"`). Nu inventa articole în prompturi.
- Hard delete peste tot (CASCADE pe FK).
- Roluri: `admin` / `membru`. Rutele de administrare a echipei folosesc `requireAdmin`. Cabinetul trebuie să rămână mereu cu cel puțin un administrator activ; nimeni nu își poate retrage singur rolul de admin sau dezactiva propriul cont.
- Invitațiile: tokenul (32 octeți aleatori) se arată o singură dată, în DB se păstrează doar hash-ul SHA-256; acceptarea marchează invitația condiționat (fără conturi duble la cereri simultane). Emailul nu se trimite încă — adminul copiază linkul.

## Înainte de commit
```bash
npm run build -w @togato/shared && npm test -w @togato/shared
cd apps/api && npx tsc --noEmit
cd apps/web && npx next build
```
Dacă oricare eșuează, nu face commit.

## De verificat / deschis
- Textul final al Omnibus-ului (numărul regulamentului, formularea Art. 4, perioada de grație Art. 50(2)) — verificat doar din surse secundare.
- Lookup ANAF (`services/companyLookup.ts`, API v9) netestat contra serviciului real.
- Trimiterea pe email a invitațiilor (acum linkul se copiază manual).
- Următorii pași: generarea documentelor (politică AI, notificare angajați, FRIA, registru AI), portalul clientului (white-label), modulul GDPR.
