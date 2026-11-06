#!/bin/sh
# Restaurarea unui backup Togato într-o bază de date GOALĂ (exercițiu trimestrial sau dezastru).
#
#   restore.sh <fișier.dump.age | s3://bucket/prefix/togato-….dump.age>
# Variabile:
#   TARGET_DATABASE_URL    baza de date goală în care se restaurează
#   BACKUP_AGE_IDENTITY    fișierul cu cheia privată age (ținut offline; nu se pune pe server)
#   S3_ENDPOINT, AWS_*     pentru o sursă s3://
set -eu
SRC="${1:?folosire: restore.sh <backup>}"
: "${TARGET_DATABASE_URL:?lipsește TARGET_DATABASE_URL}"
: "${BACKUP_AGE_IDENTITY:?lipsește BACKUP_AGE_IDENTITY (fișierul cheii private)}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

case "$SRC" in
  s3://*)
    EP=""; [ -n "${S3_ENDPOINT:-}" ] && EP="--endpoint-url $S3_ENDPOINT"
    # shellcheck disable=SC2086
    aws $EP s3 cp --only-show-errors "$SRC" "$WORK/backup.age"
    # shellcheck disable=SC2086
    aws $EP s3 cp --only-show-errors "$SRC.sha256" "$WORK/backup.sha256" || true
    ;;
  *) cp "$SRC" "$WORK/backup.age"; [ -f "$SRC.sha256" ] && cp "$SRC.sha256" "$WORK/backup.sha256" ;;
esac
if [ -f "$WORK/backup.sha256" ]; then
  [ "$(cut -d' ' -f1 < "$WORK/backup.sha256")" = "$(sha256sum "$WORK/backup.age" | cut -d' ' -f1)" ] || { echo "amprenta SHA-256 nu corespunde: fișier corupt" >&2; exit 1; }
  echo "amprenta verificată"
fi

age -d -i "$BACKUP_AGE_IDENTITY" -o "$WORK/db.dump" "$WORK/backup.age"

TABLES=$(psql "$TARGET_DATABASE_URL" -tA -c "select count(*) from information_schema.tables where table_schema = 'public'")
[ "$TABLES" = "0" ] || { echo "baza țintă nu e goală ($TABLES tabele) — restaurați într-o bază nouă" >&2; exit 1; }

# rolul folosit de Row-Level Security trebuie să existe înainte (drepturile din dump îl referă)
psql "$TARGET_DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'togato_app') THEN
    CREATE ROLE togato_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
GRANT togato_app TO CURRENT_USER;
SQL

pg_restore --no-owner --exit-on-error -d "$TARGET_DATABASE_URL" "$WORK/db.dump"

echo "restaurat. Verificare:"
psql "$TARGET_DATABASE_URL" -tA -F ' ' -c "select 'cabinete', count(*) from organizations union all select 'utilizatori', count(*) from users union all select 'clienți', count(*) from clients union all select 'avize', count(*) from analysis_snapshots union all select 'dovezi', count(*) from evidence union all select 'migrații', count(*) from drizzle.__drizzle_migrations"
echo "Pașii următori: npm run db:migrate -w @togato/api (migrațiile mai noi), apoi API-ul cu ACEEAȘI ENCRYPTION_KEY; verificați integritatea avizelor (docs/operations/backup-dr.md)."
