import type { AiSystemAnswers, ClassificationResult, ObligationStatus, ReviewStatus, RiskLevel } from "./aiAct";

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
  obligationsOpen: number;
  obligationsDone: number;
  attention: { clientId: string; clientName: string; systemId: string; systemName: string; reason: string; riskLevel: RiskLevel | "neclasificat" }[];
  upcoming: { date: string; label: string; obligationsOpen: number }[];
}
