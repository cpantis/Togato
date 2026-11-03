# 0003 — Sesiuni în baza de date, cookie httpOnly + CSRF

**Context.** JWT-urile din localStorage nu pot fi revocate (ieșire, parolă schimbată, cont dezactivat) și sunt expuse oricărui XSS.

**Decizie.** Token aleator în cookie `httpOnly`, `SameSite=Lax`, `Secure`; în DB doar hash-ul (`sessions`), cu expirare la inactivitate (7 zile) și absolută (30 de zile). Modificările cer `X-CSRF-Token` egal cu cookie-ul `togato_csrf`. Clienții API pot trimite același token ca `Bearer`.

**Consecințe.** O interogare în plus per cerere (sesiune + utilizator + cabinet, într-un singur JOIN). Ieșirea, resetarea parolei, dezactivarea și suspendarea au efect imediat.
