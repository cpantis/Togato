# Backup și recuperare după dezastru

## Ce se salvează

| Date | Unde | Backup |
|---|---|---|
| Toate datele cabinetelor (clienți, sisteme, obligații, avize, jurnale, sesiuni, joburi) | Postgres | Backup-uri automate Railway (zilnice, cu păstrare conform planului) **plus** un dump zilnic propriu, în altă locație |
| Dovezile și logo-urile | S3 / R2 (bucket privat) | Versionare activată pe bucket + replicare / copie zilnică în alt bucket (alt cont sau altă regiune) |
| Cheile (`ENCRYPTION_KEY`, `JWT_SECRET`, chei Stripe/Resend/Anthropic) | variabilele Railway | Copie în managerul de parole al firmei (acces pentru 2 persoane) |

Avizele înghețate au amprentă SHA-256: după o restaurare, `GET /api/snapshots/:id/pdf` verifică integritatea fiecăruia (`X-Togato-Integrity: ok`).

## Dump zilnic propriu

```bash
pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > togato-$(date +%F).dump
# criptat înainte de a părăsi mașina, apoi încărcat într-un bucket separat cu politică de păstrare 35 de zile
age -r "$BACKUP_PUBLIC_KEY" togato-$(date +%F).dump > togato-$(date +%F).dump.age
```

Rolul `togato_app` (Row-Level Security) e global în cluster: la restaurarea într-un cluster nou, migrația `0010_row_level_security.sql` îl recreează dacă lipsește (`npm run db:migrate`).

## Obiective

- **RPO** (cât putem pierde): 24 de ore cu dump-ul zilnic; minute, cu point-in-time recovery activat în Postgres.
- **RTO** (cât durează revenirea): sub 4 ore.

## Restaurare (exercițiu trimestrial obligatoriu)

1. Creați un mediu Railway temporar cu Postgres gol.
2. `pg_restore --no-owner --no-acl -d "$DATABASE_URL" togato-AAAA-LL-ZZ.dump`
3. `npm run db:migrate -w @togato/api` (aplică eventualele migrații mai noi decât dump-ul; creează rolul RLS).
4. Porniți `api` cu **aceeași** `ENCRYPTION_KEY` ca producția (altfel 2FA nu mai funcționează pentru nimeni).
5. Verificați: autentificare cu 2FA, deschiderea unui client, descărcarea unui aviz (integritate „ok”), a unei dovezi.
6. Notați data, durata și problemele în `docs/operations/restore-log.md`.

## Incidente

- **Baza de date compromisă / ștearsă**: opriți `api` și `worker` (scale 0), restaurați ultimul backup bun, rotiți `JWT_SECRET` (invalidează tokenurile 2FA în curs) și ștergeți tabelul `sessions` (toată lumea se reautentifică).
- **Cheie compromisă**: vezi `key-rotation.md`.
- **Scurgere de date personale**: notificare ANSPDCP în 72 de ore (GDPR art. 33) și informarea cabinetelor afectate — Togato e persoană împuternicită; cabinetele își informează clienții.
