/**
 * Textele juridice ale Togato — PROIECTE, de revizuit și completat de un avocat înainte de lansare.
 * Câmpurile [între paranteze drepte] se completează cu datele societății care operează Togato.
 * Formatul: ## titluri, liste cu „- ”, paragrafe, **îngroșat** (vezi components/Markdown.tsx).
 */
export const LEGAL_TEXTS: Record<string, { title: string; body: string }> = {
  termeni: {
    title: "Termeni și condiții",
    body: `## 1. Părțile și obiectul
Togato este un serviciu online operat de [denumirea societății], cu sediul în [adresa], CUI [CUI], înregistrată la Registrul Comerțului sub nr. [număr] („Togato”, „noi”). Serviciul ajută cabinetele de avocatură și de consultanță („Cabinetul”) să gestioneze conformitatea clienților lor cu Regulamentul (UE) 2024/1689 (AI Act) și cu Regulamentul (UE) 2016/679 (GDPR).

## 2. Contul
- Contul se creează de un reprezentant al Cabinetului, care declară că are dreptul să îl angajeze.
- Cabinetul răspunde de utilizatorii pe care îi invită și de păstrarea confidențialității datelor de autentificare. Recomandăm activarea autentificării în doi pași pentru toți utilizatorii.
- Adresa de email trebuie confirmată înainte de utilizare.

## 3. Natura serviciului
- Încadrările, obligațiile, evaluările de impact, documentele și memoriile generate sunt **instrumente de lucru** care pornesc de la datele introduse de Cabinet. Ele nu constituie consultanță juridică din partea Togato.
- Decizia și răspunderea profesională față de clienții Cabinetului aparțin exclusiv avocaților și consultanților Cabinetului.
- Autoevaluarea gratuită disponibilă firmelor are caracter orientativ și nu constituie consultanță juridică.

## 4. Perioada de probă, abonamentul și plata
- Cabinetul beneficiază de o perioadă de probă de 14 zile, cu limitele afișate în aplicație.
- Abonamentele se plătesc lunar, în avans, prin procesatorul de plăți Stripe. Prețurile sunt cele afișate la momentul comenzii, fără TVA.
- La expirarea probei sau a abonamentului, datele rămân disponibile pentru consultare și export, dar nu mai pot fi modificate.
- Facturile se emit conform legislației fiscale române [inclusiv prin sistemul RO e-Factura].

## 5. Obligațiile Cabinetului
- Să introducă date exacte și să le folosească în conformitate cu legea și cu obligațiile profesionale (inclusiv secretul profesional).
- Să nu folosească serviciul în scopuri ilegale și să nu încerce să acceseze datele altor cabinete.
- Să informeze clienții săi, în calitate de operator, despre folosirea Togato ca persoană împuternicită.

## 6. Datele cu caracter personal
Pentru datele clienților săi, Cabinetul este operator, iar Togato este persoană împuternicită, în condițiile Acordului de prelucrare a datelor, care face parte din acești termeni. Pentru datele utilizatorilor, Togato este operator, conform Politicii de confidențialitate.

## 7. Disponibilitate și asistență
Depunem eforturi rezonabile pentru disponibilitatea continuă a serviciului, cu excepția întreruperilor planificate, anunțate în prealabil. Asistența se oferă pe email la [adresa de suport].

## 8. Răspunderea
- Togato nu răspunde pentru deciziile profesionale luate de Cabinet pe baza informațiilor din aplicație.
- Răspunderea totală a Togato pentru orice prejudiciu este limitată la sumele plătite de Cabinet în ultimele 12 luni, cu excepția cazurilor în care legea nu permite limitarea.

## 9. Proprietatea intelectuală
Aplicația, regulile de încadrare și modelele de documente aparțin Togato. Datele introduse de Cabinet și documentele generate pentru clienții săi aparțin Cabinetului.

## 10. Încetarea
- Cabinetul poate închide contul oricând din Setări, după exportul datelor. Datele se șterg după o perioadă de grație de 30 de zile.
- Togato poate suspenda contul în caz de neplată sau de încălcare gravă a acestor termeni, cu notificare prealabilă, cu excepția situațiilor urgente.

## 11. Modificări
Vă anunțăm modificările acestor termeni în aplicație și pe email. Continuarea utilizării presupune acceptarea noii versiuni de către un administrator al Cabinetului.

## 12. Legea aplicabilă
Acești termeni sunt guvernați de legea română. Litigiile se soluționează pe cale amiabilă sau, în lipsa acordului, de instanțele competente de la sediul Togato.`,
  },
  confidentialitate: {
    title: "Politica de confidențialitate",
    body: `## Cine suntem
Operatorul datelor descrise aici este [denumirea societății], CUI [CUI], [adresa]. Contact pentru protecția datelor: [email DPO / contact].

## Ce date prelucrăm, în ce scop și pe ce temei
- **Utilizatorii cabinetelor** (nume, email, rol, jurnalul activității, date de autentificare): pentru furnizarea serviciului, în baza contractului cu Cabinetul (Art. 6(1)(b)) și a interesului legitim de a asigura securitatea (Art. 6(1)(f)).
- **Facturare** (date ale Cabinetului și ale persoanei de contact): pentru obligațiile fiscale (Art. 6(1)(c)).
- **Firmele care folosesc autoevaluarea gratuită** (denumirea firmei, numele și emailul persoanei de contact, răspunsurile): pentru furnizarea autoevaluării la cererea lor (Art. 6(1)(b)) și, numai cu acordul lor explicit, pentru transmiterea către cabinetul ales.
- **Date tehnice** (adresa IP, tipul browserului): pentru securitate și prevenirea abuzurilor (Art. 6(1)(f)).

Datele clienților cabinetelor (firme, sisteme AI, prelucrări GDPR) le prelucrăm doar în calitate de persoană împuternicită, conform Acordului de prelucrare a datelor.

## Cât timp le păstrăm
- Datele contului: pe durata contractului și 30 de zile după închidere.
- Jurnalele de securitate: [12 luni].
- Autoevaluările nefolosite: 12 luni de la ultima modificare.
- Documentele contabile: conform legislației fiscale.

## Cui le transmitem
Furnizorilor de servicii enumerați în Lista persoanelor împuternicite secundare, cu contracte conforme Art. 28 GDPR. Unii furnizori sunt în afara Spațiului Economic European; transferurile au la bază decizii de adecvare sau clauze contractuale standard.

## Drepturile dumneavoastră
Aveți dreptul de acces, rectificare, ștergere, restricționare, portabilitate și opoziție, precum și dreptul de a vă retrage consimțământul. Ne puteți scrie la [contact]. Aveți dreptul de a depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (www.dataprotection.ro).

## Cookie-uri
Folosim doar cookie-uri strict necesare (sesiunea de autentificare și protecția împotriva falsificării cererilor). Analitica, dacă este activă, nu folosește cookie-uri și nu identifică vizitatorii.`,
  },
  dpa: {
    title: "Acordul de prelucrare a datelor",
    body: `Acest acord completează Termenii și condițiile și se aplică prelucrării datelor cu caracter personal pe care Togato le efectuează în numele Cabinetului, conform Art. 28 din Regulamentul (UE) 2016/679.

## 1. Obiectul, durata, natura și scopul
- **Obiect:** găzduirea și prelucrarea datelor introduse de Cabinet în Togato pentru gestionarea conformității clienților săi.
- **Durată:** pe durata contractului și până la ștergerea datelor după încetare.
- **Natură:** stocare, structurare, consultare, generare de documente, transmitere la cererea Cabinetului.
- **Categorii de persoane vizate:** reprezentanți și angajați ai clienților Cabinetului, persoane vizate ale clienților (în registre, cereri, incidente).
- **Categorii de date:** date de identificare și contact; alte categorii introduse de Cabinet, inclusiv, după caz, categorii speciale descrise în registre.

## 2. Obligațiile Togato
- Prelucrează datele numai pe baza instrucțiunilor documentate ale Cabinetului, inclusiv cele date prin folosirea aplicației.
- Asigură confidențialitatea: personalul cu acces este obligat la confidențialitate; echipa Togato accesează datele unui cabinet doar cu acordul acestuia, acordat în aplicație, limitat în timp și jurnalizat.
- Aplică măsurile de securitate din Art. 32: separarea datelor între cabinete la nivelul bazei de date, criptarea în tranzit, criptarea secretelor de autentificare, autentificare în doi pași, jurnalizare, copii de siguranță criptate.
- Folosește persoane împuternicite secundare numai cu informarea prealabilă a Cabinetului, care se poate opune; lista curentă este publicată.
- Asistă Cabinetul în răspunsul la cererile persoanelor vizate și în îndeplinirea obligațiilor din Art. 32–36.
- Notifică Cabinetul fără întârzieri nejustificate, în cel mult [48] de ore de la constatare, orice încălcare a securității datelor.
- La încetare, pune la dispoziție exportul complet al datelor și le șterge după 30 de zile, cu excepția cazurilor în care legea impune păstrarea.
- Pune la dispoziție informațiile necesare pentru demonstrarea conformității și permite audituri, cu notificare rezonabilă.

## 3. Transferuri
Transferurile către țări din afara SEE se fac numai în baza unei decizii de adecvare sau a clauzelor contractuale standard, cu măsurile suplimentare necesare.

## 4. Analiza AI
Analiza AI (memoriul juridic) este dezactivată implicit și se activează doar de un administrator al Cabinetului. Când este activă, datele strict necesare analizei sunt transmise furnizorului modelului, conform Listei persoanelor împuternicite secundare.`,
  },
  subimputerniciti: {
    title: "Lista persoanelor împuternicite secundare",
    body: `Ultima actualizare: [data]. Vă anunțăm orice modificare cu cel puțin [30] de zile înainte.

- **Railway Corp.** — găzduirea aplicației și a bazei de date; regiunea [UE — de confirmat].
- **Cloudflare, Inc. (R2)** — stocarea fișierelor încărcate (dovezi, logo-uri); jurisdicția [UE — de confirmat].
- **Resend, Inc.** — trimiterea emailurilor; SUA, în baza [EU-US Data Privacy Framework / clauzelor contractuale standard].
- **Anthropic, PBC** — analiza AI (doar dacă e activată de Cabinet); SUA, în baza [clauzelor contractuale standard], [fără păstrarea datelor pentru antrenare].
- **Stripe Payments Europe, Ltd.** — procesarea plăților; Irlanda.
- **Functional Software, Inc. (Sentry)** — raportarea erorilor tehnice, fără conținutul cererilor; regiunea [UE].
- **[Plausible Insights OÜ]** — analitică fără cookie-uri, dacă e activă; UE.`,
  },
};
