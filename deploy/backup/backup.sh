#!/bin/sh
# Backup zilnic criptat al bazei Togato: pg_dump → age (cheie publică) → S3/R2 (sau un director local).
# Serverul are doar cheia publică: un backup furat nu poate fi citit fără cheia privată (ținută offline).
#
# Variabile:
#   DATABASE_URL            baza de date (conexiunea de serviciu)
#   BACKUP_AGE_RECIPIENT    cheia publică age (age1…), generată cu `age-keygen`
#   BACKUP_DESTINATION      s3://bucket/prefix  sau  file:///cale/director
#   BACKUP_RETENTION_DAYS   câte zile se păstrează (implicit 35)
#   S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION (pentru s3://; R2: region auto)
#   BACKUP_HEARTBEAT_URL    opțional: URL apelat la reușită (ex. healthchecks.io) — alertă dacă nu mai vine
set -eu

: "${DATABASE_URL:?lipsește DATABASE_URL}"
: "${BACKUP_AGE_RECIPIENT:?lipsește BACKUP_AGE_RECIPIENT (cheia publică age)}"
: "${BACKUP_DESTINATION:?lipsește BACKUP_DESTINATION (s3://… sau file://…)}"
RETENTION="${BACKUP_RETENTION_DAYS:-35}"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
NAME="togato-${STAMP}.dump.age"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

record() { # înregistrează rezultatul în ops_events (citit de monitorizare)
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -c "insert into ops_events (kind, status, detail) values ('backup', '$1', '$2'::jsonb)" >/dev/null 2>&1 || echo "avertisment: rezultatul nu s-a putut înregistra în ops_events" >&2
}
fail() { echo "backup eșuat: $1" >&2; record failed "{\"error\": \"$1\", \"name\": \"$NAME\"}"; exit 1; }

echo "backup: $NAME"
# ACL-urile se păstrează (drepturile rolului togato_app); proprietarul se stabilește la restaurare
pg_dump --format=custom --no-owner "$DATABASE_URL" > "$WORK/db.dump" || fail "pg_dump"
pg_restore --list "$WORK/db.dump" > /dev/null || fail "dump invalid"
age -r "$BACKUP_AGE_RECIPIENT" -o "$WORK/$NAME" "$WORK/db.dump" || fail "criptare"
rm -f "$WORK/db.dump"
SIZE=$(wc -c < "$WORK/$NAME" | tr -d ' ')
SHA=$(sha256sum "$WORK/$NAME" | cut -d' ' -f1)
echo "$SHA  $NAME" > "$WORK/$NAME.sha256"

case "$BACKUP_DESTINATION" in
  s3://*)
    DEST="${BACKUP_DESTINATION%/}"
    EP=""; [ -n "${S3_ENDPOINT:-}" ] && EP="--endpoint-url $S3_ENDPOINT"
    # shellcheck disable=SC2086
    aws $EP s3 cp --only-show-errors "$WORK/$NAME" "$DEST/$NAME" || fail "încărcare"
    # shellcheck disable=SC2086
    aws $EP s3 cp --only-show-errors "$WORK/$NAME.sha256" "$DEST/$NAME.sha256" || fail "încărcare sha256"
    # păstrare: șterge backup-urile mai vechi decât RETENTION zile (recomandat și o regulă de ciclu de viață pe bucket)
    CUTOFF=$(date -u -d "@$(( $(date -u +%s) - RETENTION * 86400 ))" +%Y-%m-%dT%H%M%SZ 2>/dev/null || date -u -v-"${RETENTION}"d +%Y-%m-%dT%H%M%SZ)
    # shellcheck disable=SC2086
    aws $EP s3 ls "$DEST/" | awk '{print $4}' | grep '^togato-' | while read -r f; do
      ts=$(echo "$f" | sed -E 's/^togato-([0-9TZ-]+)\.dump\.age.*$/\1/')
      if [ "$ts" \< "$CUTOFF" ]; then aws $EP s3 rm --only-show-errors "$DEST/$f"; fi
    done
    ;;
  file://*)
    DIR="${BACKUP_DESTINATION#file://}"
    mkdir -p "$DIR"
    cp "$WORK/$NAME" "$WORK/$NAME.sha256" "$DIR/" || fail "copiere"
    find "$DIR" -name 'togato-*.dump.age*' -mtime +"$RETENTION" -delete
    ;;
  *) fail "BACKUP_DESTINATION necunoscut" ;;
esac

record ok "{\"name\": \"$NAME\", \"bytes\": $SIZE, \"sha256\": \"$SHA\"}"
if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then curl -fsS -m 10 -o /dev/null "$BACKUP_HEARTBEAT_URL" || echo "avertisment: heartbeat nereușit" >&2; fi
echo "backup reușit: $NAME ($SIZE octeți, sha256 $SHA)"
