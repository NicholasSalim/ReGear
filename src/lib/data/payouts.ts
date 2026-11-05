import "server-only";
import { db } from "@/lib/db";
import { OPEN_WITHDRAWAL_STATUSES, type WithdrawalReviewReason, type WithdrawalStatus } from "@/lib/constants";
import { dayRange, like, type AdminSearch } from "@/lib/admin/search";
import type { Prisma } from "@/generated/prisma/client";
import { payouts } from "@/lib/payouts/provider";
import { sellerBalance } from "@/lib/payouts/service";

// Read models for the seller and admin payout pages. Money is always read
// fresh: these pages are private and never cached.

export async function getSellerPayouts(sellerId: string) {
  const [balance, open, entries, withdrawals] = await Promise.all([
    sellerBalance(sellerId),
    db.withdrawal.aggregate({ where: { sellerId, status: { in: OPEN_WITHDRAWAL_STATUSES } }, _sum: { amountIdr: true }, _count: true }),
    db.balanceEntry.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, type: true, amountIdr: true, createdAt: true, order: { select: { id: true, number: true } } },
    }),
    db.withdrawal.findMany({
      where: { sellerId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amountIdr: true, status: true, bank: true, accountNumber: true, createdAt: true, completedAt: true },
    }),
  ]);
  return { balance, beingWithdrawn: open._sum.amountIdr ?? 0, hasOpenWithdrawal: open._count > 0, entries, withdrawals };
}

const reasonsOf = (json: string) => {
  try {
    return JSON.parse(json) as WithdrawalReviewReason[];
  } catch {
    return [];
  }
};

export async function getAdminPayouts() {
  const sellerSelect = {
    select: {
      displayName: true,
      slug: true,
      userId: true,
      user: { select: { email: true } },
      verifications: { where: { status: "APPROVED" }, orderBy: { reviewedAt: "desc" as const }, take: 1, select: { legalName: true } },
    },
  };
  const [owed, inFlight, review, toPay] = await Promise.all([
    db.balanceEntry.aggregate({ _sum: { amountIdr: true } }),
    db.withdrawal.aggregate({ where: { status: { in: OPEN_WITHDRAWAL_STATUSES } }, _sum: { amountIdr: true }, _count: true }),
    db.withdrawal.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" }, take: 50, include: { seller: sellerSelect } }),
    db.withdrawal.findMany({ where: { status: "NEEDS_ATTENTION" }, orderBy: { createdAt: "asc" }, take: 50, include: { seller: sellerSelect } }),
  ]);
  const withReasons = <T extends { reviewReasons: string }>(rows: T[]) => rows.map((r) => ({ ...r, reasons: reasonsOf(r.reviewReasons) }));
  return {
    mode: payouts.mode,
    owedIdr: owed._sum.amountIdr ?? 0,
    inFlightIdr: inFlight._sum.amountIdr ?? 0,
    inFlightCount: inFlight._count,
    review: withReasons(review),
    toPay: withReasons(toPay),
  };
}

/** Every withdrawal, newest first, matching an admin search. */
export async function getWithdrawalHistory(s: AdminSearch<WithdrawalStatus>) {
  const digits = s.q.replace(/\D/g, "");
  const where: Prisma.WithdrawalWhereInput = {
    ...(s.status ? { status: s.status } : {}),
    ...(dayRange(s) ? { createdAt: dayRange(s) } : {}),
    ...(s.q
      ? {
          OR: [
            { id: s.q },
            { providerRef: s.q },
            { accountName: like(s.q) },
            ...(digits.length >= 4 ? [{ accountNumber: { contains: digits } }] : []),
            { seller: { displayName: like(s.q) } },
            { seller: { user: { email: like(s.q) } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: s.skip,
      take: s.take,
      include: { seller: { select: { displayName: true, userId: true } } },
    }),
    db.withdrawal.count({ where }),
  ]);
  return { rows, total };
}
