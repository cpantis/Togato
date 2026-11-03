# 0006 — Analiza AI: opțională, cu consimțământul cabinetului și citări din textul oficial

**Context.** Cabinetele au obligația de secret profesional; un memoriu AI fără surse e inutilizabil juridic.

**Decizie.** Analiza e dezactivată implicit; un administrator o activează (cu data și autorul). Se trimit doar datele strict necesare. Pasajele relevante din textul oficial se trimit ca documente cu citări activate; răspunsul conține trimiteri `[n]` verificabile. Generarea rulează asincron în worker.

**Consecințe.** Costul și latența modelului nu afectează interfața; eșecurile sunt afișate și reîncercabile. Memoriul rămâne un instrument de lucru, nu un aviz.
