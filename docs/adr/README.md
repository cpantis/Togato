# Decizii de arhitectură (ADR)

Fiecare decizie importantă: contextul, decizia, consecințele. O decizie se schimbă printr-un ADR nou care o înlocuiește.

| Nr. | Decizie |
|---|---|
| [0001](0001-regulile-ai-act-in-cod-pur.md) | Regulile AI Act sunt cod pur, versionat, în pachetul comun |
| [0002](0002-separarea-cabinetelor-cod-si-rls.md) | Separarea cabinetelor: filtre în cod + Row-Level Security |
| [0003](0003-sesiuni-in-baza-de-date.md) | Sesiuni în baza de date, cookie httpOnly + CSRF |
| [0004](0004-coada-de-joburi-in-postgres.md) | Coada de joburi în Postgres, nu Redis |
| [0005](0005-avize-inghetate.md) | Avizele aprobate sunt instantanee imuabile cu amprentă |
| [0006](0006-ai-cu-consimtamant-si-citari.md) | Analiza AI: opțională, cu consimțământul cabinetului și citări din textul oficial |
| [0007](0007-starea-abonamentului-din-webhook.md) | Starea abonamentului se schimbă doar din webhook-uri Stripe |
| [0008](0008-acces-de-suport-cu-acord.md) | Echipa Togato vede datele unui cabinet doar cu acordul lui |
