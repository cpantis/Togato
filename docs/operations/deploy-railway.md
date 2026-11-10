# Publicarea pe Railway

Togato rulează ca trei servicii din același repository, plus Postgres și două servicii opționale (backup, antivirus):

| Serviciu | Config (Settings → Config-as-code) | Ce face |
|---|---|---|
| `api` | `deploy/railway/api.json` | API-ul (Hono). Rulează migrațiile înainte de fiecare lansare (`preDeployCommand`). Healthcheck `/health/ready`. |
| `worker` | `deploy/railway/worker.json` | Joburile (emailuri, memorii AI, reîncadrări, mementouri, ștergeri din stocare). Aceeași imagine ca API-ul. |
| `web` | `deploy/railway/web.json` | Interfața Next.js; trimite `/api/*` către `api` prin rețeaua privată. |
| `postgres` | plugin Railway (Postgres 16) | Baza de date, cu backup-uri (vezi `backup-dr.md`). |
| `backup` | `deploy/railway/backup.json` | Cron zilnic (02:30 UTC): dump criptat în S3/R2 (`deploy/backup/`, variabilele în `backup-dr.md`). |
| `clamav` | imaginea `clamav/clamav` (fără repository) | Antivirus pentru încărcări, doar în rețeaua privată, port 3310. Opțional. |

**Rețea.** Doar `web` are domeniu public. `api` rămâne fără domeniu public: `web` îi trimite `/api/*` prin rețeaua privată, iar webhook-urile (Stripe, Resend) se configurează tot pe domeniul `web` (`https://app.togato.ro/api/stripe/webhook`, `/api/email/webhook`) — trec prin același proxy, cu corpul neschimbat, deci semnăturile rămân valide. Așa `TRUST_PROXY_HOPS=2` e corect pentru toate cererile. API-ul ascultă pe `::` (IPv6 + IPv4), cum cere rețeaua privată Railway.

> Fișierele `deploy/railway/*.json` folosesc câmpurile de bază ale schemei Railway (`build.dockerfilePath`, `deploy.preDeployCommand`, `healthcheckPath`, `restartPolicy*`). Verificați-le în interfața Railway la prima configurare.

## Variabile de mediu

**api** și **worker** (aceleași valori; validate la pornire de `apps/api/src/config.ts` — procesul se oprește cu mesaj clar dacă lipsește ceva):

| Variabilă | Valoare |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` pe `api` (fix: `API_INTERNAL_URL` din `web` îl folosește) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | minimum 32 de caractere aleatoare (`openssl rand -base64 48`) |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` — **păstrați o copie în managerul de parole al firmei**; fără ea secretele 2FA nu mai pot fi citite |
| `FRONTEND_URL` | `https://app.togato.ro` (domeniul serviciului web) |
| `TRUST_PROXY_HOPS` | `2` (marginea Railway + Next.js) |
| `EMAIL_PROVIDER` / `RESEND_API_KEY` / `EMAIL_FROM` | `resend`, cheia Resend, `Togato <noreply@togato.ro>` (domeniu verificat: SPF, DKIM, DMARC) |
| `RESEND_WEBHOOK_SECRET` | semnătura webhook-ului Resend (`whsec_…`); în Resend: webhook către `https://<domeniul web>/api/email/webhook` cu evenimentele `email.bounced` și `email.complained` — adresele respinse definitiv / marcate spam nu mai primesc emailuri |
| `CLAMAV_HOST` / `CLAMAV_PORT` | antivirus pentru dovezi și logo: un serviciu Railway din imaginea `clamav/clamav` (port 3310, rețeaua privată). Fără el nu se scanează; cu el indisponibil, încărcările primesc 503 (`CLAMAV_FAIL_OPEN=on` le acceptă nescanate) |
| `TURNSTILE_SECRET_KEY` (API) / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (web, la build) | captcha Cloudflare Turnstile pe înregistrare, autoevaluare și recuperarea linkurilor |
| `STORAGE_DRIVER` + `S3_*` | `s3`; pentru Cloudflare R2: `S3_ENDPOINT=https://<cont>.r2.cloudflarestorage.com`, `S3_REGION=auto`, bucket privat |
| `ANTHROPIC_API_KEY` | opțional (memoriul AI; fiecare cabinet îl activează separat) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_START`, `STRIPE_PRICE_CABINET` | opțional (plata online); webhook Stripe → `https://<domeniul web>/api/stripe/webhook`, evenimentele `checkout.session.completed`, `customer.subscription.*` |
| `SENTRY_DSN` | opțional |
| `PLATFORM_ADMIN_EMAILS` | adresele echipei Togato (consola `/platform`, cu 2FA) |
| `RUN_WORKER_IN_API` | `off` pe `api` (rulează serviciul `worker`); `on` doar dacă nu există worker |
| `WORKER_CONCURRENCY` | pe `worker`, implicit 4 |
| `MONITOR_BACKUPS` | implicit `on` în producție: alertă orară dacă lipsește un backup reușit în ultimele 26 h. Setați `off` până configurați serviciul `backup`, altfel alerta pornește din prima oră |

Implicit în producție: confirmarea emailului la înregistrare și 2FA obligatoriu pentru administratori (`REQUIRE_EMAIL_VERIFICATION`, `REQUIRE_ADMIN_2FA`). Primul cont nu poate fi folosit până nu merge trimiterea emailurilor (Resend).

**web** (variabilele sunt și argumente de build):

| Variabilă | Valoare |
|---|---|
| `API_INTERNAL_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8080` |
| `NEXT_PUBLIC_CONTACT_EMAIL` | adresa de contact pentru abonamente |
| `NEXT_PUBLIC_SITE_URL` | `https://app.togato.ro` (sitemap, robots) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | cheia publică Turnstile — **obligatorie dacă `api` are `TURNSTILE_SECRET_KEY`**, altfel înregistrarea și autoevaluarea sunt refuzate |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` / `NEXT_PUBLIC_PLAUSIBLE_SRC` | opțional, analitica paginilor publice |
| `PORT` | `3000` |

Toate variabilele `web` sunt incluse în cod la build (`ARG` în `apps/web/Dockerfile`): după ce schimbați una, redeploy (build nou), nu doar restart.

## Medii

- **staging**: un mediu Railway separat (Environments → New), cu propria bază de date, chei Stripe de test, `EMAIL_PROVIDER=resend` cu un domeniu de test și `PLATFORM_ADMIN_EMAILS` al echipei. Ramura `main` se publică automat în staging.
- **production**: publicare la cerere (sau din ramura `release`), după ce CI-ul e verde și staging a fost verificat.
- Migrațiile rulează automat înainte de lansare (`preDeployCommand`); dacă eșuează, versiunea veche rămâne activă. Migrațiile trebuie să fie compatibile înapoi (adăugați coloane nullable / cu valoare implicită; ștergerile de coloane într-o lansare ulterioară).

## Verificări după prima publicare

Mai întâi `npm run check:integrations -w @togato/api -- --email-to=<adresa voastră>` cu variabilele mediului (vezi și `launch-checklist.md`).


1. Healthcheck-ul `api` (`/health/ready`) e verde în Railway; `GET https://<domeniul web>/api/auth/me` → `{"user":null,"organization":null}` (proxy-ul web → API funcționează).
2. Creați un cont, activați 2FA, încărcați o dovadă (stocarea), invitați un coleg (emailul).
3. Stripe: o plată de test → starea „Abonament activ” apare în Setări în câteva secunde (webhook).
4. Jurnalele: linii JSON cu `requestId`; erorile 500 apar în Sentry.
