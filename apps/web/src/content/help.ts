/** Centrul de ajutor: întrebări frecvente, pe secțiuni (afișate în /ajutor). */
export interface HelpSection { id: string; title: string; items: { q: string; a: string }[] }

export const HELP: HelpSection[] = [
  {
    id: "primii-pasi", title: "Primii pași",
    items: [
      { q: "Cum încep?", a: "Creați contul cabinetului, confirmați adresa de email și adăugați primul client după CUI (datele firmei se preiau de la ANAF). Apoi adăugați sistemele AI pe care le folosește clientul. Pentru o privire rapidă, din panoul de control puteți încărca un client demonstrativ cu date fictive." },
      { q: "Ce este clientul demonstrativ?", a: "O firmă fictivă cu trei sisteme AI tipice (selecția CV-urilor, un chatbot, un filtru antispam), încadrate automat. Nu intră în limita planului și se poate arhiva și șterge oricând." },
      { q: "Cum invit colegii?", a: "Din Echipă → Invită. Rolurile: administrator (gestionează echipa, setările și abonamentul), membru (lucrează pe dosare) și colaborator (doar citire, vede doar clienții la care primește acces — potrivit pentru experți externi)." },
    ],
  },
  {
    id: "incadrare", title: "Încadrarea sistemelor AI",
    items: [
      { q: "Încadrarea Togato e o opinie juridică?", a: "Nu. Togato propune calificarea, rolul și nivelul de risc pe baza răspunsurilor la chestionar și a regulilor versionate. Avocatul verifică propunerea și o aprobă, o respinge sau stabilește manual încadrarea, cu motivare." },
      { q: "Ce înseamnă un aviz înghețat?", a: "La aprobare, Togato păstrează o copie imuabilă a tot ce a stat la baza avizului (răspunsuri, încadrare, obligații, versiunea regulilor și a textului legii), cu o amprentă SHA-256. La fiecare descărcare a PDF-ului amprenta se verifică." },
      { q: "Ce se întâmplă când se schimbă legislația?", a: "Regulile se actualizează într-o versiune nouă. Sistemele sunt reîncadrate automat: schimbările minore se aplică direct, cele de fond (nivel de risc, obligații noi sau eliminate) readuc sistemul la stadiul de propunere, cu diferențele explicate. Încadrările manuale nu sunt suprascrise." },
      { q: "Ce trimite analiza AI și cine o activează?", a: "Analiza AI e dezactivată implicit. Un administrator o poate activa pentru cabinet; descrierea sistemului și răspunsurile la chestionar se trimit atunci furnizorului modelului. Orice client poate fi exclus separat, din pagina lui." },
    ],
  },
  {
    id: "portal", title: "Portalul clientului și autoevaluarea",
    items: [
      { q: "Ce vede clientul în portal?", a: "Întrebări simple despre instrumentele pe care le folosește. Clientul nu vede încadrarea juridică. Linkul e valabil 90 de zile; generarea unui link nou îl invalidează pe cel vechi." },
      { q: "Cum primesc clienți din autoevaluare?", a: "Completați profilul din Setări → Director. Firmele care fac autoevaluarea gratuită vă pot alege; primiți o solicitare cu o copie a datelor lor. Înainte de acceptare confirmați verificarea conflictului de interese." },
    ],
  },
  {
    id: "gdpr", title: "GDPR",
    items: [
      { q: "Ce acoperă modulul GDPR?", a: "Registrul activităților de prelucrare (Art. 30), cererile persoanelor vizate cu termenul de o lună (prelungire motivată), incidentele de securitate cu termenul de 72 de ore pentru notificarea ANSPDCP și evaluarea de impact (DPIA), plus documente Word și scrisori pentru cereri." },
      { q: "Primesc alerte pentru termene?", a: "Da. Incidentele notificabile trimit imediat o alertă și o reamintire cu 24 de ore înainte de termen; cererile cu termen în 7 zile intră în rezumatul zilnic." },
    ],
  },
  {
    id: "securitate", title: "Securitate și acces",
    items: [
      { q: "Cum restricționez accesul la un client?", a: "Din pagina clientului → Acces la client (doar administratorii). Un client restricționat e vizibil doar administratorilor, avocatului responsabil și colegilor bifați — util la conflicte de interese în cabinet." },
      { q: "Poate echipa Togato să vadă datele mele?", a: "Doar dacă un administrator acordă explicit acces de suport, doar în citire, pentru 24 de ore, 3 sau 7 zile, retras oricând. Fiecare consultare apare în jurnalul cabinetului." },
      { q: "Pot face autentificarea în doi pași obligatorie?", a: "Da, din Setări → Securitate. Pentru administratori, autentificarea în doi pași este obligatorie." },
    ],
  },
  {
    id: "abonament", title: "Abonament, export și închiderea contului",
    items: [
      { q: "Ce se întâmplă la finalul probei?", a: "Primiți emailuri cu 7 zile și cu o zi înainte. După expirare, datele rămân disponibile pentru consultare și export; modificările cer un abonament." },
      { q: "Cum export toate datele?", a: "Setări → Date și închiderea contului → Exportă toate datele: o arhivă ZIP cu dosarul complet al fiecărui client (inclusiv arhivați), echipa și jurnalul de activitate. Exportul unui singur client se face din pagina lui." },
      { q: "Cum închid contul?", a: "Un administrator cere închiderea din Setări, confirmând numele cabinetului (după anularea abonamentului). Datele se șterg definitiv după 30 de zile; până atunci pot fi consultate și exportate, iar închiderea poate fi anulată." },
      { q: "Cât timp se păstrează clienții arhivați?", a: "Implicit, nelimitat. Puteți stabili un termen (1–10 ani de la arhivare) din Setări; administratorii primesc un email cu 30 de zile înainte de ștergere." },
    ],
  },
];
