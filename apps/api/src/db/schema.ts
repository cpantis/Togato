import { pgTable, pgEnum, uuid, text, timestamp, integer, boolean, jsonb, date, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AiSystemAnswers, ClassificationResult } from "@togato/shared";

export const orgStatusEnum = pgEnum("org_status", ["trial", "activ", "suspendat"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "membru"]);
export const userStatusEnum = pgEnum("user_status", ["activ", "dezactivat"]);
export const riskLevelEnum = pgEnum("risk_level", ["neclasificat", "minim", "transparenta", "risc_ridicat", "interzis", "neaplicabil"]);
export const reviewStatusEnum = pgEnum("review_status", ["propus", "aprobat", "respins"]);
export const systemSourceEnum = pgEnum("system_source", ["cabinet", "portal"]);
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
  /** clientul arhivat nu mai apare în liste și termene; doar un client arhivat poate fi șters */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("clients_org_idx").on(t.organizationId),
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
