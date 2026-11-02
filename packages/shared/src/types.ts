import type { AiSystemAnswers, ClassificationResult, ObligationStatus, ReviewStatus, RiskLevel } from "./aiAct";
import type { PortalAnswers } from "./portal";

export type UserRole = "admin" | "membru";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string;
}

export interface Organization {
  id: string;
  name: string;
  plan: string;
  status: "trial" | "activ" | "suspendat";
  trialEndsAt: string | null;
  brandColor: string | null;
  logoUrl: string | null;
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
  responsibleUserId: string | null;
  responsibleName: string | null;
  systemsCount: number;
  riskCounts: Partial<Record<RiskLevel | "neclasificat", number>>;
  pendingReview: number;
  obligationsTotal: number;
  obligationsDone: number;
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
  computedRiskLevel: RiskLevel | null;
  riskOverride: RiskLevel | null;
  overrideReason: string | null;
  overrideByName: string | null;
  overrideAt: string | null;
  rulesetVersion: string;
  reclassNote: string | null;
  reclassifiedAt: string | null;
  source: "cabinet" | "portal";
  portalAnswers: PortalAnswers | null;
  submittedByName: string | null;
  submittedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  obligationsTotal?: number;
  obligationsDone?: number;
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
