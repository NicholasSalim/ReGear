import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { id } from "@/i18n/dictionaries/id";
import { localePath, type Locale } from "@/i18n/locales";
import type { EventType } from "@/i18n/messages";
import { env } from "@/lib/env";
import type { OutgoingEmail } from "@/lib/email/transport";

// Every email ReGear sends, worded from the dictionaries in the recipient's
// language. Each one is a few short paragraphs and at most one button.

// Dictionaries are imported directly: emails are also rendered outside a request (maintenance job, tests).
const dictionaryFor = (locale: Locale) => (locale === "en" ? en : id);

export type OrderRole = "buyer" | "seller";
type Fn = (...args: never[]) => string;
type OrderCopy = Partial<Record<OrderRole, { subject: (number: string) => string; body: Fn }>>;

export type EmailPayload =
  | { template: "verify-email"; params: { url: string; name: string } }
  | { template: "reset-password"; params: { url: string; name: string } }
  | { template: "order-event"; params: { orderId: string; number: string; title: string; type: EventType; role: OrderRole; event: Record<string, unknown> } }
  | { template: "dispute-message"; params: { disputeId: string; number: string; from: "BUYER" | "SELLER" | "ADMIN" } }
  | { template: "verification-approved"; params: Record<string, never> }
  | { template: "verification-rejected"; params: { note: string } };

export type EmailTemplate = EmailPayload["template"];

/** Templates whose params carry a one-time link; their params are wiped once sent. */
export const SENSITIVE_TEMPLATES: EmailTemplate[] = ["verify-email", "reset-password"];

/** Absolute URL of a page in the given language. */
export function siteUrl(path: string, locale: Locale) {
  return `${env.NEXT_PUBLIC_SITE_URL}${localePath(path, locale)}`;
}

/** The order email copy for an event and recipient, if that pair is emailed. */
export function orderCopy(locale: Locale, type: string, role: OrderRole) {
  return (dictionaryFor(locale).emails.order as Record<string, OrderCopy>)[type]?.[role];
}

type Content = { subject: string; paragraphs: string[]; button?: { label: string; url: string }; note?: string };

function content(payload: EmailPayload, locale: Locale): Content {
  const t = dictionaryFor(locale).emails;
  switch (payload.template) {
    case "verify-email":
      return { subject: t.verify.subject, paragraphs: [t.verify.body], button: { label: t.verify.button, url: payload.params.url }, note: t.verify.note };
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
    case "verification-approved":
      return { subject: t.verification.approved.subject, paragraphs: [t.verification.approved.body], button: { label: t.verification.approved.button, url: siteUrl("/sell", locale) } };
    case "verification-rejected":
      return {
        subject: t.verification.rejected.subject,
        paragraphs: [t.verification.rejected.body(payload.params.note)],
        button: { label: t.verification.rejected.button, url: siteUrl("/sell/verification", locale) },
      };
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
${p(greeting)}${c.paragraphs.map((x) => p(x)).join("")}${
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
