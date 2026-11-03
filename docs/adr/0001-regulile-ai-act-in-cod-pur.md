# 0001 — Regulile AI Act sunt cod pur, versionat, în pachetul comun

**Context.** Încadrarea trebuie să fie identică în API (la salvare) și în browser (previzualizare), explicabilă avocatului și reproductibilă după o schimbare legislativă.

**Decizie.** `packages/shared/src/aiAct.ts` conține opțiunile chestionarului, catalogul de obligații și `classifyAiSystem` — o funcție pură, fără I/O. Fiecare schimbare de regulă primește o versiune în `RULESET_CHANGELOG`; sistemele salvate rețin `rulesetVersion`. La lansarea unei versiuni noi, jobul `ruleset.reclassify` le reîncadrează; schimbările de fond cer reverificarea avocatului.

**Consecințe.** Regulile se testează unitar, fără bază de date. Textul legii (JSON importat din EUR-Lex) e separat de reguli și verificat de un test: fiecare trimitere din catalog trebuie să existe în text. Încadrarea rămâne o propunere; decizia aparține avocatului (aprobare / încadrare manuală motivată).
