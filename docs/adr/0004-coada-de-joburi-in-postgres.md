# 0004 — Coada de joburi în Postgres, nu Redis

**Context.** Emailurile, memoriile AI și reîncadrările nu trebuie să blocheze cererile și trebuie reîncercate la eșec. Volumul e mic (cabinete, nu consumatori).

**Decizie.** Tabelul `jobs` cu `FOR UPDATE SKIP LOCKED`, reîncercări exponențiale, `dedupeKey` unic, eliberarea joburilor blocate. Joburile se pun în coadă **în aceeași tranzacție** cu operația (emailul pleacă doar dacă invitația a fost salvată).

**Consecințe.** O singură dependență de infrastructură (Postgres). Dacă volumul crește cu ordine de mărime, coada se poate muta (pg-boss / un broker) fără a schimba handlerele.
