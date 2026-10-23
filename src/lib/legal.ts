import type { Localized } from "@/i18n/locales";

// Facts the Privacy Policy and Terms state about the operator. The bracketed
// values are placeholders: fill them in before launch. While any remains, the
// legal pages show a "draft" notice.

export const LEGAL_VERSION = "2026-10-23";
export const LEGAL_EFFECTIVE_DATE = new Date("2026-10-23T00:00:00+07:00");

export const LEGAL_DETAILS: Record<"operator" | "address" | "email" | "court", Localized> = {
  operator: { en: "[Company legal name]", id: "[Nama badan hukum]" },
  address: { en: "[Registered address]", id: "[Alamat terdaftar]" },
  email: { en: "[privacy contact email]", id: "[email kontak privasi]" },
  court: { en: "[city] District Court", id: "Pengadilan Negeri [kota]" },
};

export const LEGAL_DETAILS_MISSING = Object.values(LEGAL_DETAILS).some((v) => v.en.includes("[") || v.id.includes("["));

/** Security logs are kept this long, then deleted by the maintenance job. */
export const AUDIT_RETENTION_DAYS = 730;
