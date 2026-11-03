/**
 * Configurarea aplicației, validată la pornire. O valoare lipsă sau greșită oprește procesul
 * cu un mesaj clar, în loc să producă erori obscure mai târziu.
 */
import "dotenv/config";
import { z } from "zod";

/** comutator din variabilă de mediu (on/off, true/false, 1/0), cu valoare implicită */
const bool = { default: (d: "on" | "off") => z.enum(["on", "off", "true", "false", "1", "0"]).default(d).transform((v) => v === "on" || v === "true" || v === "1") };
const hex64 = z.string().regex(/^[0-9a-fA-F]{64}$/, "trebuie să aibă 64 de caractere hex (openssl rand -hex 32)");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().url("trebuie să fie un URL Postgres"),
  JWT_SECRET: z.string().min(16, "minimum 16 caractere"),
  ENCRYPTION_KEY: hex64.optional(),
  /** cheia anterioară, păstrată doar pentru decriptare în timpul rotirii */
  ENCRYPTION_KEY_PREVIOUS: hex64.optional(),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  /** numărul de proxy-uri de încredere din fața API-ului (Railway: 1) — pentru IP-ul real al clientului */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  RATE_LIMIT: bool.default("on"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SENTRY_DSN: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LISTAFIRME_API_KEY: z.string().optional(),
  // email
  EMAIL_PROVIDER: z.enum(["log", "resend"]).default("log"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Togato <noreply@togato.ro>"),
  // stocare fișiere
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // abonamente
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_START: z.string().optional(),
  STRIPE_PRICE_CABINET: z.string().optional(),
  // platformă
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  /** rulează joburile și în procesul API; dezactivați când rulează un worker separat (`npm run worker`) */
  RUN_WORKER_IN_API: bool.default("on"),
}).superRefine((c, ctx) => {
  if (c.NODE_ENV === "production") {
    if (c.JWT_SECRET.length < 32) ctx.addIssue({ code: "custom", path: ["JWT_SECRET"], message: "în producție, minimum 32 de caractere" });
    if (!c.ENCRYPTION_KEY) ctx.addIssue({ code: "custom", path: ["ENCRYPTION_KEY"], message: "obligatoriu în producție" });
    if (c.EMAIL_PROVIDER === "log") ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "în producție trebuie un furnizor real (resend)" });
  }
  if (c.EMAIL_PROVIDER === "resend" && !c.RESEND_API_KEY) ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "obligatoriu pentru EMAIL_PROVIDER=resend" });
  if (c.STORAGE_DRIVER === "s3") {
    for (const k of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!c[k]) ctx.addIssue({ code: "custom", path: [k], message: "obligatoriu pentru STORAGE_DRIVER=s3" });
    }
  }
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Configurare invalidă:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

/** doar pentru teste */
export function _resetConfig() {
  cached = null;
}

export function frontendBaseUrl(): string {
  return config().FRONTEND_URL.split(",")[0].trim().replace(/\/$/, "");
}
