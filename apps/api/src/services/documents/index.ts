import { Packer } from "docx";
import { buildDocument, slug, type DocContext, type DocSystem } from "./common";
import { aiPolicy, aiRegister, complianceReport, employeeNotice, fria } from "./templates";

export type DocType = "raport" | "registru" | "politica" | "notificare_angajati" | "fria";

interface DocDef {
  type: DocType;
  title: string;
  description: string;
  /** documente generate pe un anumit sistem AI */
  perSystem: boolean;
  /** codul obligației pe care documentul o ajută să fie îndeplinită */
  obligationCode?: string;
  /** pentru documentele per sistem: sistemele eligibile */
  eligibleSystems?: (ctx: DocContext) => DocSystem[];
  build: (ctx: DocContext, system?: DocSystem) => ReturnType<typeof complianceReport>;
}

const hasObligation = (code: string) => (ctx: DocContext) => ctx.systems.filter((s) => s.obligations.some((o) => o.code === code));

export const DOCUMENTS: DocDef[] = [
  { type: "raport", title: "Raport de conformitate AI Act", description: "Situația sistemelor AI și a obligațiilor, pentru client.", perSystem: false, build: (ctx) => complianceReport(ctx) },
  { type: "registru", title: "Registrul sistemelor AI", description: "Evidența tuturor sistemelor AI, cu încadrarea și responsabilii.", perSystem: false, build: (ctx) => aiRegister(ctx) },
  { type: "politica", title: "Politica internă de utilizare AI", description: "Reguli pentru angajați: instrumente aprobate, date interzise, aprobare, instruire.", perSystem: false, obligationCode: "politica_ai", build: (ctx) => aiPolicy(ctx) },
  { type: "notificare_angajati", title: "Informarea angajaților", description: "Notificarea angajaților și a reprezentanților lor înainte de folosirea unui sistem cu risc ridicat (Art. 26(7)).", perSystem: true, obligationCode: "art26_7_angajati", eligibleSystems: hasObligation("art26_7_angajati"), build: (ctx, s) => employeeNotice(ctx, s!) },
  { type: "fria", title: "Evaluarea impactului asupra drepturilor fundamentale", description: "Structura evaluării cerute de Art. 27, precompletată cu datele sistemului.", perSystem: true, obligationCode: "art27_fria", eligibleSystems: hasObligation("art27_fria"), build: (ctx, s) => fria(ctx, s!) },
];

export function listDocuments(ctx: DocContext) {
  return DOCUMENTS.map((d) => {
    const systems = d.perSystem ? (d.eligibleSystems?.(ctx) ?? []) : [];
    const available = d.perSystem ? systems.length > 0 : ctx.systems.length > 0;
    return {
      type: d.type,
      title: d.title,
      description: d.description,
      perSystem: d.perSystem,
      obligationCode: d.obligationCode ?? null,
      available,
      unavailableReason: available ? null : d.perSystem ? "Niciun sistem al clientului nu are această obligație." : "Adaugă mai întâi cel puțin un sistem AI în inventar.",
      systems: systems.map((s) => ({ id: s.id, name: s.name })),
    };
  });
}

export async function renderDocument(ctx: DocContext, type: string, systemId?: string): Promise<{ buffer: Buffer; filename: string } | { error: string; status: 400 | 404 }> {
  const def = DOCUMENTS.find((d) => d.type === type);
  if (!def) return { error: "Tip de document necunoscut", status: 404 };
  let system: DocSystem | undefined;
  if (def.perSystem) {
    system = (def.eligibleSystems?.(ctx) ?? []).find((s) => s.id === systemId);
    if (!system) return { error: "Documentul nu se aplică pentru sistemul ales.", status: 400 };
  } else if (!ctx.systems.length) {
    return { error: "Adaugă mai întâi cel puțin un sistem AI în inventar.", status: 400 };
  }
  const doc = buildDocument(ctx, def.title, def.build(ctx, system));
  const buffer = await Packer.toBuffer(doc);
  const date = ctx.generatedAt.toISOString().slice(0, 10);
  const filename = `${slug(def.title)}_${slug(ctx.client.name)}${system ? `_${slug(system.name)}` : ""}_${date}.docx`;
  return { buffer, filename };
}
