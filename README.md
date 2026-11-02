# Togato

Platformă SaaS pentru cabinetele de avocatură și consultanță care gestionează conformitatea clienților lor cu **AI Act** (Regulamentul (UE) 2024/1689, cu modificările Omnibus 2026). Arhitectura e gândită ca mai târziu să găzduiască și GDPR, NIS2 și alte module.

## Ce face (MVP)

- **Cont de cabinet** (multi-tenant): înregistrare self-service, 14 zile de probă.
- **Echipa cabinetului**: invitații prin link (valabile 7 zile, o singură folosire), roluri administrator / membru, dezactivarea conturilor.
- **Clienți**: firme adăugate după CUI (date de la ANAF; opțional ListaFirme pentru angajați / cifră de afaceri), fiecare cu un avocat responsabil și filtrul „Clienții mei”.
- **Inventar AI** pe client: fiecare instrument AI folosit sau dezvoltat, descris printr-un chestionar.
- **Încadrare automată**: practici interzise (Art. 5), risc ridicat (Anexa I / Anexa III, cu derogările Art. 6(3) și Art. 25), transparență (Art. 50), GPAI. Rezultatul are motivele și articolele citate și se actualizează live în formular.
- **Obligații concrete** generate pe sistem și pe client (Art. 4, 26, 27, 50, 86, 9–73 pentru furnizori), cu data de aplicare, stare, notă și termen intern.
- **Verificarea avocatului**: fiecare încadrare e „propusă” până când un avocat o aprobă sau o respinge; schimbarea răspunsurilor cere o nouă aprobare.
- **Analiză AI** (opțional): memoriu juridic scurt generat cu Claude.
- **Panou**: clienți, sisteme pe niveluri de risc, ce necesită atenție, termenele AI Act.
- Jurnal de audit pentru toate acțiunile.

## Structură

```
apps/api       Hono + Drizzle + PostgreSQL
apps/web       Next.js 15 (App Router) + Tailwind 4
packages/shared  Catalogul AI Act + clasificatorul (funcție pură, folosită în API și în browser) + tipuri
```

## Pornire locală

```bash
docker compose up -d            # PostgreSQL pe 5432
cp .env.example apps/api/.env   # completează JWT_SECRET
npm install
npm run build -w @togato/shared
npm run db:migrate -w @togato/api
npm run dev:api                 # http://localhost:8080
npm run dev:web                 # http://localhost:3000
```

## Verificări

```bash
npm run build -w @togato/shared && npm test -w @togato/shared
cd apps/api && npx tsc --noEmit
cd apps/web && npx next build
```

## Variabile de mediu

| Variabilă | Unde | Rol |
|---|---|---|
| `DATABASE_URL` | api | PostgreSQL |
| `JWT_SECRET` | api | semnarea sesiunilor |
| `FRONTEND_URL` | api | originea permisă CORS |
| `ANTHROPIC_API_KEY` | api | opțional — analiza AI |
| `LISTAFIRME_API_KEY` | api | opțional — date extinse despre firme |
| `API_INTERNAL_URL` | web (la build) | adresa API-ului pentru rewrite-ul `/api/*` |
