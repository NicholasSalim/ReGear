import type { Prisma } from "@/generated/prisma/client";
import { bannedNowWhere } from "@/lib/account/ban-state";

/**
 * The inbox an address delivers to. Most providers ignore anything after a
 * "+" (you+shop@example.com reaches you@example.com), and Gmail also ignores
 * dots and treats googlemail.com as gmail.com. Two accounts with the same key
 * belong to the same person, so a ban can't be dodged by signing up again
 * with an alias.
 *
 * Only used to compare addresses: mail is always sent to the address as typed.
 */
export function mailboxKey(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at <= 0) return address;
  let local = address.slice(0, at);
  let domain = address.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replaceAll(".", "");
  return `${local}@${domain}`;
}

type UserClient = Pick<Prisma.TransactionClient, "user">;

/** Whether an account on the same inbox as `email` is banned right now (deleted accounts don't count). */
export async function mailboxBanned(client: UserClient, email: string, now = new Date()) {
  const banned = await client.user.findFirst({
    where: { mailbox: mailboxKey(email), deletedAt: null, ...bannedNowWhere(now) },
    select: { id: true },
  });
  return banned !== null;
}
