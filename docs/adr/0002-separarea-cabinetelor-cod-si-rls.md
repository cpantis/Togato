# 0002 — Separarea cabinetelor: filtre în cod + Row-Level Security

**Context.** O scurgere de date între cabinete de avocatură ar fi fatală (secret profesional, GDPR). Un singur filtru uitat într-o rută ajunge.

**Decizie.** Două linii de apărare: (1) fiecare interogare filtrează pe `organizationId` (inclusiv în WHERE-ul UPDATE/DELETE); (2) cererile autentificate rulează într-o tranzacție cu rolul `togato_app` și `app.org_id`, iar politicile RLS refuză rândurile altor cabinete (fail-closed fără context). `test/isolation.int.test.ts` parcurge automat toate rutele cu identificator; `test/rls.int.test.ts` verifică politicile pe fiecare tabel cu `organization_id`.

**Consecințe.** O tranzacție per cerere (modificările parțiale se anulează la eroare) și o conexiune ținută pe durata cererii — pool-ul se dimensionează în consecință (`DB_POOL_MAX`). Workerul și rutele publice folosesc conexiunea de serviciu și filtrează explicit. Interogările peste cabinete (`withoutTenant`) sunt rare și justificate.
