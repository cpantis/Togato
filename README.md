# Togato

Platformă SaaS pentru cabinetele de avocatură și consultanță care gestionează conformitatea clienților lor cu **AI Act** (Regulamentul (UE) 2024/1689, cu modificările Omnibus 2026). Arhitectura e gândită ca mai târziu să găzduiască și GDPR, NIS2 și alte module.

## Ce face (MVP)

- **Cont de cabinet** (multi-tenant): înregistrare self-service, 14 zile de probă.
- **Echipa cabinetului**: invitații prin link (valabile 7 zile, o singură folosire), roluri administrator / membru, dezactivarea conturilor.
- **Clienți**: firme adăugate după CUI (date de la ANAF; opțional ListaFirme pentru angajați / cifră de afaceri), fiecare cu un avocat responsabil și filtrul „Clienții mei”.
- **Inventar AI** pe client: fiecare instrument AI folosit sau dezvoltat, descris printr-un chestionar.
- **Portalul clientului**: link personal (90 de zile) prin care firma-client își adaugă singură instrumentele AI, răspunzând la întrebări simple, sub numele, culoarea și logo-ul cabinetului. Răspunsurile devin o încadrare propusă pe care avocatul o verifică.
- **Calificare**: întâi se stabilește dacă instrumentul e un sistem de IA (Art. 3 pct. 1) și dacă intră în domeniul de aplicare (excluderile din Art. 2); cele care nu sunt primesc nivelul „În afara AI Act”, fără obligații. Roluri: furnizor, implementator, importator (Art. 23), distribuitor (Art. 24), cu Art. 25 pentru rebranduire/modificare.
- **Încadrare automată**: practici interzise (Art. 5), risc ridicat (Anexa I / Anexa III, cu derogările Art. 6(3) și Art. 25), transparență (Art. 50), GPAI. Rezultatul are motivele și articolele citate și se actualizează live în formular.
- **Obligații concrete** generate pe sistem și pe client (Art. 4, 26, 27, 50, 86, 9–73 pentru furnizori), cu data de aplicare, stare, notă și termen intern.
- **Verificarea avocatului**: fiecare încadrare e „propusă” până când un avocat o aprobă sau o respinge; schimbarea răspunsurilor cere o nouă aprobare.
- **Documente Word** generate din datele clientului: raport de conformitate, registrul sistemelor AI, politica internă de utilizare AI, informarea angajaților (Art. 26(7)), evaluarea impactului asupra drepturilor fundamentale (Art. 27). Câmpurile de completat sunt evidențiate.
- **Avize înghețate**: la fiecare aprobare se salvează o copie imuabilă a analizei (răspunsuri, încadrare, obligații cu stările lor, memoriu, versiunea legii), cu amprentă SHA-256 și export PDF datat. Modificările ulterioare nu ating avizele deja date.
- **Securitate**: autentificare în doi pași (TOTP, compatibilă cu Google/Microsoft Authenticator), coduri de recuperare, politică de cabinet „2FA obligatoriu”, resetare de către administrator. Analiza AI e dezactivată implicit; un administrator o activează explicit, după ce vede ce date se trimit.
- **Analiză AI** (opțional): memoriu juridic scurt generat cu Claude, pe baza pasajelor relevante din textul oficial al legii; fiecare afirmație citată are o trimitere [n] la citatul exact.
- **Textul oficial al legii**: orice articol afișat în aplicație („Art. 26(7)”, „Anexa III pct. 4(a)”) se deschide cu un clic, cu textul oficial în limba română (EUR-Lex), litera relevantă evidențiată și linkul către sursă. Un test verifică automat că fiecare trimitere din reguli există în lege.
- **Actualizări legislative**: regulile sunt versionate; la o versiune nouă, sistemele se reîncadrează automat — termenele se actualizează direct, schimbările de fond trimit sistemul înapoi la avocat, cu diferențele explicate. Stările și notele obligațiilor se păstrează; încadrarea manuală a avocatului nu se suprascrie. Pagina „Noutăți legislative” ține istoricul.
- **Panou**: clienți, sisteme pe niveluri de risc, ce necesită atenție, termenele AI Act.
- Jurnal de audit pentru toate acțiunile.

## Structură

```
apps/api         Hono + Drizzle + PostgreSQL (API + worker de joburi, aceeași imagine)
apps/web         Next.js 15 (App Router) + Tailwind 4
packages/shared  Regulile AI Act (funcție pură, în API și în browser), planuri, tipuri
e2e/             teste de browser (Playwright + axe)
deploy/railway/  configurația serviciilor api / worker / web
docs/            api-routes.md (generat), adr/ (decizii), operations/ (publicare, backup, chei)
```

## Pornire locală

```bash
docker compose up -d            # PostgreSQL pe 5432
cp .env.example apps/api/.env   # completează JWT_SECRET (și ENCRYPTION_KEY: openssl rand -hex 32)
npm install
npm run build -w @togato/shared
npm run db:migrate -w @togato/api
npm run dev:api                 # http://localhost:8080 (rulează și joburile; emailurile apar în jurnal)
npm run dev:web                 # http://localhost:3000
```

## Verificări

```bash
npm run build -w @togato/shared && npm test -w @togato/shared
cd apps/api && npx tsc --noEmit && npx tsc -p tsconfig.test.json && npm test
TEST_DATABASE_URL=postgres://.../togato_test npm run test:int -w @togato/api   # integrare, pe Postgres real
cd apps/web && npx next build && cd ../.. && E2E_DATABASE_URL=postgres://.../togato_e2e_test npm run e2e
```

CI (`.github/workflows/ci.yml`) rulează toate acestea, `npm audit` pe dependențele de producție și construiește imaginile Docker cu un test de fum.

## Publicare și operare

- Variabilele de mediu: `.env.example` (comentat) și `apps/api/src/config.ts` (validate la pornire).
- Railway: [`docs/operations/deploy-railway.md`](docs/operations/deploy-railway.md)
- Backup și recuperare: [`docs/operations/backup-dr.md`](docs/operations/backup-dr.md)
- Rotirea cheilor: [`docs/operations/key-rotation.md`](docs/operations/key-rotation.md)
- Rutele API: [`docs/api-routes.md`](docs/api-routes.md) · Deciziile de arhitectură: [`docs/adr/`](docs/adr/README.md)
