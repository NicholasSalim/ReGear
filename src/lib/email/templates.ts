import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { id } from "@/i18n/dictionaries/id";
import { localePath, type Locale } from "@/i18n/locales";
import type { EventType } from "@/i18n/messages";
import { env } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { OutgoingEmail } from "@/lib/email/transport";

// Every email ReGear sends, worded from the dictionaries in the recipient's
// language. Each one is a few short paragraphs and at most one button.

// Dictionaries are imported directly: emails are also rendered outside a request (maintenance job, tests).
const dictionaryFor = (locale: Locale) => (locale === "en" ? en : id);

export type OrderRole = "buyer" | "seller";
type Fn = (...args: never[]) => string;
type OrderCopy = Partial<Record<OrderRole, { subject: (number: string) => string; body: Fn }>>;

export type EmailPayload =
  | { template: "signup-code"; params: { code: string; name: string } }
  | { template: "signup-existing"; params: Record<string, never> }
  | { template: "reset-password"; params: { url: string; name: string } }
  | { template: "order-event"; params: { orderId: string; number: string; title: string; type: EventType; role: OrderRole; event: Record<string, unknown> } }
  | { template: "dispute-message"; params: { disputeId: string; number: string; from: "BUYER" | "SELLER" | "ADMIN" } }
  | { template: "account-banned"; params: { until: string | null; reason: string } }
  | { template: "account-unbanned"; params: Record<string, never> }
  | { template: "verification-approved"; params: Record<string, never> }
  | { template: "verification-rejected"; params: { note: string } }
  | { template: "payout-account-changed"; params: { bank: string; account: string; name: string } }
  | { template: "withdrawal-completed"; params: { amountIdr: number; account: string } }
  | { template: "withdrawal-failed"; params: { amountIdr: number; rejected: boolean; note: string } }
  | { template: "offer-received"; params: { title: string; amountIdr: number; hours: number } }
  | { template: "offer-answered"; params: { offerId: string; listingId: string; slug: string; title: string; amountIdr: number; accepted: boolean; hours: number } }
  | { template: "message-received"; params: { conversationId: string; title: string; from: "buyer" | "seller" } }
  | { template: "saved-search-alert"; params: { label: string; count: number; query: string } };

export type EmailTemplate = EmailPayload["template"];

/** Templates whose params carry a one-time code or link; their params are wiped once sent. */
export const SENSITIVE_TEMPLATES: EmailTemplate[] = ["signup-code", "reset-password"];

/** Absolute URL of a page in the given language. */
export function siteUrl(path: string, locale: Locale) {
  return `${env.NEXT_PUBLIC_SITE_URL}${localePath(path, locale)}`;
}

/** The order email copy for an event and recipient, if that pair is emailed. */
export function orderCopy(locale: Locale, type: string, role: OrderRole) {
  return (dictionaryFor(locale).emails.order as Record<string, OrderCopy>)[type]?.[role];
}

type Content = { subject: string; paragraphs: string[]; code?: string; button?: { label: string; url: string }; note?: string };

function content(payload: EmailPayload, locale: Locale): Content {
  const t = dictionaryFor(locale).emails;
  switch (payload.template) {
    case "signup-code":
      return { subject: t.signupCode.subject(payload.params.code), paragraphs: [t.signupCode.body], code: payload.params.code, note: t.signupCode.note };
    case "signup-existing":
      return {
        subject: t.signupExisting.subject,
        paragraphs: [t.signupExisting.body],
        button: { label: t.signupExisting.button, url: siteUrl("/login", locale) },
        note: t.signupExisting.note,
      };
    case "reset-password":
      return { subject: t.reset.subject, paragraphs: [t.reset.body], button: { label: t.reset.button, url: payload.params.url }, note: t.reset.note };
    case "order-event": {
      const p = payload.params;
      const copy = orderCopy(locale, p.type, p.role);
      if (!copy) throw new Error(`No email copy for ${p.type}/${p.role}`);
      const page = p.role === "buyer" ? `/account/orders/${p.orderId}` : `/sell/orders/${p.orderId}`;
      return {
        subject: copy.subject(p.number),
        paragraphs: [(copy.body as (event: unknown) => string)(p.event), t.orderLine(p.title, p.number)],
        button: { label: t.viewOrder, url: siteUrl(page, locale) },
      };
    }
    case "dispute-message":
      return {
        subject: t.disputeMessage.subject(payload.params.number),
        paragraphs: [t.disputeMessage.body(payload.params.from)],
        button: { label: t.disputeMessage.button, url: siteUrl(`/disputes/${payload.params.disputeId}`, locale) },
      };
    case "account-banned": {
      const { until, reason } = payload.params;
      return { subject: t.account.banned.subject, paragraphs: [t.account.banned.body(until ? formatDateTime(until, locale) : null), t.account.banned.reason(reason)] };
    }
    case "account-unbanned":
      return { subject: t.account.unbanned.subject, paragraphs: [t.account.unbanned.body], button: { label: t.account.unbanned.button, url: siteUrl("/login", locale) } };
    case "verification-approved":
      return { subject: t.verification.approved.subject, paragraphs: [t.verification.approved.body], button: { label: t.verification.approved.button, url: siteUrl("/sell", locale) } };
    case "verification-rejected":
      return {
        subject: t.verification.rejected.subject,
        paragraphs: [t.verification.rejected.body(payload.params.note)],
        button: { label: t.verification.rejected.button, url: siteUrl("/sell/profile#verification", locale) },
      };
    case "payout-account-changed": {
      const { bank, account, name } = payload.params;
      return {
        subject: t.payout.accountChanged.subject,
        paragraphs: [t.payout.accountChanged.body(bank, account, name), t.payout.accountChanged.warning],
        button: { label: t.payout.button, url: siteUrl("/sell/payouts", locale) },
      };
    }
    case "withdrawal-completed": {
      const amount = formatMoney(payload.params.amountIdr);
      return {
        subject: t.payout.completed.subject(amount),
        paragraphs: [t.payout.completed.body(amount, payload.params.account)],
        button: { label: t.payout.button, url: siteUrl("/sell/payouts", locale) },
      };
    }
    case "withdrawal-failed": {
      const amount = formatMoney(payload.params.amountIdr);
      return {
        subject: t.payout.failed.subject(amount),
        paragraphs: [t.payout.failed.body(amount, payload.params.rejected, payload.params.note)],
        button: { label: t.payout.button, url: siteUrl("/sell/payouts", locale) },
      };
    }
    case "offer-received": {
      const p = payload.params;
      const amount = formatMoney(p.amountIdr);
      return {
        subject: t.offer.received.subject(amount),
        paragraphs: [t.offer.received.body(amount, p.title, p.hours)],
        button: { label: t.offer.received.button, url: siteUrl("/sell/offers", locale) },
      };
    }
    case "offer-answered": {
      const p = payload.params;
      const amount = formatMoney(p.amountIdr);
      return p.accepted
        ? {
            subject: t.offer.accepted.subject(amount),
            paragraphs: [t.offer.accepted.body(amount, p.title, p.hours)],
            button: { label: t.offer.accepted.button, url: siteUrl(`/checkout/${p.listingId}?offer=${p.offerId}`, locale) },
          }
        : {
            subject: t.offer.declined.subject(amount),
            paragraphs: [t.offer.declined.body(amount, p.title)],
            button: { label: t.offer.declined.button, url: siteUrl(`/listings/${p.slug}`, locale) },
          };
    }
    case "message-received": {
      const p = payload.params;
      return {
        subject: t.message.subject(p.title),
        paragraphs: [t.message.body(p.from === "buyer" ? t.message.fromBuyer : t.message.fromSeller, p.title)],
        button: { label: t.message.button, url: siteUrl(`/account/messages/${p.conversationId}`, locale) },
      };
    }
    case "saved-search-alert": {
      const p = payload.params;
      return {
        subject: t.savedSearch.subject(p.count, p.label),
        paragraphs: [t.savedSearch.body(p.count, p.label)],
        button: { label: t.savedSearch.button, url: siteUrl(`/listings${p.query ? `?${p.query}&sort=newest` : "?sort=newest"}`, locale) },
        note: t.savedSearch.note,
      };
    }
  }
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Subject, HTML and plain-text versions of an email. All interpolated text is escaped. */
export function renderEmail(payload: EmailPayload, locale: Locale, to: string, name: string | null): OutgoingEmail {
  const t = dictionaryFor(locale).emails;
  const c = content(payload, locale);
  const greeting = name ? t.greeting(name) : t.greetingNoName;
  const privacyUrl = siteUrl("/privacy", locale);

  const text = [
    greeting,
    ...c.paragraphs,
    ...(c.code ? [c.code] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`] : []),
    ...(c.note ? [c.note] : []),
    "—",
    t.footer,
    `${t.privacy}: ${privacyUrl}`,
  ].join("\n\n");

  const p = (s: string, style = "") => `<p style="margin:0 0 16px;${style}">${escape(s)}</p>`;
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a2233">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 20px;font-size:20px;font-weight:800;letter-spacing:-0.02em">ReGear</p>
<div style="background:#ffffff;border:1px solid #dfe2e8;border-radius:10px;padding:24px;font-size:15px;line-height:1.55">
${p(greeting)}${c.paragraphs.map((x) => p(x)).join("")}${c.code ? p(c.code, "font-size:30px;font-weight:800;letter-spacing:8px;font-family:Consolas,Menlo,monospace") : ""}${
    c.button
      ? `<p style="margin:24px 0"><a href="${escape(c.button.url)}" style="display:inline-block;background:#2340d9;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escape(c.button.label)}</a></p>
${p(t.buttonFallback, "font-size:13px;color:#5b6475")}<p style="margin:0 0 16px;font-size:13px;word-break:break-all"><a href="${escape(c.button.url)}" style="color:#2340d9">${escape(c.button.url)}</a></p>`
      : ""
  }${c.note ? p(c.note, "font-size:13px;color:#5b6475") : ""}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#5b6475">${escape(t.footer)} <a href="${escape(privacyUrl)}" style="color:#5b6475">${escape(t.privacy)}</a></p>
</div></body></html>`;

  return { to, subject: c.subject, html, text };
}
