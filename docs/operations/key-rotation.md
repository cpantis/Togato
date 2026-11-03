# Rotirea cheilor

## `ENCRYPTION_KEY` (secretele 2FA, criptate AES-256-GCM)

1. Generați o cheie nouă: `openssl rand -hex 32`.
2. Pe `api` și `worker`: `ENCRYPTION_KEY_PREVIOUS` = cheia actuală, `ENCRYPTION_KEY` = cheia nouă. Lansați. Datele vechi se citesc cu cheia anterioară, cele noi se scriu cu cheia nouă.
3. Rescrieți datele existente cu cheia nouă (idempotent, se poate relua):
   `railway run -s api -- node dist/scripts/reencrypt.js` → `{"checked":…,"rewritten":…,"failed":0}`
4. Dacă `failed` e 0, ștergeți `ENCRYPTION_KEY_PREVIOUS` și lansați din nou. Actualizați copia din managerul de parole.

Testat în `apps/api/src/lib/crypto.test.ts` și `apps/api/test/keys.int.test.ts`.

## `JWT_SECRET`

Folosit doar pentru tokenul de 5 minute dintre parolă și codul 2FA (sesiunile sunt în baza de date). Se înlocuiește direct; efectul: autentificările în curs trebuie reluate.

## Sesiuni

Toate sesiunile: `DELETE FROM sessions;` (toată lumea se reautentifică). Ale unui cabinet: suspendarea din consola platformei le închide automat.

## Chei externe (Stripe, Resend, Anthropic, S3/R2, Sentry)

Generați cheia nouă în furnizor → actualizați variabila → lansați → revocați cheia veche. Pentru Stripe, `STRIPE_WEBHOOK_SECRET` se schimbă odată cu endpoint-ul webhook („Roll secret”).
