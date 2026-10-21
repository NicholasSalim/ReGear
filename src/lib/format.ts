import { INTL_LOCALE, type Locale } from "@/i18n/locales";

// All amounts are whole rupiah (IDR has no minor unit in practice), so the
// currency is fixed: formatting another currency would show wrong amounts.
// Money uses Indonesian digit grouping in both languages ("Rp 1.500.000").
export const currencyCode = "IDR";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 });
const dateFmt: Record<Locale, Intl.DateTimeFormat> = {
  id: new Intl.DateTimeFormat(INTL_LOCALE.id, { dateStyle: "medium" }),
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { dateStyle: "medium" }),
};
const dateTimeFmt: Record<Locale, Intl.DateTimeFormat> = {
  id: new Intl.DateTimeFormat(INTL_LOCALE.id, { dateStyle: "medium", timeStyle: "short" }),
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { dateStyle: "medium", timeStyle: "short" }),
};

/** "Rp 1.500.000" */
export function formatMoney(amountIdr: number): string {
  return money.format(amountIdr);
}

/** Amount in Indonesian digit grouping without the currency, for form fields: "1.500.000". */
export function formatAmount(amountIdr: number): string {
  return amountIdr.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export function formatDate(d: Date | string, locale: Locale): string {
  return dateFmt[locale].format(new Date(d));
}

export function formatDateTime(d: Date | string, locale: Locale): string {
  return dateTimeFmt[locale].format(new Date(d));
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
