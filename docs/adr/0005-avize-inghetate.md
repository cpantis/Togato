# 0005 — Avizele aprobate sunt instantanee imuabile cu amprentă

**Context.** Avocatul trebuie să poată dovedi ce a aprobat, când și pe ce bază, chiar dacă răspunsurile, regulile sau legea se schimbă ulterior.

**Decizie.** La aprobare și la încadrarea manuală se creează, în aceeași tranzacție, un instantaneu (`analysis_snapshots`) cu toate datele + versiunea regulilor și a textului legii, cu amprentă SHA-256 peste JSON canonic. Nu există rute de modificare sau ștergere. PDF-ul verifică amprenta la fiecare generare.

**Consecințe.** Datele cresc liniar cu numărul de aprobări (mic). Ștergerea clientului (doar după arhivare) le șterge și pe ele — exportul dosarului le include înainte.
