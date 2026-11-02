import { pgTable, pgEnum, uuid, text, timestamp, integer, boolean, jsonb, date, bigint, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { AiSystemAnswers, ClassificationResult } from "@togato/shared";

export const orgStatusEnum = pgEnum("org_status", ["trial", "activ", "suspendat"]);
export const userRoleEnum = pgEnum("user_role", ["admin", "membru"]);
export const userStatusEnum = pgEnum("user_status", ["activ", "dezactivat"]);
export const riskLevelEnum = pgEnum("risk_level", ["neclasificat", "minim", "transparenta", "risc_ridicat", "interzis"]);
export const reviewStatusEnum = pgEnum("review_status", ["propus", "aprobat", "respins"]);
export const obligationStatusEnum = pgEnum("obligation_status", ["de_facut", "in_lucru", "indeplinit", "nu_se_aplica"]);

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
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ai_systems_org_idx").on(t.organizationId),
  index("ai_systems_client_idx").on(t.clientId),
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

// ─── Relații ─────────────────────────────────────────────

export const clientsRelations = relations(clients, ({ one, many }) => ({
  responsible: one(users, { fields: [clients.responsibleUserId], references: [users.id] }),
  aiSystems: many(aiSystems),
  obligations: many(obligations),
}));

export const aiSystemsRelations = relations(aiSystems, ({ one, many }) => ({
  client: one(clients, { fields: [aiSystems.clientId], references: [clients.id] }),
  reviewer: one(users, { fields: [aiSystems.reviewedBy], references: [users.id] }),
  obligations: many(obligations),
}));

export const obligationsRelations = relations(obligations, ({ one }) => ({
  client: one(clients, { fields: [obligations.clientId], references: [clients.id] }),
  aiSystem: one(aiSystems, { fields: [obligations.aiSystemId], references: [aiSystems.id] }),
}));
