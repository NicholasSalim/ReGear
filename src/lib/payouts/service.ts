import "server-only";
import { db } from "@/lib/db";
import { isLocale } from "@/i18n/locales";
import { enqueueEmail } from "@/lib/email/outbox";
import { formatMoney } from "@/lib/format";
import { DomainError } from "@/lib/orders/service";
import { BANKS, bankName, PayoutError, payouts } from "@/lib/payouts/provider";
import type { Prisma } from "@/generated/prisma/client";
import {
  MIN_WITHDRAWAL_IDR,
  NEW_PAYOUT_ACCOUNT_HOURS,
  OPEN_WITHDRAWAL_STATUSES,
  WITHDRAWAL_REVIEW_ABOVE_IDR,
  type WithdrawalReviewReason,
  type WithdrawalStatus,
} from "@/lib/constants";

// Seller balances and withdrawals. Completed orders credit the seller's
// balance (see the order service); a withdrawal debits it when requested and
// credits it back if the transfer fails or is rejected. Every status change
// is compare-and-swap on the current status, so a double click, two admins,
// or the maintenance job racing an admin change it at most once.

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof db;

export async function sellerBalance(sellerId: string, client: Client = db) {
  const sum = await client.balanceEntry.aggregate({ where: { sellerId }, _sum: { amountIdr: true } });
  return sum._sum.amountIdr ?? 0;
}

const localeOf = (value: string) => (isLocale(value) ? value : "id");

async function sellerUser(tx: Tx, sellerId: string) {
  const seller = await tx.sellerProfile.findUniqueOrThrow({ where: { id: sellerId }, select: { user: { select: { id: true, locale: true } } } });
  return { userId: seller.user.id, locale: localeOf(seller.user.locale) };
}

/** Last four digits only, for emails and lists. */
export const maskAccount = (account: string) => `•••• ${account.slice(-4)}`;

// Payout account --------------------------------------------------------------

/**
 * Save where withdrawals go. Nothing here can ask the bank who owns the
 * account: the admin paying it checks the holder name their bank shows, and
 * a name that doesn't match the verified one holds withdrawals for review.
 * The seller is emailed every time, since changing it is how an account
 * takeover would steal the balance.
 */
export async function setPayoutAccount(userId: string, input: { bank: string; accountNumber: string; accountName: string }) {
  const seller = await db.sellerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!seller) throw new DomainError("sellerNotFound");
  if (!BANKS.some((b) => b.code === input.bank)) throw new DomainError("bankNotSupported");

  await db.$transaction(async (tx) => {
    await tx.sellerProfile.update({
      where: { id: seller.id },
      data: { payoutBank: input.bank, payoutAccountNumber: input.accountNumber, payoutAccountName: input.accountName, payoutAccountSetAt: new Date() },
    });
    await enqueueEmail(tx, await sellerUser(tx, seller.id), {
      template: "payout-account-changed",
      params: { bank: bankName(input.bank), account: maskAccount(input.accountNumber), name: input.accountName },
    });
  });
  return { sellerId: seller.id, accountName: input.accountName };
}

// Requesting a withdrawal -------------------------------------------------------

/** Letters only, upper case, so "Budi S." and "BUDI S" compare equal. */
const nameWords = (name: string) => name.toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter(Boolean);

/** Bank names are often shortened: every word of the shorter name must appear in the longer one. */
export function namesMatch(a: string, b: string) {
  const [short, long] = [nameWords(a), nameWords(b)].sort((x, y) => x.length - y.length);
  return short.length > 0 && short.every((w) => long.some((l) => l === w || (w.length === 1 && l.startsWith(w))));
}

async function reviewReasons(tx: Tx, seller: { id: string; payoutAccountName: string | null; payoutAccountSetAt: Date | null }, amountIdr: number) {
  const reasons: WithdrawalReviewReason[] = [];
  const [completedBefore, verification, disputes] = await Promise.all([
    tx.withdrawal.count({ where: { sellerId: seller.id, status: "COMPLETED" } }),
    tx.verificationRequest.findFirst({ where: { sellerId: seller.id, status: "APPROVED" }, orderBy: { reviewedAt: "desc" }, select: { legalName: true } }),
    tx.order.count({ where: { sellerId: seller.id, status: "DISPUTED" } }),
  ]);
  if (completedBefore === 0) reasons.push("first");
  if (amountIdr > WITHDRAWAL_REVIEW_ABOVE_IDR) reasons.push("large");
  if (seller.payoutAccountSetAt && Date.now() - seller.payoutAccountSetAt.getTime() < NEW_PAYOUT_ACCOUNT_HOURS * 3_600_000) reasons.push("newAccount");
  if (!verification || !namesMatch(verification.legalName, seller.payoutAccountName ?? "")) reasons.push("nameMismatch");
  if (disputes > 0) reasons.push("openDispute");
  return reasons;
}

/** Take money out of the balance. It goes to the bank at once unless a rule holds it for an admin. */
export async function requestWithdrawal(userId: string, amountIdr: number) {
  const withdrawal = await db.$transaction(async (tx) => {
    const found = await tx.sellerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!found) throw new DomainError("sellerNotFound");
    // One request at a time per seller: lock the profile row so two requests
    // can't both see the same balance.
    await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${found.id} FOR UPDATE`;
    const seller = await tx.sellerProfile.findUniqueOrThrow({ where: { id: found.id } });

    if (seller.verificationStatus !== "VERIFIED") throw new DomainError("withdrawNeedsVerification");
    if (!seller.payoutBank || !seller.payoutAccountNumber || !seller.payoutAccountName) throw new DomainError("withdrawNeedsAccount");
    if (amountIdr < MIN_WITHDRAWAL_IDR) throw new DomainError("withdrawalMinimum", formatMoney(MIN_WITHDRAWAL_IDR));
    if (await tx.withdrawal.count({ where: { sellerId: seller.id, status: { in: OPEN_WITHDRAWAL_STATUSES } } })) {
      throw new DomainError("withdrawalOpen");
    }
    if (amountIdr > (await sellerBalance(seller.id, tx))) throw new DomainError("insufficientBalance");

    const reasons = await reviewReasons(tx, seller, amountIdr);
    const created = await tx.withdrawal.create({
      data: {
        sellerId: seller.id,
        amountIdr,
        status: reasons.length ? "PENDING_REVIEW" : "SENDING",
        bank: seller.payoutBank,
        accountNumber: seller.payoutAccountNumber,
        accountName: seller.payoutAccountName,
        reviewReasons: JSON.stringify(reasons),
      },
    });
    await tx.balanceEntry.create({ data: { sellerId: seller.id, type: "WITHDRAWAL", amountIdr: -amountIdr, withdrawalId: created.id } });
    return created;
  });
  if (withdrawal.status === "SENDING") await sendWithdrawal(withdrawal.id);
  return db.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
}

// Moving through the provider ----------------------------------------------------

async function move(tx: Tx, id: string, from: WithdrawalStatus, to: WithdrawalStatus, data: Prisma.WithdrawalUpdateManyMutationInput = {}) {
  const res = await tx.withdrawal.updateMany({ where: { id, status: from }, data: { ...data, status: to } });
  if (res.count !== 1) throw new DomainError("withdrawalChanged");
}

async function complete(id: string, from: WithdrawalStatus, note?: string) {
  await db.$transaction(async (tx) => {
    await move(tx, id, from, "COMPLETED", { completedAt: new Date(), ...(note ? { note } : {}) });
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
    await enqueueEmail(tx, await sellerUser(tx, w.sellerId), {
      template: "withdrawal-completed",
      params: { amountIdr: w.amountIdr, account: maskAccount(w.accountNumber) },
    });
  });
}

/** The money didn't leave: put it back in the seller's balance. */
async function giveBack(id: string, from: WithdrawalStatus, to: "FAILED" | "REJECTED", note: string) {
  await db.$transaction(async (tx) => {
    await move(tx, id, from, to, { note });
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id } });
    await tx.balanceEntry.create({ data: { sellerId: w.sellerId, type: "WITHDRAWAL_RETURNED", amountIdr: w.amountIdr, withdrawalId: id } });
    await enqueueEmail(tx, await sellerUser(tx, w.sellerId), {
      template: "withdrawal-failed",
      params: { amountIdr: w.amountIdr, rejected: to === "REJECTED", note },
    });
  });
}

/**
 * Hand a SENDING withdrawal to the provider. Anything but a clear "accepted"
 * stops at NEEDS_ATTENTION, which is also where every withdrawal waits when
 * payouts are made by hand.
 */
export async function sendWithdrawal(id: string) {
  const w = await db.withdrawal.findUnique({ where: { id } });
  if (!w || w.status !== "SENDING") return;
  if (payouts.mode === "manual") {
    // Nothing to call: it now waits for an admin to transfer it and mark it paid.
    await db.withdrawal.updateMany({ where: { id, status: "SENDING" }, data: { status: "NEEDS_ATTENTION" } });
    return;
  }
  try {
    const sent = await payouts.send({ withdrawalId: w.id, bank: w.bank, account: w.accountNumber, name: w.accountName, amountIdr: w.amountIdr });
    await db.withdrawal.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "PROCESSING", providerRef: sent.reference, sentAt: new Date() },
    });
  } catch (err) {
    if (!(err instanceof PayoutError)) console.error("[payouts] send failed", id, err);
    await db.withdrawal.updateMany({ where: { id, status: "SENDING" }, data: { status: "NEEDS_ATTENTION", note: err instanceof Error ? err.message : String(err) } });
    return;
  }
  await syncWithdrawal(id);
}

/** Follow a PROCESSING withdrawal at the provider. */
export async function syncWithdrawal(id: string) {
  const w = await db.withdrawal.findUnique({ where: { id } });
  if (!w || w.status !== "PROCESSING" || !w.providerRef) return w?.status ?? null;
  const status = await payouts.status(w.providerRef);
  try {
    if (status === "completed") await complete(id, "PROCESSING");
    if (status === "failed") await giveBack(id, "PROCESSING", "FAILED", "The bank transfer failed.");
  } catch (err) {
    if (!(err instanceof DomainError && err.code === "withdrawalChanged")) throw err;
  }
  return (await db.withdrawal.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

// Admin decisions ------------------------------------------------------------------

export async function approveWithdrawal(id: string, adminId: string) {
  await db.$transaction((tx) => move(tx, id, "PENDING_REVIEW", "SENDING", { reviewedById: adminId }));
  await sendWithdrawal(id);
}

export async function rejectWithdrawal(id: string, adminId: string, note: string) {
  await db.withdrawal.updateMany({ where: { id, status: "PENDING_REVIEW" }, data: { reviewedById: adminId } });
  await giveBack(id, "PENDING_REVIEW", "REJECTED", note);
}

/** The admin transferred the money. */
export async function markWithdrawalPaid(id: string, note: string) {
  await complete(id, "NEEDS_ATTENTION", note);
}

/** The admin confirmed no money left: return it to the balance. */
export async function markWithdrawalFailed(id: string, note: string) {
  await giveBack(id, "NEEDS_ATTENTION", "FAILED", note);
}

// Maintenance -------------------------------------------------------------------------

/** Follow payouts in progress, and flag sends that were interrupted. */
export async function runPayoutMaintenance(now = new Date()) {
  const processing = await db.withdrawal.findMany({ where: { status: "PROCESSING" }, select: { id: true }, take: 200 });
  let completed = 0;
  for (const w of processing) {
    try {
      if ((await syncWithdrawal(w.id)) === "COMPLETED") completed++;
    } catch (err) {
      console.error("[payouts] status check failed", w.id, err);
    }
  }
  // The process stopped between saving the request and hearing back from the provider.
  const stuck = await db.withdrawal.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
    data: { status: "NEEDS_ATTENTION", note: "Sending was interrupted before it was confirmed. Check whether the money went out before paying it." },
  });
  return { withdrawalsCompleted: completed, withdrawalsStuck: stuck.count };
}
