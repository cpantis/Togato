# Lista de lansare Togato

Ce rămâne de făcut înainte de primul cabinet plătitor. Partea de software e implementată și testată; aici sunt conturile, deciziile și verificările care cer oameni.

Legendă: **[Juridic]** avocat / DPO · **[Business]** decizie de produs · **[Ops]** configurare tehnică · **[Verificare]** test pe staging.

## 1. Juridic și conformitate
- [ ] **[Juridic]** Finalizarea textelor `apps/web/src/content/legal.ts` (Termeni, Confidențialitate, DPA, Subîmputerniciți): datele firmei (denumire, CUI, sediu, Reg. Com.), legea aplicabilă și instanța, limitarea răspunderii, durata de păstrare. Apoi scoaterea bannerului „Proiect” din `LegalPage.tsx` și o versiune nouă în `LEGAL_VERSION`.
- [ ] **[Juridic]** Lista subîmputerniciților cu țările de prelucrare și mecanismele de transfer (Railway, Cloudflare R2, Resend, Stripe, Anthropic, Sentry, Plausible / Cloudflare Turnstile dacă sunt activate). Contractele DPA semnate cu fiecare.
- [ ] **[Juridic]** Validarea regulilor de încadrare din `packages/shared/src/aiAct.ts` și a catalogului de obligații de către un avocat specializat; verificarea Omnibus-ului (vezi CLAUDE.md, „De verificat”).
- [ ] **[Juridic]** Lista ANSPDCP (`ANSPDCP_DPIA_LIST`) și adresa din scrisori, comparate cu textele oficiale.
- [ ] **[Juridic]** Modelele de documente Word (AI Act și GDPR), revizuite.
- [ ] **[Juridic]** Registrul propriu Art. 30 al Togato (ca operator pentru conturi și ca persoană împuternicită pentru cabinete) și procedura de incident (notificarea cabinetelor fără întârziere nejustificată).
- [ ] **[Business]** Facturarea conformă e-Factura (B2B, obligatoriu în România): integrare SmartBill / Oblio sau emiterea manuală din programul de facturare; TVA în Stripe (Stripe Tax sau prețuri fără TVA + factură separată).

## 2. Decizii de business
- [ ] **[Business]** Prețurile finale (acum 149 € / 399 €, provizorii) în `packages/shared/src/plans.ts` și în Stripe.
- [ ] **[Business]** Adresa de contact / suport (`NEXT_PUBLIC_CONTACT_EMAIL`) și cine răspunde, în cât timp.
- [ ] **[Business]** Domeniul (ex. `togato.ro`) și `app.` / `api.` dacă se separă.

## 3. Conturi și configurare (producție)
- [ ] **[Ops]** Railway: serviciile `api`, `worker`, `web`, `backup` (cron), Postgres (cu backup Railway și, dacă e disponibil, point-in-time recovery). Rulează migrațiile (`node dist/db/migrate.js`).
- [ ] **[Ops]** Variabilele din `docs/operations/deploy-railway.md`: `NODE_ENV=production`, `FRONTEND_URL` (https), `JWT_SECRET`, `ENCRYPTION_KEY` (copie în managerul de parole), `TRUST_PROXY_HOPS=2`, `PLATFORM_ADMIN_EMAILS`.
- [ ] **[Ops]** Cloudflare R2: bucketul aplicației (privat) și **un bucket separat** pentru backup (alt token, de preferat alt cont), cu versionare / Object Lock.
- [ ] **[Ops]** Cheia `age` pentru backup: `age-keygen`; cheia publică în `BACKUP_AGE_RECIPIENT`, cheia privată **offline** la două persoane.
- [ ] **[Ops]** Resend: domeniul verificat (SPF, DKIM, DMARC), `RESEND_API_KEY`, webhook către `/api/email/webhook` (`email.bounced`, `email.complained`) → `RESEND_WEBHOOK_SECRET`.
- [ ] **[Ops]** Stripe: produsele și prețurile recurente (`STRIPE_PRICE_START`, `STRIPE_PRICE_CABINET`), portalul de facturare configurat, webhook către `/api/stripe/webhook` → `STRIPE_WEBHOOK_SECRET`. Întâi în modul test pe staging.
- [ ] **[Ops]** Anthropic: `ANTHROPIC_API_KEY` (organizație cu DPA). Analiza AI rămâne dezactivată implicit pentru fiecare cabinet.
- [ ] **[Ops]** ClamAV: serviciu Railway din imaginea `clamav/clamav` în rețeaua privată → `CLAMAV_HOST`.
- [ ] **[Ops]** Cloudflare Turnstile: `TURNSTILE_SECRET_KEY` (API) și `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (web, la build).
- [ ] **[Ops]** Sentry: `SENTRY_DSN`. Opțional Plausible: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. `NEXT_PUBLIC_SITE_URL` pentru sitemap.
- [ ] **[Ops]** Monitorizare externă: un serviciu de tip uptime pe `https://api…/health/ready` și pe pagina principală; opțional `BACKUP_HEARTBEAT_URL` (ex. healthchecks.io).

## 4. Verificări pe staging (înainte de producție)
- [ ] **[Verificare]** `npm run check:integrations -w @togato/api -- --email-to=<adresa voastră>` pe staging și pe producție: toate integrările configurate trebuie să fie ✓ (Postgres, Anthropic, Resend + domeniu, Stripe + prețuri + webhook, stocare, ANAF, ClamAV cu EICAR, Turnstile, configurare de producție).
- [ ] **[Verificare]** Un flux complet cu un card de test Stripe: înregistrare → confirmare email → 2FA → client → sistem → aviz → abonament → webhook → factură.
- [ ] **[Verificare]** Memoriul AI cu citări, rulat o dată contra API-ului real (nu a fost încă testat cu o cheie reală).
- [ ] **[Verificare]** Căutarea ANAF după CUI contra serviciului real (neaccesibil din mediul de dezvoltare).
- [ ] **[Verificare]** Exercițiul de restaurare (`deploy/backup/restore.sh`, vezi `backup-dr.md`) cu un backup real din bucket; notat în `restore-log.md`.
- [ ] **[Verificare]** Construirea imaginii `deploy/backup/Dockerfile` pe Railway și o rulare manuală a cronului (scriptul a fost testat, imaginea nu — Docker Hub era indisponibil în mediul de dezvoltare).
- [ ] **[Verificare]** Testul de încărcare (`scripts/loadtest.mjs`) pe staging, cu `RATE_LIMIT=off` doar acolo.
- [ ] **[Verificare]** Alertele: oprirea workerului 15 minute pe staging trebuie să producă emailul „Togato: …” către `PLATFORM_ADMIN_EMAILS`.
- [ ] **[Verificare]** O revizuire de securitate externă (test de penetrare) înainte de clienți cu date sensibile.

## 5. Ziua lansării
- [ ] DNS + HTTPS; HSTS e activ din aplicație (după ce domeniul merge sigur pe https, se poate cere includerea în lista HSTS preload).
- [ ] Contul propriu de cabinet (pentru demonstrații) și un cabinet-pilot.
- [ ] Pagina `/ajutor` și emailul de suport verificate; Setări → Director pentru cabinetele-pilot, ca directorul autoevaluării să nu fie gol.
