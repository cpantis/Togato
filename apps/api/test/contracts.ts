/**
 * Contractul API ↔ web: scheme zod stricte pentru răspunsurile principale, legate la compilare de
 * interfețele din @togato/shared (tipurile trebuie să fie identice). Testul de integrare validează
 * răspunsurile reale: un câmp adăugat, eliminat sau cu alt tip în API fără actualizarea tipurilor pică.
 */
import { z } from "zod";
import type {
  AiSystem, AiSystemAnswers, AuthUser, BillingState, ClassificationResult, ClientDetail, ClientSummary, DashboardData,
  LegislationData, Obligation, Organization, Page, PortalAnswers, PortalData, PortalLinkStatus, SystemDetail, TeamData,
} from "@togato/shared";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** eroare de compilare dacă schema și interfața diferă */
function same<A, B>(_proof: Equals<A, B>) {}

const iso = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();
const risk = z.enum(["neclasificat", "minim", "transparenta", "risc_ridicat", "interzis", "neaplicabil"]);
const riskNoUnclassified = z.enum(["minim", "transparenta", "risc_ridicat", "interzis", "neaplicabil"]);
const riskCounts = z.record(risk, z.number().int()).transform((v) => v as Partial<Record<z.infer<typeof risk>, number>>);
const billingState = z.enum(["proba", "activ", "restant", "expirat", "suspendat"]);

export const authUser = z.object({
  id: uuid, email: z.string().email(), name: z.string(), role: z.enum(["admin", "membru"]), organizationId: uuid, totpEnabled: z.boolean(), platformAdmin: z.boolean(),
}).strict();
same<z.infer<typeof authUser>, AuthUser>(true);

export const organization = z.object({
  id: uuid, name: z.string(), plan: z.string(), status: z.enum(["trial", "activ", "suspendat"]), trialEndsAt: iso.nullable(),
  brandColor: z.string().nullable(), logoUrl: z.string().nullable(), logoSrc: z.string().nullable().optional(),
  billingState: billingState.optional() as z.ZodOptional<z.ZodType<BillingState>>, logoUploaded: z.boolean().optional(),
  aiEnabled: z.boolean(), aiEnabledAt: iso.nullable().optional(), require2fa: z.boolean(), supportAccessUntil: iso.nullable().optional(),
}).strict();
same<z.infer<typeof organization>, Organization>(true);

export const me = z.object({ user: authUser, organization: organization.nullable() }).strict();

export const clientSummary = z.object({
  id: uuid, cui: z.string().nullable(), name: z.string(), city: z.string().nullable(), county: z.string().nullable(),
  caen: z.string().nullable(), caenDescription: z.string().nullable(), employees: z.number().int().nullable(), createdAt: iso,
  archivedAt: iso.nullable(), responsibleUserId: uuid.nullable(), responsibleName: z.string().nullable(), systemsCount: z.number().int(),
  riskCounts, pendingReview: z.number().int(), obligationsTotal: z.number().int(), obligationsDone: z.number().int(),
}).strict();
same<z.infer<typeof clientSummary>, ClientSummary>(true);

export const clientPage = z.object({ data: z.array(clientSummary), total: z.number().int(), limit: z.number().int(), offset: z.number().int() }).strict();
same<z.infer<typeof clientPage>, Page<ClientSummary>>(true);

export const obligation = z.object({
  id: uuid, clientId: uuid, aiSystemId: uuid.nullable(), code: z.string(), article: z.string(), title: z.string(), description: z.string(),
  appliesFrom: day, recommended: z.boolean(), status: z.enum(["de_facut", "in_lucru", "indeplinit", "nu_se_aplica"]),
  note: z.string().nullable(), dueDate: day.nullable(), completedAt: iso.nullable(),
}).strict();
same<z.infer<typeof obligation>, Obligation>(true);

const answers = z.record(z.unknown()) as unknown as z.ZodType<AiSystemAnswers>;
const classification = z.object({ riskLevel: risk }).passthrough() as unknown as z.ZodType<ClassificationResult>;
const portalAnswers = z.record(z.unknown()) as unknown as z.ZodType<PortalAnswers>;

export const aiSystem = z.object({
  id: uuid, clientId: uuid, name: z.string(), vendor: z.string().nullable(), description: z.string().nullable(), purpose: z.string().nullable(),
  department: z.string().nullable(), answers, riskLevel: risk, classification: classification.nullable(),
  reviewStatus: z.enum(["propus", "aprobat", "respins"]), reviewNote: z.string().nullable(), reviewedAt: iso.nullable(), reviewedByName: z.string().nullable(),
  aiMemo: z.string().nullable(), aiMemoAt: iso.nullable(), aiMemoCitations: z.array(z.object({ n: z.number().int(), ref: z.string(), quote: z.string() }).strict()),
  aiMemoStatus: z.enum(["in_lucru", "gata", "esuat"]).nullable(), aiMemoError: z.string().nullable(),
  computedRiskLevel: riskNoUnclassified.nullable(), riskOverride: riskNoUnclassified.nullable(), overrideReason: z.string().nullable(),
  overrideByName: z.string().nullable(), overrideAt: iso.nullable(), rulesetVersion: z.string(), reclassNote: z.string().nullable(),
  reclassifiedAt: iso.nullable(), source: z.enum(["cabinet", "portal"]), portalAnswers: portalAnswers.nullable(),
  submittedByName: z.string().nullable(), submittedByEmail: z.string().nullable(), createdAt: iso, updatedAt: iso,
  obligationsTotal: z.number().int().optional(), obligationsDone: z.number().int().optional(),
}).strict();
same<z.infer<typeof aiSystem>, AiSystem>(true);

export const systemDetail = aiSystem.extend({
  client: z.object({ id: uuid, name: z.string(), cui: z.string().nullable() }).strict(),
  obligations: z.array(obligation),
}).strict();
same<z.infer<typeof systemDetail>, SystemDetail>(true);

export const clientDetail = z.object({
  id: uuid, cui: z.string().nullable(), name: z.string(), regCom: z.string().nullable(), address: z.string().nullable(), city: z.string().nullable(),
  county: z.string().nullable(), caen: z.string().nullable(), caenDescription: z.string().nullable(), employees: z.number().int().nullable(),
  turnover: z.number().nullable(), vatPayer: z.boolean().nullable(), contactName: z.string().nullable(), contactEmail: z.string().nullable(),
  notes: z.string().nullable(), createdAt: iso, archivedAt: iso.nullable(), responsibleUserId: uuid.nullable(), responsibleName: z.string().nullable(),
  aiSystems: z.array(aiSystem), clientObligations: z.array(obligation),
}).strict();
same<z.infer<typeof clientDetail>, ClientDetail>(true);

export const dashboard = z.object({
  clients: z.number().int(), systems: z.number().int(), riskCounts, pendingReview: z.number().int(),
  lawUpdate: z.object({ systems: z.number().int(), clients: z.number().int(), version: z.string(), date: day, title: z.string() }).strict(),
  obligationsOpen: z.number().int(), obligationsDone: z.number().int(),
  attention: z.array(z.object({ clientId: uuid, clientName: z.string(), systemId: uuid, systemName: z.string(), reason: z.string(), riskLevel: risk }).strict()),
  upcoming: z.array(z.object({ date: day, label: z.string(), obligationsOpen: z.number().int() }).strict()),
}).strict();
same<z.infer<typeof dashboard>, DashboardData>(true);

export const team = z.object({
  members: z.array(z.object({
    id: uuid, name: z.string(), email: z.string().email(), role: z.enum(["admin", "membru"]), status: z.enum(["activ", "dezactivat"]),
    totpEnabled: z.boolean(), lastActiveAt: iso.nullable(), createdAt: iso, clientsCount: z.number().int(),
  }).strict()),
  invitations: z.array(z.object({ id: uuid, email: z.string().email(), name: z.string().nullable(), role: z.enum(["admin", "membru"]), expiresAt: iso, createdAt: iso }).strict()),
}).strict();
same<z.infer<typeof team>, TeamData>(true);

export const portal = z.object({
  cabinet: z.object({ name: z.string(), brandColor: z.string().nullable(), logoUrl: z.string().nullable() }).strict(),
  client: z.object({ name: z.string() }).strict(),
  expiresAt: iso,
  systems: z.array(z.object({
    id: uuid, name: z.string(), vendor: z.string().nullable(), department: z.string().nullable(), purpose: z.string().nullable(),
    addedBy: z.enum(["client", "cabinet"]), status: z.enum(["in_analiza", "analizat"]), canDelete: z.boolean(), createdAt: iso,
  }).strict()),
}).strict();
same<z.infer<typeof portal>, PortalData>(true);

export const portalLink = z.object({ active: z.boolean(), expired: z.boolean(), createdAt: iso.nullable(), expiresAt: iso.nullable(), lastUsedAt: iso.nullable() }).strict();
same<z.infer<typeof portalLink>, PortalLinkStatus>(true);

export const legislation = z.object({
  current: z.string(),
  changelog: z.array(z.object({ version: z.string(), date: day, title: z.string(), summary: z.string(), source: z.string(), articles: z.array(z.string()) }).strict()),
  affected: z.array(z.object({ id: uuid, name: z.string(), clientId: uuid, clientName: z.string(), note: z.string(), reclassifiedAt: iso.nullable(), riskLevel: risk }).strict()),
}).strict();
same<z.infer<typeof legislation>, LegislationData>(true);
