const LOCALE = process.env.NEXT_PUBLIC_LOCALE ?? "en-US";

// All amounts are whole rupiah (IDR has no minor unit in practice), so the
// currency is fixed: formatting another currency would show wrong amounts.
export const currencyCode = "IDR";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short" });

/** "Rp 1.500.000" */
export function formatMoney(amountIdr: number): string {
  return money.format(amountIdr);
}

/** Amount in Indonesian digit grouping without the currency, for form fields: "1.500.000". */
export function formatAmount(amountIdr: number): string {
  return amountIdr.toLocaleString("id-ID", { maximumFractionDigits: 0 });
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
