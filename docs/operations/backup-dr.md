# Backup și recuperare după dezastru

## Ce se salvează

| Date | Unde | Backup |
|---|---|---|
| Toate datele cabinetelor (clienți, sisteme, obligații, avize, jurnale, sesiuni, joburi) | Postgres | Backup-uri automate Railway (zilnice, cu păstrare conform planului) **plus** un dump zilnic propriu, în altă locație |
| Dovezile și logo-urile | S3 / R2 (bucket privat) | Versionare activată pe bucket + replicare / copie zilnică în alt bucket (alt cont sau altă regiune) |
| Cheile (`ENCRYPTION_KEY`, `JWT_SECRET`, chei Stripe/Resend/Anthropic) | variabilele Railway | Copie în managerul de parole al firmei (acces pentru 2 persoane) |

Avizele înghețate au amprentă SHA-256: după o restaurare, `GET /api/snapshots/:id/pdf` verifică integritatea fiecăruia (`X-Togato-Integrity: ok`).

## Dump zilnic propriu (serviciul `backup`)

Serviciul Railway `backup` (`deploy/railway/backup.json`, imaginea `deploy/backup/Dockerfile`) rulează zilnic la 02:30 UTC scriptul `deploy/backup/backup.sh`:
`pg_dump` (format custom, cu drepturile rolului `togato_app`) → criptare `age` cu **cheia publică** → bucket S3/R2 separat (alt cont decât fișierele aplicației), cu amprentă `.sha256`; șterge copiile mai vechi de `BACKUP_RETENTION_DAYS` (35). Rezultatul (reușit / eșuat) se scrie în `ops_events`; monitorizarea alertează dacă lipsește un backup reușit în ultimele 26 de ore.

Configurare o singură dată:

```bash
age-keygen -o togato-backup.key   # afișează cheia publică age1…; fișierul cu cheia privată se păstrează OFFLINE (manager de parole, 2 persoane)
```

Variabile pe serviciu: `DATABASE_URL` (conexiunea de serviciu), `BACKUP_AGE_RECIPIENT` (cheia publică), `BACKUP_DESTINATION=s3://togato-backups/prod`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (doar scriere + listare + ștergere pe acel bucket), `AWS_DEFAULT_REGION=auto`, opțional `BACKUP_HEARTBEAT_URL`. Pe bucket: versionare / Object Lock dacă e disponibil, ca un atacator cu cheile serverului să nu poată șterge backup-urile.

Rolul `togato_app` (Row-Level Security) e global în cluster: la restaurarea într-un cluster nou, migrația `0010_row_level_security.sql` îl recreează dacă lipsește (`npm run db:migrate`).

## Obiective

- **RPO** (cât putem pierde): 24 de ore cu dump-ul zilnic; minute, cu point-in-time recovery activat în Postgres.
- **RTO** (cât durează revenirea): sub 4 ore.

## Restaurare (exercițiu trimestrial obligatoriu)

1. Creați un mediu Railway temporar cu Postgres gol.
2. `TARGET_DATABASE_URL=… BACKUP_AGE_IDENTITY=togato-backup.key deploy/backup/restore.sh s3://togato-backups/prod/togato-….dump.age` — verifică amprenta, decriptează, creează rolul `togato_app` dacă lipsește, restaurează și afișează numărul de cabinete / clienți / avize / dovezi. Refuză o bază țintă care nu e goală.
3. `npm run db:migrate -w @togato/api` (aplică eventualele migrații mai noi decât dump-ul).
4. Porniți `api` cu **aceeași** `ENCRYPTION_KEY` ca producția (altfel 2FA nu mai funcționează pentru nimeni).
5. Verificați: autentificare cu 2FA, deschiderea unui client, descărcarea unui aviz (integritate „ok”), a unei dovezi.
6. Notați data, durata și problemele în `docs/operations/restore-log.md`.

## Incidente

- **Baza de date compromisă / ștearsă**: opriți `api` și `worker` (scale 0), restaurați ultimul backup bun, rotiți `JWT_SECRET` (invalidează tokenurile 2FA în curs) și ștergeți tabelul `sessions` (toată lumea se reautentifică).
- **Cheie compromisă**: vezi `key-rotation.md`.
- **Scurgere de date personale**: notificare ANSPDCP în 72 de ore (GDPR art. 33) și informarea cabinetelor afectate — Togato e persoană împuternicită; cabinetele își informează clienții.
