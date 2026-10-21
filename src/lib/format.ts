const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "USD";
const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? "en-US";

const money = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

export const currencyCode = CURRENCY;

export function formatMoney(cents: number): string {
  return money.format(cents / 100);
}

/** Price string for structured data (schema.org expects a plain decimal). */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
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

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}
