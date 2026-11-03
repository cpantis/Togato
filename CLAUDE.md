# Togato — instrucțiuni pentru Claude

Togato e un SaaS pentru cabinete de avocatură / consultanță: conformitatea AI Act a firmelor-client. Interfața și mesajele sunt în limba română.

## Structură
- `packages/shared/src/aiAct.ts` — **sursa unică** pentru textul legii: opțiunile chestionarului, catalogul de obligații, datele de aplicare și `classifyAiSystem` (funcție pură; rulează în API la salvare și în browser pentru previzualizare). Orice schimbare de regulă se face aici și se acoperă cu un test în `aiAct.test.ts`.
- `apps/api` — Hono + Drizzle. `src/app.ts` construiește aplicația (fără efecte la import), `src/index.ts` o pornește; configurarea e validată în `src/config.ts` (zod). Rute în `src/routes/`, logică în `src/services/`. Schema în `src/db/schema.ts`; migrațiile se generează cu `npm run db:generate -w @togato/api` (nu se scriu de mână).
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
- Autentificare în doi pași: TOTP propriu în `lib/totp.ts` (RFC 6238, testat cu vectorii oficiali), secretul criptat AES-256-GCM (`lib/crypto.ts`, cheia `ENCRYPTION_KEY`), coduri de recuperare păstrate ca hash. Login: parola → `{ mfaRequired, mfaToken }` (JWT de 5 min cu `purpose: "mfa"`, respins ca sesiune) → `POST /auth/login/mfa`. Protecție la reluare prin `totpLastStep` (actualizare condiționată). Politica `organizations.require2fa` e aplicată în `authMiddleware` (403 `2fa_required`, cu excepția `/api/account/*`).
- Sesiuni: server-side (`sessions`, `services/sessions.ts`) — token aleator în cookie `togato_session` (httpOnly, SameSite=Lax, Secure în producție), în DB doar hash-ul; expirare la 7 zile de inactivitate, maximum 30 de zile. Clienții API pot trimite același token ca `Authorization: Bearer`. Cererile cu cookie care modifică date cer `X-CSRF-Token` = cookie-ul `togato_csrf` (double submit, `csrfOk` în `middleware/auth.ts`). Ieșirea, schimbarea/resetarea parolei, dezactivarea contului și resetarea 2FA de către admin șterg sesiunile. JWT (`JWT_SECRET`) se mai folosește doar pentru tokenul de 5 minute al pasului 2FA.
- Parola: resetare prin link pe email (`/auth/password/forgot` → `/auth/password/reset`, 60 de minute, o singură folosire, răspuns identic pentru adrese inexistente); schimbare din Setări (`/account/password`). După `MAX_FAILED` (10) încercări greșite consecutive (parolă sau cod 2FA) contul e blocat `LOCK_MINUTES` (15).
- Limitarea cererilor: contoare în Postgres (`rate_limits`, comune tuturor instanțelor). IP-ul clientului: `lib/clientIp.ts` cu `TRUST_PROXY_HOPS` (în producție: 2 = marginea platformei + Next.js); fără proxy de încredere, `X-Forwarded-For` e ignorat.
- Antete de securitate: API — `secureHeaders` (CSP `default-src 'none'`, HSTS, DENY); web — CSP, HSTS, `Referrer-Policy: no-referrer` pe paginile cu token (`/portal`, `/invite`, `/reset`) în `next.config.ts`.
- Analiza AI cere consimțământul cabinetului: `organizations.aiEnabled` (implicit `false`, activat doar de admin, cu `aiEnabledBy/At`); altfel `/memo` → 403 `ai_disabled`.
- Identitatea vizuală a cabinetului (`organizations.brandColor`, `logoUrl`) se setează din `/settings` (doar admin) și se folosește în portal.
- Invitațiile: tokenul (32 octeți aleatori) se arată o singură dată, în DB se păstrează doar hash-ul SHA-256; acceptarea marchează invitația condiționat (fără conturi duble la cereri simultane). Linkul se trimite pe email (implicit) și se întoarce și pentru copiere.

## Operațional
- Jurnal: `lib/logger.ts` — o linie JSON per eveniment, câmpurile sensibile mascate; fiecare linie poartă `requestId` (antet `X-Request-Id`, `middleware/requestContext.ts`) și, după autentificare, `organizationId`/`userId`. Nu folosiți `console.*` în API.
- Erorile 500 se raportează la Sentry dacă `SENTRY_DSN` e setat (`lib/errorReporting.ts`, fără SDK, fără corpul cererii) și întorc `requestId`, afișat în web ca „cod pentru suport”.
- Joburi: coadă proprie pe Postgres (`jobs/queue.ts`, tabelul `jobs`, `FOR UPDATE SKIP LOCKED`, reîncercări exponențiale, `PermanentJobError` = fără reîncercare, `dedupeKey` unic). Handlerele în `jobs/handlers.ts`: `email.send`, `memo.generate`, `ruleset.reclassify` (o dată per versiune), `portal.notify`, `reminders.daily` (rezumatul termenelor, 05:00 UTC), `maintenance.prune`. Rulează în API (`RUN_WORKER_IN_API=on`, implicit) și/sau în procesul separat `npm run worker -w @togato/api`. Puneți joburile în coadă **în aceeași tranzacție** cu operația (`enqueue(..., { tx })`).
- Emailuri: doar prin `sendEmail()` (`services/email/`) — adaptor `log` (dezvoltare/teste; `sentEmails()` în teste) sau `resend`. Șabloanele în `templates.ts` escapează orice valoare introdusă de utilizatori. Preferințe per utilizator: `users.notifyDeadlines` / `notifyPortal`.
- Memoriul AI e asincron: `POST /memo` → 202 cu `aiMemoStatus = in_lucru`; workerul îl scrie (`gata`) sau salvează eroarea (`esuat`); interfața verifică la 3 s.
- `/health` = procesul e viu; `/health/ready` = baza de date răspunde (503 altfel). Oprirea la SIGTERM e curată.

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

## Teste
- Unitare: `npm test -w @togato/shared`, `npm test -w @togato/api` (fără bază de date).
- Integrare: `TEST_DATABASE_URL=postgres://...togato_test npm run test:int -w @togato/api` — API-ul real (`src/app.ts`, prin `app.request`) pe un Postgres real, golit și migrat la fiecare rulare. `test/isolation.int.test.ts` citește **toate** rutele din aplicație și verifică separarea între cabinete; o rută nouă cu un parametru necunoscut face testul să pice — adăugați maparea în `resolveParams`.
- Browser: `E2E_DATABASE_URL=... npm run e2e` (Playwright, `e2e/`), după `npx next build` în `apps/web`.
- CI rulează toate trei (`.github/workflows/ci.yml`).

## Înainte de commit
```bash
npm run build -w @togato/shared && npm test -w @togato/shared
cd apps/api && npx tsc --noEmit && npm test && npm run test:int   # cu TEST_DATABASE_URL
cd apps/web && npx next build
```
Dacă oricare eșuează, nu face commit.

## De verificat / deschis
- Textul final al Omnibus-ului (numărul regulamentului, formularea Art. 4, perioada de grație Art. 50(2)) — verificat doar din surse secundare. Textul importat e cel inițial (2024); când apare versiunea consolidată pe EUR-Lex, se reimportă.
- Memoriul AI cu citări n-a fost încă rulat contra API-ului real (nu există cheie în mediul de dezvoltare) — de testat la prima configurare a `ANTHROPIC_API_KEY`.
- Lookup ANAF (`services/companyLookup.ts`, API v9) netestat contra serviciului real.
- Trimiterea reală a emailurilor (Resend) netestată contra serviciului — necesită `RESEND_API_KEY` și domeniu verificat (SPF/DKIM).
- Documentele sunt modele deterministe; o variantă viitoare poate folosi Claude pentru a redacta secțiunile „de completat” din descrierea sistemului.
- Logo-ul cabinetului e doar un URL extern; încărcarea fișierului cere stocare (S3/R2).
- Următorii pași: publicarea pe Railway, modulul GDPR.
