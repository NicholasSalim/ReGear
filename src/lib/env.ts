import "server-only";
import { z } from "zod";

// Validate configuration once at boot; fail fast on misconfiguration.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//,"must be a postgresql:// connection string"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  STORAGE_DIR: z.string().min(1).default("./storage"),
  CRON_SECRET: z.string().min(32).optional(),
  // Google sign-in is enabled only when both values are present.
  GOOGLE_CLIENT_ID: z.string().min(10).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(10).optional(),
  // Outgoing email over SMTP, e.g. smtps://user:pass@smtp.example.com:465. Without it,
  // development writes emails to <STORAGE_DIR>/dev-mail and production keeps them queued.
  SMTP_URL: z.string().regex(/^smtps?:\/\//, "must be an smtp:// or smtps:// URL").optional(),
  EMAIL_FROM: z.string().min(3).default("ReGear <no-reply@regear.local>"),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // How many reverse proxies (load balancer, CDN, ...) sit in front of the app.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
  // Midtrans payments. Without a server key, development and tests use the
  // simulated provider and production refuses to take payments.
  MIDTRANS_SERVER_KEY: z.string().min(10).optional(),
  MIDTRANS_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  // Seller withdrawals are paid by hand in production. "manual" does that in
  // development too; "auto" simulates the transfer outside production.
  PAYOUTS_MODE: z.enum(["auto", "manual"]).default("auto"),
});

const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
const parsed = schema.safeParse(raw);
if (!parsed.success) {
  console.error("Invalid environment configuration", z.treeifyError(parsed.error));
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
/** Secure-only cookies & HSTS require the site to be served over HTTPS. */
export const isHttps = env.NEXT_PUBLIC_SITE_URL.startsWith("https://");

if (isProd && !isHttps && env.NEXT_PUBLIC_SITE_URL !== "http://localhost:3000") {
  console.warn("[regear] NEXT_PUBLIC_SITE_URL is not HTTPS: secure cookies and HSTS are disabled.");
}
if (isProd && !env.TRUST_PROXY) {
  // Without a trusted proxy header every visitor looks the same, so the per-IP
  // limits on sign-in and sign-up become one shared limit for the whole site.
  console.warn("[regear] TRUST_PROXY is off: all visitors share one rate-limit bucket. Deploy behind a reverse proxy and set TRUST_PROXY=true.");
}
// Sandbox keys start with "SB-"; sending one to the production API (or the
// reverse) fails every call with 401, so catch the mix-up at boot.
if (env.MIDTRANS_SERVER_KEY && env.MIDTRANS_SERVER_KEY.startsWith("SB-") !== (env.MIDTRANS_ENV === "sandbox")) {
  throw new Error(`MIDTRANS_SERVER_KEY does not match MIDTRANS_ENV="${env.MIDTRANS_ENV}"`);
}
if (isProd && !env.MIDTRANS_SERVER_KEY) {
  console.warn("[regear] MIDTRANS_SERVER_KEY is not set: buyers cannot pay for orders.");
}
