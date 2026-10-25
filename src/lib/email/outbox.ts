import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { isLocale, type Locale } from "@/i18n/locales";
import type { Prisma } from "@/generated/prisma/client";
import { renderEmail, SENSITIVE_TEMPLATES, type EmailPayload, type EmailTemplate } from "@/lib/email/templates";
import { EmailNotConfiguredError, sendEmail } from "@/lib/email/transport";

// Outgoing email queue. enqueueEmail() writes a row with the same client as
// the change that causes it (pass the transaction), so a rolled-back change
// sends nothing. Delivery runs after the response, and the maintenance job
// retries anything left over.

type Client = Pick<Prisma.TransactionClient, "emailOutbox">;

const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MS = 10 * 60_000;
const NOT_CONFIGURED_RETRY_MS = 5 * 60_000;

export type EmailRecipient = { userId: string; to?: string; locale: Locale };

/**
 * Queue an email for a user. Order and account notices go to the user's
 * current, verified address at send time; `to` fixes the address (for the
 * verification and reset emails, which go out before it is verified).
 */
export async function enqueueEmail(client: Client, recipient: EmailRecipient, payload: EmailPayload) {
  await client.emailOutbox.create({
    data: { userId: recipient.userId, to: recipient.to ?? null, locale: recipient.locale, template: payload.template, params: JSON.stringify(payload.params) },
  });
  scheduleDelivery();
}

/** Deliver right after the current request; outside a request the maintenance job does it. */
export function scheduleDelivery() {
  try {
    after(() => deliverPendingEmails().catch((err) => console.error("[email] delivery failed", err)));
  } catch {
    /* not in a request (tests, scripts) */
  }
}

/** Send queued emails. Safe to run concurrently: each row is claimed before it's sent. */
export async function deliverPendingEmails(limit = 50) {
  const now = new Date();
  const due = await db.emailOutbox.findMany({
    where: {
      OR: [
        { status: "PENDING", sendAfter: { lte: now } },
        { status: "SENDING", claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true, status: true, claimedAt: true },
  });

  let sent = 0;
  for (const row of due) {
    const claimed = await db.emailOutbox.updateMany({
      where: { id: row.id, status: row.status, claimedAt: row.claimedAt },
      data: { status: "SENDING", claimedAt: now },
    });
    if (claimed.count === 1 && (await deliverOne(row.id))) sent++;
  }
  return { sent, considered: due.length };
}

async function deliverOne(id: string): Promise<boolean> {
  const row = await db.emailOutbox.findUniqueOrThrow({ where: { id } });
  const sensitive = SENSITIVE_TEMPLATES.includes(row.template as EmailTemplate);
  const user = row.userId
    ? await db.user.findUnique({ where: { id: row.userId }, select: { email: true, name: true, deletedAt: true, emailVerifiedAt: true } })
    : null;

  // Account emails go to the address they were written for; everything else
  // only to a live account's verified address.
  const to = row.to ?? (user && !user.deletedAt && user.emailVerifiedAt ? user.email : null);
  if (!to || (row.userId && (!user || user.deletedAt))) {
    await db.emailOutbox.update({ where: { id }, data: { status: "SKIPPED", ...(sensitive ? { params: "{}" } : {}) } });
    return false;
  }

  try {
    const payload = { template: row.template, params: JSON.parse(row.params) } as EmailPayload;
    const locale: Locale = isLocale(row.locale) ? row.locale : "id";
    await sendEmail(renderEmail(payload, locale, to, user?.name || ("name" in payload.params ? payload.params.name : null) || null));
    await db.emailOutbox.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), lastError: null, ...(sensitive ? { params: "{}" } : {}) } });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof EmailNotConfiguredError) {
      // Not the email's fault: keep it queued without using up attempts.
      await db.emailOutbox.update({ where: { id }, data: { status: "PENDING", lastError: message, sendAfter: new Date(Date.now() + NOT_CONFIGURED_RETRY_MS) } });
      console.error(`[email] ${message}`);
      return false;
    }
    const attempts = row.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    await db.emailOutbox.update({
      where: { id },
      data: {
        status: failed ? "FAILED" : "PENDING",
        attempts,
        lastError: message.slice(0, 500),
        // Back off 1, 2, 4, 8 minutes between attempts.
        sendAfter: new Date(Date.now() + 2 ** (attempts - 1) * 60_000),
        ...(failed && sensitive ? { params: "{}" } : {}),
      },
    });
    console.error(`[email] send failed (attempt ${attempts})`, message);
    return false;
  }
}
