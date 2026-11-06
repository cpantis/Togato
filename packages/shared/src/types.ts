import type { AiSystemAnswers, ClassificationResult, ObligationStatus, ReviewStatus, RiskLevel } from "./aiAct";
import type { PortalAnswers } from "./portal";

export type UserRole = "admin" | "membru";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
  totpEnabled: boolean;
  /** membru al echipei Togato (PLATFORM_ADMIN_EMAILS) — vede consola platformei */
  platformAdmin: boolean;
  /** adresa de email a fost confirmată */
  emailVerified: boolean;
  /** administrator fără 2FA, într-un mediu unde e obligatoriu: trebuie activat înainte de orice */
  twoFactorRequired: boolean;
}

export interface Organization {
  id: string;
  name: string;
  plan: string;
  status: "trial" | "activ" | "suspendat";
  trialEndsAt: string | null;
  brandColor: string | null;
  logoUrl: string | null;
  /** logo-ul afișat (încărcat sau extern) */
  logoSrc?: string | null;
  /** starea abonamentului (vezi plans.ts) */
  billingState?: import("./plans").BillingState;
  logoUploaded?: boolean;
  aiEnabled: boolean;
  aiEnabledAt?: string | null;
  require2fa: boolean;
  /** acces de suport acordat echipei Togato, până la această dată */
  supportAccessUntil?: string | null;
  /** profilul din directorul cabinetelor */
  directory?: DirectoryProfile;
  /** versiunea documentelor juridice acceptată și dacă e cea curentă */
  legalVersion?: string | null;
  legalCurrent?: boolean;
}

export interface DirectoryProfile {
  listed: boolean;
  county: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  email: string | null;
}

/** un cabinet din directorul public */
export interface DirectoryCabinet {
  id: string;
  name: string;
  county: string | null;
  city: string | null;
  description: string | null;
  website: string | null;
  logoSrc: string | null;
  brandColor: string | null;
}

/** autoevaluarea unei firme, văzută de firmă (prin linkul secret) */
export interface SelfAssessmentData {
  companyName: string;
  cui: string | null;
  county: string | null;
  contactName: string;
  contactEmail: string;
  /** adresa a fost confirmată (necesar pentru trimiterea către un cabinet) */
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  report: import("./selfAssessment").SelfReport;
  requests: { id: string; organizationId: string; cabinetName: string; status: "nou" | "acceptat" | "respins"; createdAt: string; respondedAt: string | null; responseMessage: string | null; cabinetEmail: string | null }[];
  maxRequests: number;
}

/** o solicitare primită de cabinet */
export interface Referral {
  id: string;
  status: "nou" | "acceptat" | "respins";
  createdAt: string;
  respondedAt: string | null;
  message: string | null;
  responseMessage: string | null;
  clientId: string | null;
  conflictCheckedAt: string | null;
  company: { name: string; cui: string | null; county: string | null };
  contact: { name: string; email: string };
  needsLawyer: boolean;
  tools: import("./selfAssessment").SelfToolWithResult[];
}

export interface ClientSummary {
  id: string;
  cui: string | null;
  name: string;
  city: string | null;
  county: string | null;
  caen: string | null;
  caenDescription: string | null;
  employees: number | null;
  createdAt: string;
  archivedAt: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  systemsCount: number;
  riskCounts: Partial<Record<RiskLevel | "neclasificat", number>>;
  pendingReview: number;
  obligationsTotal: number;
  obligationsDone: number;
}

/** răspuns paginat: `data` + numărul total de rezultate pentru filtrul curent */
export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Obligation {
  id: string;
  clientId: string;
  aiSystemId: string | null;
  code: string;
  article: string;
  title: string;
  description: string;
  appliesFrom: string;
  recommended: boolean;
  status: ObligationStatus;
  note: string | null;
  dueDate: string | null;
  completedAt: string | null;
}

export interface AiSystem {
  id: string;
  clientId: string;
  name: string;
  vendor: string | null;
  description: string | null;
  purpose: string | null;
  department: string | null;
  answers: AiSystemAnswers;
  riskLevel: RiskLevel | "neclasificat";
  classification: ClassificationResult | null;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  aiMemo: string | null;
  aiMemoAt: string | null;
  aiMemoCitations: { n: number; ref: string; quote: string }[];
  /** generarea asincronă: in_lucru → gata / esuat; null = niciodată cerut */
  aiMemoStatus: "in_lucru" | "gata" | "esuat" | null;
  aiMemoError: string | null;
  computedRiskLevel: RiskLevel | null;
  riskOverride: RiskLevel | null;
  overrideReason: string | null;
  overrideByName: string | null;
  overrideAt: string | null;
  rulesetVersion: string;
  reclassNote: string | null;
  reclassifiedAt: string | null;
  source: "cabinet" | "portal" | "autoevaluare";
  portalAnswers: PortalAnswers | null;
  submittedByName: string | null;
  submittedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  obligationsTotal?: number;
  obligationsDone?: number;
}

/** detaliul unui sistem (GET /api/ai-systems/:id): sistemul + clientul + obligațiile lui */
export interface SystemDetail extends AiSystem {
  client: { id: string; name: string; cui: string | null; aiExcluded: boolean };
  obligations: Obligation[];
}

export interface ClientDetail {
  id: string;
  cui: string | null;
  name: string;
  regCom: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  caen: string | null;
  caenDescription: string | null;
  employees: number | null;
  turnover: number | null;
  vatPayer: boolean | null;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdAt: string;
  archivedAt: string | null;
  aiExcluded: boolean;
  responsibleUserId: string | null;
  responsibleName: string | null;
  aiSystems: AiSystem[];
  clientObligations: Obligation[];
}

export interface CompanyLookup {
  cui: string;
  name: string;
  regCom: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  caen: string | null;
  caenDescription: string | null;
  employees: number | null;
  turnover: number | null;
  vatPayer: boolean | null;
  active: boolean | null;
  source: "anaf" | "listafirme";
}

export interface DashboardData {
  clients: number;
  systems: number;
  riskCounts: Partial<Record<RiskLevel | "neclasificat", number>>;
  pendingReview: number;
  lawUpdate: { systems: number; clients: number; version: string; date: string; title: string };
  obligationsOpen: number;
  obligationsDone: number;
  attention: { clientId: string; clientName: string; systemId: string; systemName: string; reason: string; riskLevel: RiskLevel | "neclasificat" }[];
  upcoming: { date: string; label: string; obligationsOpen: number }[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "activ" | "dezactivat";
  totpEnabled: boolean;
  lastActiveAt: string | null;
  createdAt: string;
  clientsCount: number;
}

export interface PendingInvitation {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
}

export interface TeamData {
  members: TeamMember[];
  invitations: PendingInvitation[];
}

export interface PortalSystem {
  id: string;
  name: string;
  vendor: string | null;
  department: string | null;
  purpose: string | null;
  addedBy: "client" | "cabinet";
  status: "in_analiza" | "analizat";
  canDelete: boolean;
  createdAt: string;
}

export interface PortalData {
  cabinet: { name: string; brandColor: string | null; logoUrl: string | null };
  client: { name: string };
  expiresAt: string;
  systems: PortalSystem[];
}

export interface PortalLinkStatus {
  active: boolean;
  expired: boolean;
  createdAt: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

export interface LegislationData {
  current: string;
  changelog: import("./legislation").RulesetChange[];
  affected: { id: string; name: string; clientId: string; clientName: string; note: string; reclassifiedAt: string | null; riskLevel: RiskLevel | "neclasificat" }[];
}

// ─── GDPR ────────────────────────────────────────────────

export interface ProcessingActivity {
  id: string;
  clientId: string;
  name: string;
  purpose: string;
  role: import("./gdpr").ProcessingRole;
  controllerName: string | null;
  legalBases: string[];
  legalBasisDetails: string | null;
  specialConditions: string[];
  dataCategories: string[];
  subjectCategories: string[];
  recipients: string | null;
  transferOutsideEea: boolean;
  transferCountries: string | null;
  transferMechanism: string | null;
  retention: string | null;
  securityMeasures: string[];
  securityDetails: string | null;
  largeScale: boolean;
  systematicMonitoring: boolean;
  automatedDecisions: boolean;
  dpiaListItems: string[];
  aiSystemIds: string[];
  notes: string | null;
  updatedAt: string;
  check: import("./gdpr").ProcessingCheck;
  /** evaluarea de impact salvată pentru activitate (null = niciuna) */
  dpia: { id: string; finalizedAt: string | null; outcome: import("./gdpr").DpiaOutcome; reviewOn: string | null } | null;
}

export interface DpiaData {
  id: string | null;
  description: string | null;
  necessity: string | null;
  risks: import("./gdpr").DpiaRisk[];
  dpoOpinion: string | null;
  subjectsViews: string | null;
  reviewOn: string | null;
  finalizedAt: string | null;
  updatedAt: string | null;
  assessment: import("./gdpr").DpiaAssessment;
}

/** GET/PUT /api/processing/:id/dpia */
export interface DpiaResponse {
  activity: ProcessingActivity;
  dpia: DpiaData;
  /** false = proiect precompletat, încă nesalvat */
  saved: boolean;
}

export interface DsarRequest {
  id: string;
  clientId: string;
  type: import("./gdpr").DsarType;
  requesterName: string;
  requesterContact: string | null;
  receivedOn: string;
  dueOn: string;
  extended: boolean;
  extensionReason: string | null;
  identityVerified: boolean;
  status: import("./gdpr").DsarStatus;
  details: string | null;
  outcome: string | null;
  closedOn: string | null;
  overdue: boolean;
  createdAt: string;
}

export interface Breach {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  breachTypes: string[];
  discoveredAt: string;
  occurredAt: string | null;
  dataCategories: string[];
  subjectsAffected: number | null;
  recordsAffected: number | null;
  risk: import("./gdpr").BreachRisk;
  riskReasoning: string | null;
  consequences: string | null;
  measures: string | null;
  authorityNotifiedAt: string | null;
  authorityReference: string | null;
  delayReason: string | null;
  subjectsNotifiedAt: string | null;
  closedAt: string | null;
  deadline: string;
  duties: import("./gdpr").BreachDuties;
  authorityOverdue: boolean;
  createdAt: string;
}

export interface ClientGdpr {
  processing: ProcessingActivity[];
  dsars: DsarRequest[];
  breaches: Breach[];
}

export interface GdprOverview {
  dsars: (DsarRequest & { clientName: string })[];
  breaches: (Breach & { clientName: string })[];
}
