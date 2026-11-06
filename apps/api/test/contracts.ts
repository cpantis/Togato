/**
 * Contractul API ↔ web: scheme zod stricte pentru răspunsurile principale, legate la compilare de
 * interfețele din @togato/shared (tipurile trebuie să fie identice). Testul de integrare validează
 * răspunsurile reale: un câmp adăugat, eliminat sau cu alt tip în API fără actualizarea tipurilor pică.
 */
import { z } from "zod";
import type {
  AiSystem, AiSystemAnswers, AuthUser, BillingState, ClassificationResult, ClientDetail, ClientSummary, DashboardData,
  Breach, ClientGdpr, DirectoryCabinet, DpiaResponse, DsarRequest, LegislationData, ProcessingActivity, Obligation, Referral, SelfAssessmentData, Organization, Page, PortalAnswers, PortalData, PortalLinkStatus, SystemDetail, TeamData,
} from "@togato/shared";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** eroare de compilare dacă schema și interfața diferă */
function same<A, B>(_proof: Equals<A, B>) {}

const iso = z.string().datetime({ offset: true });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuid = z.string().uuid();
const risk = z.enum(["neclasificat", "minim", "transparenta", "risc_ridicat", "interzis", "neaplicabil"]);
const riskNoUnclassified = z.enum(["minim", "transparenta", "risc_ridicat", "interzis", "neaplicabil"]);
const riskCounts = z.partialRecord(risk, z.number().int());
const billingState = z.enum(["proba", "activ", "restant", "expirat", "suspendat"]);

export const authUser = z.object({
  id: uuid, email: z.string().email(), name: z.string(), role: z.enum(["admin", "membru"]), organizationId: uuid, totpEnabled: z.boolean(), platformAdmin: z.boolean(), emailVerified: z.boolean(),
}).strict();
same<z.infer<typeof authUser>, AuthUser>(true);

export const organization = z.object({
  id: uuid, name: z.string(), plan: z.string(), status: z.enum(["trial", "activ", "suspendat"]), trialEndsAt: iso.nullable(),
  brandColor: z.string().nullable(), logoUrl: z.string().nullable(), logoSrc: z.string().nullable().optional(),
  billingState: billingState.optional() as z.ZodOptional<z.ZodType<BillingState>>, logoUploaded: z.boolean().optional(),
  aiEnabled: z.boolean(), aiEnabledAt: iso.nullable().optional(), require2fa: z.boolean(), supportAccessUntil: iso.nullable().optional(),
  legalVersion: z.string().nullable().optional(), legalCurrent: z.boolean().optional(),
  directory: z.object({ listed: z.boolean(), county: z.string().nullable(), city: z.string().nullable(), description: z.string().nullable(), website: z.string().nullable(), email: z.string().nullable() }).strict().optional(),
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

const answers = z.record(z.string(), z.unknown()) as unknown as z.ZodType<AiSystemAnswers>;
const classification = z.object({ riskLevel: risk }).passthrough() as unknown as z.ZodType<ClassificationResult>;
const portalAnswers = z.record(z.string(), z.unknown()) as unknown as z.ZodType<PortalAnswers>;

export const aiSystem = z.object({
  id: uuid, clientId: uuid, name: z.string(), vendor: z.string().nullable(), description: z.string().nullable(), purpose: z.string().nullable(),
  department: z.string().nullable(), answers, riskLevel: risk, classification: classification.nullable(),
  reviewStatus: z.enum(["propus", "aprobat", "respins"]), reviewNote: z.string().nullable(), reviewedAt: iso.nullable(), reviewedByName: z.string().nullable(),
  aiMemo: z.string().nullable(), aiMemoAt: iso.nullable(), aiMemoCitations: z.array(z.object({ n: z.number().int(), ref: z.string(), quote: z.string() }).strict()),
  aiMemoStatus: z.enum(["in_lucru", "gata", "esuat"]).nullable(), aiMemoError: z.string().nullable(),
  computedRiskLevel: riskNoUnclassified.nullable(), riskOverride: riskNoUnclassified.nullable(), overrideReason: z.string().nullable(),
  overrideByName: z.string().nullable(), overrideAt: iso.nullable(), rulesetVersion: z.string(), reclassNote: z.string().nullable(),
  reclassifiedAt: iso.nullable(), source: z.enum(["cabinet", "portal", "autoevaluare"]), portalAnswers: portalAnswers.nullable(),
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

const obligationTpl = z.object({ code: z.string(), article: z.string(), title: z.string(), description: z.string(), appliesFrom: day }).strict();
const verdict = z.enum(["minim", "transparenta", "risc_ridicat", "de_verificat"]);
const selfTool = z.object({ id: uuid, name: z.string(), vendor: z.string().nullable(), purpose: z.string().nullable(), answers: portalAnswers }).strict();
const toolResult = z.object({ verdict, summary: z.string(), lawyerReason: z.string().nullable(), obligations: z.array(obligationTpl) }).strict();
const referralStatus = z.enum(["nou", "acceptat", "respins"]);

export const selfAssessment = z.object({
  companyName: z.string(), cui: z.string().nullable(), county: z.string().nullable(), contactName: z.string(), contactEmail: z.string().email(), emailVerified: z.boolean(),
  createdAt: iso, updatedAt: iso,
  report: z.object({
    tools: z.array(selfTool.extend({ result: toolResult }).strict()),
    general: z.array(obligationTpl), needsLawyer: z.boolean(),
    counts: z.object({ minim: z.number().int(), transparenta: z.number().int(), risc_ridicat: z.number().int(), de_verificat: z.number().int() }).strict(),
  }).strict(),
  requests: z.array(z.object({ id: uuid, organizationId: uuid, cabinetName: z.string(), status: referralStatus, createdAt: iso, respondedAt: iso.nullable(), responseMessage: z.string().nullable(), cabinetEmail: z.string().nullable() }).strict()),
  maxRequests: z.number().int(),
}).strict();
same<z.infer<typeof selfAssessment>, SelfAssessmentData>(true);

export const directoryCabinet = z.object({ id: uuid, name: z.string(), county: z.string().nullable(), city: z.string().nullable(), description: z.string().nullable(), website: z.string().nullable(), logoSrc: z.string().nullable(), brandColor: z.string().nullable() }).strict();
same<z.infer<typeof directoryCabinet>, DirectoryCabinet>(true);
export const directoryPage = z.object({ data: z.array(directoryCabinet), total: z.number().int(), limit: z.number().int(), offset: z.number().int() }).strict();

export const referral = z.object({
  id: uuid, status: referralStatus, createdAt: iso, respondedAt: iso.nullable(), message: z.string().nullable(), responseMessage: z.string().nullable(), clientId: uuid.nullable(),
  company: z.object({ name: z.string(), cui: z.string().nullable(), county: z.string().nullable() }).strict(),
  contact: z.object({ name: z.string(), email: z.string() }).strict(),
  needsLawyer: z.boolean(),
  tools: z.array(selfTool.extend({ result: toolResult }).strict()),
}).strict();
same<z.infer<typeof referral>, Referral>(true);

export const processingActivity = z.object({
  id: uuid, clientId: uuid, name: z.string(), purpose: z.string(), role: z.enum(["operator", "operator_asociat", "persoana_imputernicita"]),
  controllerName: z.string().nullable(), legalBases: z.array(z.string()), legalBasisDetails: z.string().nullable(), specialConditions: z.array(z.string()),
  dataCategories: z.array(z.string()), subjectCategories: z.array(z.string()), recipients: z.string().nullable(),
  transferOutsideEea: z.boolean(), transferCountries: z.string().nullable(), transferMechanism: z.string().nullable(), retention: z.string().nullable(),
  securityMeasures: z.array(z.string()), securityDetails: z.string().nullable(), largeScale: z.boolean(), systematicMonitoring: z.boolean(),
  automatedDecisions: z.boolean(), dpiaListItems: z.array(z.string()), aiSystemIds: z.array(uuid), notes: z.string().nullable(), updatedAt: iso,
  check: z.object({ issues: z.array(z.string()), warnings: z.array(z.string()), dpiaLikely: z.boolean(), dpiaReasons: z.array(z.string()), dpiaMandatory: z.boolean(), dpiaMandatoryReasons: z.array(z.string()) }).strict(),
  dpia: z.object({ id: uuid, finalizedAt: iso.nullable(), outcome: z.enum(["acceptabil", "acceptabil_cu_masuri", "consultare_prealabila"]), reviewOn: day.nullable() }).strict().nullable(),
}).strict();
same<z.infer<typeof processingActivity>, ProcessingActivity>(true);

export const dsarRequest = z.object({
  id: uuid, clientId: uuid, type: z.enum(["acces", "rectificare", "stergere", "restrictionare", "portabilitate", "opozitie", "decizii_automate"]),
  requesterName: z.string(), requesterContact: z.string().nullable(), receivedOn: day, dueOn: day, extended: z.boolean(), extensionReason: z.string().nullable(),
  identityVerified: z.boolean(), status: z.enum(["primita", "in_lucru", "finalizata", "respinsa"]), details: z.string().nullable(), outcome: z.string().nullable(),
  closedOn: day.nullable(), overdue: z.boolean(), createdAt: iso,
}).strict();
same<z.infer<typeof dsarRequest>, DsarRequest>(true);

export const breach = z.object({
  id: uuid, clientId: uuid, title: z.string(), description: z.string().nullable(), breachTypes: z.array(z.string()), discoveredAt: iso, occurredAt: iso.nullable(),
  dataCategories: z.array(z.string()), subjectsAffected: z.number().int().nullable(), recordsAffected: z.number().int().nullable(),
  risk: z.enum(["neevaluat", "fara_risc", "risc", "risc_ridicat"]), riskReasoning: z.string().nullable(), consequences: z.string().nullable(), measures: z.string().nullable(),
  authorityNotifiedAt: iso.nullable(), authorityReference: z.string().nullable(), delayReason: z.string().nullable(), subjectsNotifiedAt: iso.nullable(), closedAt: iso.nullable(),
  deadline: iso, duties: z.object({ notifyAuthority: z.boolean(), notifySubjects: z.boolean(), summary: z.string() }).strict(), authorityOverdue: z.boolean(), createdAt: iso,
}).strict();
same<z.infer<typeof breach>, Breach>(true);

export const clientGdpr = z.object({ processing: z.array(processingActivity), dsars: z.array(dsarRequest), breaches: z.array(breach) }).strict();
same<z.infer<typeof clientGdpr>, ClientGdpr>(true);

const dpiaLevel = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const riskLvl = z.enum(["scazut", "mediu", "ridicat"]);
export const dpiaResponse = z.object({
  activity: processingActivity,
  dpia: z.object({
    id: uuid.nullable(), description: z.string().nullable(), necessity: z.string().nullable(),
    risks: z.array(z.object({ id: uuid, title: z.string(), description: z.string(), likelihood: dpiaLevel, severity: dpiaLevel, measures: z.string(), residualLikelihood: dpiaLevel, residualSeverity: dpiaLevel }).strict()),
    dpoOpinion: z.string().nullable(), subjectsViews: z.string().nullable(), reviewOn: day.nullable(), finalizedAt: iso.nullable(), updatedAt: iso.nullable(),
    assessment: z.object({ outcome: z.enum(["acceptabil", "acceptabil_cu_masuri", "consultare_prealabila"]), missing: z.array(z.string()), residual: z.array(z.object({ id: z.string(), inherent: riskLvl, residual: riskLvl }).strict()) }).strict(),
  }).strict(),
  saved: z.boolean(),
}).strict();
same<z.infer<typeof dpiaResponse>, DpiaResponse>(true);
