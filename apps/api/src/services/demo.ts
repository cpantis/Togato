/**
 * Clientul demonstrativ: o firmă fictivă cu trei sisteme AI tipice (risc ridicat, transparență, minim),
 * încadrate automat, ca un cabinet nou să vadă fluxul complet. Un singur client demonstrativ per cabinet;
 * nu intră în limitele planului și se șterge ca orice client (arhivare, apoi ștergere).
 */
import { and, eq } from "drizzle-orm";
import { EMPTY_ANSWERS, RULESET_VERSION, classifyAiSystem, normalizeAnswers, type AiSystemAnswers } from "@togato/shared";
import { db } from "../db";
import { aiSystems, clients } from "../db/schema";
import { syncClientObligations, syncSystemObligations } from "./obligationsSync";
import { lockOrganization } from "./billing";

export const DEMO_CLIENT_NAME = "Exemplu Logistic SRL (demonstrativ)";

const SYSTEMS: { name: string; vendor: string; purpose: string; department: string; description: string; answers: Partial<AiSystemAnswers> }[] = [
  {
    name: "Selecția automată a CV-urilor", vendor: "Furnizor HR (exemplu)", department: "Resurse umane",
    purpose: "Ordonează candidații pentru posturile de șofer și dispecer",
    description: "Platformă de recrutare care analizează CV-urile și propune o listă scurtă de candidați. Decizia finală o ia recrutorul.",
    answers: { qualification: "da", annexIII: ["4a_recrutare"], workplace: true, decisionsOnPersons: true },
  },
  {
    name: "Asistent virtual pe site", vendor: "Chatbot SaaS (exemplu)", department: "Relații clienți",
    purpose: "Răspunde la întrebările clienților despre livrări",
    description: "Chatbot bazat pe un model de limbaj, integrat pe site; preia reclamații și urmărește coletele.",
    answers: { qualification: "da", transparency: ["chatbot"] },
  },
  {
    name: "Filtru antispam pentru email", vendor: "Suita de email (exemplu)", department: "IT",
    purpose: "Filtrează mesajele nesolicitate",
    description: "Funcție inclusă în serviciul de email al firmei.",
    answers: { qualification: "da" },
  },
];

/** creează clientul demonstrativ (sau îl întoarce pe cel existent) */
export async function createDemoClient(organizationId: string, userId: string): Promise<{ id: string; created: boolean }> {
  // cereri paralele: a doua așteaptă și găsește clientul creat de prima
  await lockOrganization(organizationId);
  const existing = await db.query.clients.findFirst({ where: and(eq(clients.organizationId, organizationId), eq(clients.isDemo, true)) });
  if (existing) return { id: existing.id, created: false };
  return db.transaction(async (tx) => {
    const [client] = await tx.insert(clients).values({
      organizationId, name: DEMO_CLIENT_NAME, isDemo: true, city: "Cluj-Napoca", county: "Cluj", caen: "4941", caenDescription: "Transporturi rutiere de mărfuri",
      employees: 85, contactName: "Ana Exemplu", notes: "Client demonstrativ cu date fictive. Îl puteți arhiva și șterge oricând.",
      createdBy: userId, responsibleUserId: userId,
    }).returning({ id: clients.id });
    for (const s of SYSTEMS) {
      const answers = normalizeAnswers({ ...EMPTY_ANSWERS, ...s.answers });
      const classification = classifyAiSystem(answers);
      const [row] = await tx.insert(aiSystems).values({
        organizationId, clientId: client.id, name: s.name, vendor: s.vendor, description: s.description, purpose: s.purpose, department: s.department,
        answers, riskLevel: classification.riskLevel, classification, rulesetVersion: RULESET_VERSION, createdBy: userId,
      }).returning({ id: aiSystems.id });
      await syncSystemObligations(tx, { organizationId, clientId: client.id, aiSystemId: row.id, templates: classification.obligations });
    }
    await syncClientObligations(tx, organizationId, client.id);
    return { id: client.id, created: true };
  });
}
