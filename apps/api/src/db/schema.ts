import { pgTable, pgEnum, uuid, text, timestamp, integer, boolean, jsonb, date, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AiSystemAnswers, ClassificationResult } from "@togato/shared";

export const orgStatusEnum = pgEnum("org_status", ["trial", "activ", "suspendat"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "membru"]);
export const userStatusEnum = pgEnum("user_status", ["activ", "dezactivat"]);
export const riskLevelEnum = pgEnum("risk_level", ["neclasificat", "minim", "transparenta", "risc_ridicat", "interzis", "neaplicabil"]);
export const reviewStatusEnum = pgEnum("review_status", ["propus", "aprobat", "respins"]);
export const systemSourceEnum = pgEnum("system_source", ["cabinet", "portal", "autoevaluare"]);
export const processingRoleEnum = pgEnum("processing_role", ["operator", "operator_asociat", "persoana_imputernicita"]);
export const dsarTypeEnum = pgEnum("dsar_type", ["acces", "rectificare", "stergere", "restrictionare", "portabilitate", "opozitie", "decizii_automate"]);
export const dsarStatusEnum = pgEnum("dsar_status", ["primita", "in_lucru", "finalizata", "respinsa"]);
export const breachRiskEnum = pgEnum("breach_risk", ["neevaluat", "fara_risc", "risc", "risc_ridicat"]);
export const referralStatusEnum = pgEnum("referral_status", ["nou", "acceptat", "respins"]);
export const obligationStatusEnum = pgEnum("obligation_status", ["de_facut", "in_lucru", "indeplinit", "nu_se_aplica"]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed"]);
export const memoStatusEnum = pgEnum("memo_status", ["in_lucru", "gata", "esuat"]);

/** Cabinetul de avocatură / consultanță — chiriașul (tenant) aplicației */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("start"),
  status: orgStatusEnum("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** white-label (portalul clientului) */
  brandColor: text("brand_color"),
  logoUrl: text("logo_url"),
  /** logo încărcat (în stocare); are prioritate față de logoUrl */
  logoKey: text("logo_key"),
  logoContentType: text("logo_content_type"),
  /** analiza AI trimite date ale clienților către Anthropic — dezactivată până o activează un administrator */
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  aiEnabledBy: uuid("ai_enabled_by"),
  aiEnabledAt: timestamp("ai_enabled_at", { withTimezone: true }),
  /** autentificarea în doi pași e obligatorie pentru toți membrii */
  require2fa: boolean("require_2fa").notNull().default(false),
  /** abonamentul Stripe (actualizat doar din webhook-uri verificate) */
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  /** acces de suport acordat de un administrator al cabinetului (doar citire, până la această dată) */
  supportAccessUntil: timestamp("support_access_until", { withTimezone: true }),
  supportAccessGrantedBy: uuid("support_access_granted_by"),
  suspendedReason: text("suspended_reason"),
  /** versiunea documentelor juridice (termeni, confidențialitate, DPA) acceptată de cabinet */
  legalVersion: text("legal_version"),
  legalAcceptedAt: timestamp("legal_accepted_at", { withTimezone: true }),
  legalAcceptedBy: uuid("legal_accepted_by"),
  /** închiderea contului: cerută de un administrator, ștergerea definitivă la `closureScheduledFor` */
  closureRequestedAt: timestamp("closure_requested_at", { withTimezone: true }),
  closureRequestedBy: uuid("closure_requested_by"),
  closureScheduledFor: timestamp("closure_scheduled_for", { withTimezone: true }),
  /** clienții arhivați se șterg după acest număr de ani de la arhivare (null = păstrați nelimitat) */
  archivedRetentionYears: integer("archived_retention_years"),
  /** profilul public din directorul cabinetelor (vizibil firmelor care fac autoevaluarea) */
  directoryListed: boolean("directory_listed").notNull().default(false),
  directoryCounty: text("directory_county"),
  directoryCity: text("directory_city"),
  directoryDescription: text("directory_description"),
  directoryWebsite: text("directory_website"),
  directoryEmail: text("directory_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("membru"),
  status: userStatusEnum("status").notNull().default("activ"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  /** TOTP (RFC 6238): secretul e criptat (AES-256-GCM); codurile de recuperare sunt păstrate ca hash */
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpSecret: text("totp_secret"),
  totpPendingSecret: text("totp_pending_secret"),
  totpLastStep: integer("totp_last_step"),
  recoveryCodes: jsonb("recovery_codes").$type<string[]>(),
  totpEnabledAt: timestamp("totp_enabled_at", { withTimezone: true }),
  /** rezumatul zilnic pe email cu termenele apropiate ale clienților de care răspunde */
  notifyDeadlines: boolean("notify_deadlines").notNull().default(true),
  /** notificare pe email când un client trimite un instrument prin portal */
  notifyPortal: boolean("notify_portal").notNull().default(true),
  /** protecție la ghicirea parolei: încercări eșuate consecutive și blocarea temporară */
  /** adresa confirmată prin linkul trimis pe email (invitațiile o confirmă implicit) */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  emailVerifyTokenHash: text("email_verify_token_hash"),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_email_unique").on(t.email),
  index("users_org_idx").on(t.organizationId),
]);

/** Invitație pentru un coleg — tokenul se păstrează doar ca hash SHA-256 */
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  role: userRoleEnum("role").notNull().default("membru"),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("invitations_token_unique").on(t.tokenHash),
  index("invitations_org_idx").on(t.organizationId),
]);

/** Linkul de portal al unui client — tokenul se păstrează doar ca hash; un singur link activ per client */
export const portalLinks = pgTable("portal_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("portal_links_token_unique").on(t.tokenHash),
  uniqueIndex("portal_links_client_unique").on(t.clientId),
  index("portal_links_org_idx").on(t.organizationId),
]);

/** Firma-client a cabinetului */
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  cui: text("cui"),
  name: text("name").notNull(),
  regCom: text("reg_com"),
  address: text("address"),
  city: text("city"),
  county: text("county"),
  caen: text("caen"),
  caenDescription: text("caen_description"),
  employees: integer("employees"),
  turnover: bigint("turnover", { mode: "number" }),
  vatPayer: boolean("vat_payer"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  sourceData: jsonb("source_data"),
  /** avocatul / consultantul responsabil de client */
  responsibleUserId: uuid("responsible_user_id").references(() => users.id, { onDelete: "set null" }),
  /** clientul e exclus de la analiza AI, chiar dacă cabinetul a activat-o (ex. acord cu clientul) */
  aiExcluded: boolean("ai_excluded").notNull().default(false),
  /** administratorii au fost anunțați că dosarul arhivat urmează să fie șters (politica de păstrare) */
  retentionWarnedAt: timestamp("retention_warned_at", { withTimezone: true }),
  /** clientul arhivat nu mai apare în liste și termene; doar un client arhivat poate fi șters */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("clients_org_idx").on(t.organizationId),
  // lista paginată, ordonată după nume
  index("clients_org_name_idx").on(t.organizationId, t.name),
  index("clients_responsible_idx").on(t.responsibleUserId),
  uniqueIndex("clients_org_cui_unique").on(t.organizationId, t.cui),
]);

/** Un sistem / instrument AI folosit sau dezvoltat de client (inventar AI Act) */
export const aiSystems = pgTable("ai_systems", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  vendor: text("vendor"),
  description: text("description"),
  purpose: text("purpose"),
  department: text("department"),
  answers: jsonb("answers").$type<AiSystemAnswers>().notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull().default("neclasificat"),
  classification: jsonb("classification").$type<ClassificationResult>(),
  reviewStatus: reviewStatusEnum("review_status").notNull().default("propus"),
  reviewNote: text("review_note"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  aiMemo: text("ai_memo"),
  aiMemoAt: timestamp("ai_memo_at", { withTimezone: true }),
  /** sursele memoriului AI: [{ n, ref: "Art. 26(7)", quote }] */
  aiMemoCitations: jsonb("ai_memo_citations").$type<{ n: number; ref: string; quote: string }[]>(),
  /** starea generării asincrone a memoriului (null = niciodată cerut) */
  aiMemoStatus: memoStatusEnum("ai_memo_status"),
  aiMemoError: text("ai_memo_error"),
  aiMemoRequestedAt: timestamp("ai_memo_requested_at", { withTimezone: true }),
  /** versiunea regulilor AI Act după care a fost calculată încadrarea (vezi RULESET_CHANGELOG) */
  rulesetVersion: text("ruleset_version").notNull().default("2026.1"),
  /** nota de reîncadrare după o modificare legislativă de fond; se șterge la verificarea avocatului */
  reclassNote: text("reclass_note"),
  reclassifiedAt: timestamp("reclassified_at", { withTimezone: true }),
  /** încadrarea stabilită manual de avocat — are prioritate față de cea calculată */
  riskOverride: riskLevelEnum("risk_override"),
  overrideReason: text("override_reason"),
  overrideBy: uuid("override_by").references(() => users.id, { onDelete: "set null" }),
  overrideAt: timestamp("override_at", { withTimezone: true }),
  /** cine a adăugat sistemul: cabinetul sau clientul, prin portal */
  source: systemSourceEnum("source").notNull().default("cabinet"),
  /** răspunsurile clientului din portal, păstrate neprelucrate pentru avocat */
  portalAnswers: jsonb("portal_answers"),
  submittedByName: text("submitted_by_name"),
  submittedByEmail: text("submitted_by_email"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_systems_org_idx").on(t.organizationId),
  index("ai_systems_client_idx").on(t.clientId),
  index("ai_systems_ruleset_idx").on(t.rulesetVersion),
]);

/** Obligație concretă de îndeplinit — la nivel de client (aiSystemId null) sau de sistem */
export const obligations = pgTable("obligations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  aiSystemId: uuid("ai_system_id").references(() => aiSystems.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  article: text("article").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  appliesFrom: date("applies_from").notNull(),
  recommended: boolean("recommended").notNull().default(false),
  status: obligationStatusEnum("status").notNull().default("de_facut"),
  note: text("note"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("obligations_org_idx").on(t.organizationId),
  index("obligations_client_idx").on(t.clientId),
  index("obligations_system_idx").on(t.aiSystemId),
  // rezumatul zilnic al termenelor
  index("obligations_due_idx").on(t.dueDate).where(sql`${t.dueDate} is not null`),
]);

/**
 * Instantaneu imuabil al unei analize aprobate („aviz înghețat”): ce s-a analizat, după ce versiune
 * a regulilor și a textului legii, cine a aprobat și când. Nu se modifică și nu se șterge decât odată cu clientul.
 */
export const analysisSnapshots = pgTable("analysis_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  /** sistemul poate fi șters ulterior; instantaneul rămâne în dosarul clientului */
  aiSystemId: uuid("ai_system_id").references(() => aiSystems.id, { onDelete: "set null" }),
  version: integer("version").notNull(),
  reason: text("reason").notNull(),
  rulesetVersion: text("ruleset_version").notNull(),
  lawTextVersion: text("law_text_version").notNull(),
  data: jsonb("data").notNull(),
  sha256: text("sha256").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("snapshots_org_idx").on(t.organizationId),
  index("snapshots_system_idx").on(t.aiSystemId),
  index("snapshots_client_idx").on(t.clientId),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_org_created_idx").on(t.organizationId, t.createdAt),
]);

// ─── GDPR ────────────────────────────────────────────────

/** O activitate din registrul prelucrărilor clientului (Art. 30 GDPR). */
export const processingActivities = pgTable("processing_activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  role: processingRoleEnum("role").notNull().default("operator"),
  /** pentru persoana împuternicită / operatorul asociat: în numele cui */
  controllerName: text("controller_name"),
  legalBases: jsonb("legal_bases").$type<string[]>().notNull().default([]),
  legalBasisDetails: text("legal_basis_details"),
  specialConditions: jsonb("special_conditions").$type<string[]>().notNull().default([]),
  dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
  subjectCategories: jsonb("subject_categories").$type<string[]>().notNull().default([]),
  recipients: text("recipients"),
  transferOutsideEea: boolean("transfer_outside_eea").notNull().default(false),
  transferCountries: text("transfer_countries"),
  transferMechanism: text("transfer_mechanism"),
  retention: text("retention"),
  securityMeasures: jsonb("security_measures").$type<string[]>().notNull().default([]),
  securityDetails: text("security_details"),
  largeScale: boolean("large_scale").notNull().default(false),
  systematicMonitoring: boolean("systematic_monitoring").notNull().default(false),
  automatedDecisions: boolean("automated_decisions").notNull().default(false),
  /** operațiuni din lista ANSPDCP (Decizia 174/2018) bifate explicit */
  dpiaListItems: jsonb("dpia_list_items").$type<string[]>().notNull().default([]),
  /** sistemele AI din inventarul clientului folosite în această prelucrare */
  aiSystemIds: jsonb("ai_system_ids").$type<string[]>().notNull().default([]),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("processing_org_idx").on(t.organizationId),
  index("processing_client_idx").on(t.clientId),
]);

/** Evaluarea impactului asupra protecției datelor (Art. 35) pentru o activitate din registru. */
export const dpias = pgTable("dpias", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  processingId: uuid("processing_id").notNull().references(() => processingActivities.id, { onDelete: "cascade" }),
  /** descrierea sistematică a operațiunilor (Art. 35(7)(a)), precompletată din registru */
  description: text("description"),
  /** necesitate și proporționalitate (Art. 35(7)(b)) */
  necessity: text("necessity"),
  /** riscurile, cu măsurile și riscul rezidual (Art. 35(7)(c)–(d)) */
  risks: jsonb("risks").$type<import("@togato/shared").DpiaRisk[]>().notNull().default([]),
  /** avizul responsabilului cu protecția datelor (Art. 35(2)) și opinia persoanelor vizate (Art. 35(9)) */
  dpoOpinion: text("dpo_opinion"),
  subjectsViews: text("subjects_views"),
  /** data la care evaluarea trebuie revizuită (Art. 35(11)) */
  reviewOn: date("review_on"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedBy: uuid("finalized_by").references(() => users.id, { onDelete: "set null" }),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("dpias_processing_unique").on(t.processingId),
  index("dpias_org_idx").on(t.organizationId),
]);

/** Cererile persoanelor vizate primite de client (Art. 12–22), cu termenul legal de răspuns. */
export const dsarRequests = pgTable("dsar_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  type: dsarTypeEnum("type").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterContact: text("requester_contact"),
  receivedOn: date("received_on").notNull(),
  /** termenul calculat: o lună, sau trei după prelungire (Art. 12(3)) */
  dueOn: date("due_on").notNull(),
  extended: boolean("extended").notNull().default(false),
  extensionReason: text("extension_reason"),
  identityVerified: boolean("identity_verified").notNull().default(false),
  status: dsarStatusEnum("status").notNull().default("primita"),
  details: text("details"),
  outcome: text("outcome"),
  closedOn: date("closed_on"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("dsar_org_idx").on(t.organizationId, t.status, t.dueOn),
  index("dsar_client_idx").on(t.clientId),
]);

/** Registrul incidentelor de securitate a datelor (Art. 33(5)), cu termenul de 72 de ore. */
export const breaches = pgTable("breaches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  breachTypes: jsonb("breach_types").$type<string[]>().notNull().default([]),
  /** momentul luării la cunoștință — de aici curg cele 72 de ore */
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
  subjectsAffected: integer("subjects_affected"),
  recordsAffected: integer("records_affected"),
  risk: breachRiskEnum("risk").notNull().default("neevaluat"),
  riskReasoning: text("risk_reasoning"),
  consequences: text("consequences"),
  measures: text("measures"),
  authorityNotifiedAt: timestamp("authority_notified_at", { withTimezone: true }),
  authorityReference: text("authority_reference"),
  /** motivele întârzierii, dacă notificarea depășește 72 de ore (Art. 33(1)) */
  delayReason: text("delay_reason"),
  subjectsNotifiedAt: timestamp("subjects_notified_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("breaches_org_idx").on(t.organizationId, t.closedAt),
  index("breaches_client_idx").on(t.clientId),
]);

/** Dovezi atașate unei obligații (procese-verbale, politici semnate, capturi): fișierul stă în stocare. */
export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  obligationId: uuid("obligation_id").notNull().references(() => obligations.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  note: text("note"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("evidence_org_idx").on(t.organizationId),
  index("evidence_client_idx").on(t.clientId),
  index("evidence_obligation_idx").on(t.obligationId),
]);

/**
 * Coada de joburi (Postgres, FOR UPDATE SKIP LOCKED): emailuri, memorii AI, reîncadrări, mementouri.
 * `dedupeKey` unic împiedică dublarea joburilor programate (ex. mementoul zilnic).
 */
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: jobStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lastError: text("last_error"),
  dedupeKey: text("dedupe_key"),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [
  index("jobs_pending_idx").on(t.status, t.runAt),
  uniqueIndex("jobs_dedupe_unique").on(t.dedupeKey),
]);

/**
 * Sesiunile de autentificare (server-side): tokenul aleator stă în cookie httpOnly, în DB doar hash-ul.
 * Ștergerea rândului = deconectare imediată (ieșire, schimbarea parolei, dezactivarea contului).
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** expirare glisantă (prelungită la activitate), plafonată la ABSOLUTE_TTL de la creare */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [
  uniqueIndex("sessions_token_unique").on(t.tokenHash),
  index("sessions_user_idx").on(t.userId),
]);

/** Cereri de resetare a parolei: tokenul (o singură folosire, 60 de minute) e păstrat ca hash. */
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("password_resets_token_unique").on(t.tokenHash),
  index("password_resets_user_idx").on(t.userId),
]);

/**
 * Autoevaluarea gratuită a unei firme (fără cont): accesată printr-un link secret (în DB doar hash-ul).
 * Nu aparține niciunui cabinet; un cabinet primește datele doar când firma îi trimite o solicitare.
 */
export const selfAssessments = pgTable("self_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull(),
  companyName: text("company_name").notNull(),
  cui: text("cui"),
  county: text("county"),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  /** emailul e confirmat prin clic pe linkul primit (necesar pentru trimiterea către un cabinet) */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  verifyTokenHash: text("verify_token_hash"),
  /** instrumentele AI: [{ id, name, vendor, purpose, answers }] (răspunsurile simple din portal) */
  tools: jsonb("tools").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("self_assessments_token_unique").on(t.tokenHash),
  index("self_assessments_email_idx").on(t.contactEmail),
]);

/**
 * Solicitarea unei firme către un cabinet ales de ea. `payload` = copia datelor pe care firma a
 * acceptat să le trimită (companie, contact, instrumente, rezultat), la momentul trimiterii.
 */
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  selfAssessmentId: uuid("self_assessment_id").references(() => selfAssessments.id, { onDelete: "set null" }),
  status: referralStatusEnum("status").notNull().default("nou"),
  payload: jsonb("payload").notNull(),
  message: text("message"),
  responseMessage: text("response_message"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  respondedBy: uuid("responded_by").references(() => users.id, { onDelete: "set null" }),
  /** avocatul a confirmat verificarea conflictului de interese înainte de acceptare */
  conflictCheckedAt: timestamp("conflict_checked_at", { withTimezone: true }),
  conflictNote: text("conflict_note"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("referrals_org_idx").on(t.organizationId, t.createdAt),
  uniqueIndex("referrals_org_assessment_unique").on(t.organizationId, t.selfAssessmentId),
]);

/**
 * Jurnalul acțiunilor echipei Togato (administratorii platformei). Separat de jurnalul cabinetelor;
 * acțiunile care privesc un cabinet apar și în jurnalul acelui cabinet.
 */
export const platformAuditLog = pgTable("platform_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id"),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  targetOrganizationId: uuid("target_organization_id"),
  details: jsonb("details"),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("platform_audit_created_idx").on(t.createdAt)]);

/** Istoricul acceptărilor documentelor juridice (cine, ce versiune, când, de unde). */
export const legalAcceptances = pgTable("legal_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  version: text("version").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("legal_acceptances_org_idx").on(t.organizationId)]);

/** Evenimentele Stripe deja procesate (webhook-urile pot sosi de mai multe ori). */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Contoare pentru limitarea cererilor, comune tuturor instanțelor API. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
}, (t) => [index("rate_limits_reset_idx").on(t.resetAt)]);

// ─── Relații ─────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ one, many }) => ({
  responsible: one(users, { fields: [clients.responsibleUserId], references: [users.id] }),
  aiSystems: many(aiSystems),
  obligations: many(obligations),
}));

export const evidenceRelations = relations(evidence, ({ one }) => ({
  obligation: one(obligations, { fields: [evidence.obligationId], references: [obligations.id] }),
  uploader: one(users, { fields: [evidence.uploadedBy], references: [users.id] }),
}));

export const aiSystemsRelations = relations(aiSystems, ({ one, many }) => ({
  client: one(clients, { fields: [aiSystems.clientId], references: [clients.id] }),
  reviewer: one(users, { fields: [aiSystems.reviewedBy], references: [users.id], relationName: "reviewer" }),
  overrider: one(users, { fields: [aiSystems.overrideBy], references: [users.id], relationName: "overrider" }),
  obligations: many(obligations),
}));

export const obligationsRelations = relations(obligations, ({ one }) => ({
  client: one(clients, { fields: [obligations.clientId], references: [clients.id] }),
  aiSystem: one(aiSystems, { fields: [obligations.aiSystemId], references: [aiSystems.id] }),
}));
