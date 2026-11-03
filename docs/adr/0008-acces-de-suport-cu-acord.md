# 0008 — Echipa Togato vede datele unui cabinet doar cu acordul lui

**Context.** Suportul are nevoie uneori de date, dar cabinetele răspund pentru datele clienților lor.

**Decizie.** Consola platformei vede doar metadate (stare, plan, numere). Datele (doar citire, fără impersonare) sunt vizibile numai cât timp un administrator al cabinetului a acordat acces (24 h – 7 zile, retras oricând). Fiecare acțiune a echipei apare în jurnalul platformei și în jurnalul cabinetului. Consola cere 2FA.

**Consecințe.** Suportul durează uneori mai mult (cererea de acces); în schimb, Togato poate afirma contractual că nu accesează datele fără acord.
