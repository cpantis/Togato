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
- Analiza AI: `services/memo.ts`, model `claude-opus-5-5`, cu fallback server-side (`fallbacks: "default"`). Pasajele relevante din textul oficial (`selectLegalPassages`: articolele obligațiilor și motivelor, plafonate la 60.000 de caractere) se trimit ca documente cu citări activate; răspunsul devine text cu trimiteri `[n]` + `aiMemoCitations` (`parseMemoResponse`). Promptul spune explicit că textul e cel inițial și ce a schimbat Omnibus-ul. Funcțiile pure sunt testate în `memo.test.ts`.
- Hard delete peste tot (CASCADE pe FK).
- Roluri: `admin` / `membru`. Rutele de administrare a echipei folosesc `requireAdmin`. Cabinetul trebuie să rămână mereu cu cel puțin un administrator activ; nimeni nu își poate retrage singur rolul de admin sau dezactiva propriul cont.
- Documente Word: `services/documents/` — `common.ts` (stiluri, antet, `fill()` pentru câmpuri de completat evidențiate galben, `loadDocContext`), `templates.ts` (conținutul celor 5 documente), `index.ts` (registrul: tip, disponibilitate, obligația legată). Documentele se generează la cerere, nu se stochează. Un document nou = o funcție în `templates.ts` + o intrare în `DOCUMENTS` + test în `documents.test.ts`; dacă e legat de o obligație, și în `apps/web/src/lib/documents.ts`.
- Portalul clientului: rute publice în `routes/portal.ts` (montate înainte de `authMiddleware`, autentificate prin token — `lib/portalToken.ts`), administrare în `routes/clientPortal.ts`. Un singur link activ per client (regenerarea îl invalidează pe cel vechi), valabil 90 de zile, păstrat doar ca hash. Clientul NU vede încadrarea juridică; poate retrage doar instrumentele proprii neaprobate. Întrebările simple și maparea lor la chestionarul AI Act sunt în `packages/shared/src/portal.ts` (`portalToAnswers`, testat); biometria nu se mapează automat — e semnalată avocatului. Sistemele din portal au `source = "portal"` și `portalAnswers`.
- Încadrarea manuală a avocatului: `POST /ai-systems/:id/override` (motivare obligatorie). `riskLevel` = nivelul efectiv (override ?? calculat); nivelul calculat rămâne în `classification.riskLevel`. Obligațiile rămân cele calculate.
- Calificarea (Art. 3 pct. 1 + excluderile din Art. 2) vine înaintea încadrării: `qualification` = da / nu / neclar, `scopeExclusions`. „nu” sau o excludere → nivelul `neaplicabil` („În afara AI Act”), fără obligații, care nu declanșează nici obligațiile generale ale clientului. Roluri: furnizor, implementator, implementator_modificat (Art. 25), importator (Art. 23), distribuitor (Art. 24).
- Avizele înghețate: `analysis_snapshots` + `services/snapshots.ts`. Se creează în aceeași tranzacție cu aprobarea (`/review` cu `aprobat`) și cu încadrarea manuală. Conțin tot ce a stat la baza avizului + versiunea regulilor și a textului legii; amprenta SHA-256 e calculată peste JSON canonic (`canonicalJson`). Sunt imuabile: nu există rute de modificare/ștergere (dispar doar cu clientul). `GET /api/snapshots/:id/pdf` verifică amprenta (`X-Togato-Integrity`) și o afișează în PDF (pdfkit + DejaVu Sans din `src/assets/fonts`, pentru diacritice).
- Identitatea vizuală a cabinetului (`organizations.brandColor`, `logoUrl`) se setează din `/settings` (doar admin) și se folosește în portal.
- Invitațiile: tokenul (32 octeți aleatori) se arată o singură dată, în DB se păstrează doar hash-ul SHA-256; acceptarea marchează invitația condiționat (fără conturi duble la cereri simultane). Emailul nu se trimite încă — adminul copiază linkul.

## Textul oficial al legii
- `apps/api/src/legal/ai_act_ro.json` — Regulamentul (UE) 2024/1689 în limba română, structurat pe articole / alineate / anexe / puncte / litere. Generat cu `python3 -I scripts/import_ai_act.py <pagina EUR-Lex .html> apps/api/src/legal/ai_act_ro.json` (nu se editează de mână). Versiunea curentă: textul inițial din JO L 12.7.2024 — **fără** modificările Omnibus.
- `packages/shared/src/lawRefs.ts` transformă trimiterile din catalog („Art. 26(7)”, „Anexa III pct. 4(a)”, „Art. 26(9) + GDPR Art. 35”) în referințe; `apps/api/src/services/law.ts` le rezolvă la text; `GET /api/law?ref=...`. În web, componenta `LawRef` face orice articol clicabil.
- `services/law.test.ts` verifică faptul că **fiecare** trimitere din catalog există în textul oficial. O trimitere nouă greșită face testul să pice.

## Când se modifică legislația
1. Modifică regulile în `packages/shared/src/aiAct.ts` și acoperă schimbarea cu teste în `aiAct.test.ts`. Dacă s-a schimbat textul legii, reimportă-l (vezi „Textul oficial al legii”) și actualizează `source.version` / `note`.
2. Adaugă o intrare **la începutul** lui `RULESET_CHANGELOG` din `packages/shared/src/legislation.ts`, cu o versiune nouă (`AAAA.N`), data, titlul, rezumatul pe înțelesul avocatului, sursa și articolele.
3. La pornire, API-ul (`services/reclassify.ts`, cu advisory lock) reîncadrează toate sistemele cu `rulesetVersion` mai veche:
   - schimbări minore (termene, texte) → aplicate direct, fără reverificare;
   - schimbări de fond (nivel de risc, rol, obligații noi/eliminate) → `reviewStatus = propus` + `reclassNote` cu diferențele; nota dispare când avocatul aprobă/respinge.
   Stările, notele și termenele interne ale obligațiilor se păstrează (prin `obligationsSync`). Încadrarea manuală (`riskOverride`) nu se suprascrie niciodată — conflictul e doar semnalat.
4. Nu schimba niciodată codul unei obligații existente (`code`) doar pentru că s-a schimbat textul — codul e cheia care păstrează starea și notele.

## Înainte de commit
```bash
npm run build -w @togato/shared && npm test -w @togato/shared
cd apps/api && npx tsc --noEmit && npm test
cd apps/web && npx next build
```
Dacă oricare eșuează, nu face commit.

## De verificat / deschis
- Textul final al Omnibus-ului (numărul regulamentului, formularea Art. 4, perioada de grație Art. 50(2)) — verificat doar din surse secundare. Textul importat e cel inițial (2024); când apare versiunea consolidată pe EUR-Lex, se reimportă.
- Memoriul AI cu citări n-a fost încă rulat contra API-ului real (nu există cheie în mediul de dezvoltare) — de testat la prima configurare a `ANTHROPIC_API_KEY`.
- Lookup ANAF (`services/companyLookup.ts`, API v9) netestat contra serviciului real.
- Trimiterea pe email a invitațiilor (acum linkul se copiază manual).
- Documentele sunt modele deterministe; o variantă viitoare poate folosi Claude pentru a redacta secțiunile „de completat” din descrierea sistemului.
- Logo-ul cabinetului e doar un URL extern; încărcarea fișierului cere stocare (S3/R2).
- Următorii pași: trimiterea emailurilor (invitații, link portal, notificare la trimiteri din portal), publicarea pe Railway, modulul GDPR.
