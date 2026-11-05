import "server-only";
import { en } from "@/i18n/dictionaries/en";
import { resolveEntry, type EventParams, type EventType } from "@/i18n/messages";
import { enqueueOrderEmails } from "@/lib/email/notify";
import type { Prisma } from "@/generated/prisma/client";

export type Tx = Prisma.TransactionClient;

/**
 * Record what happened to an order, in the same transaction as the change, and
 * queue the emails it sends. Events keep their details as params so the
 * timeline can word them in the viewer's language; the English text is stored
 * too, for logs and admins.
 */
export async function addEvent<T extends EventType>(tx: Tx, orderId: string, type: T, params: EventParams<T>, actorId?: string | null) {
  const message = resolveEntry(en.events[type], [params]);
  await tx.orderEvent.create({ data: { orderId, type, message, params: JSON.stringify(params), actorId: actorId ?? null } });
  await enqueueOrderEmails(tx, orderId, type, params);
}
