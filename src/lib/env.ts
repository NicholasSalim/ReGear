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
