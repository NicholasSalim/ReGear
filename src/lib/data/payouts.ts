import "server-only";
import { db } from "@/lib/db";
import { OPEN_WITHDRAWAL_STATUSES, type WithdrawalReviewReason } from "@/lib/constants";
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
      user: { select: { email: true } },
      verifications: { where: { status: "APPROVED" }, orderBy: { reviewedAt: "desc" as const }, take: 1, select: { legalName: true } },
    },
  };
  const [owed, inFlight, review, toPay, recent] = await Promise.all([
    db.balanceEntry.aggregate({ _sum: { amountIdr: true } }),
    db.withdrawal.aggregate({ where: { status: { in: OPEN_WITHDRAWAL_STATUSES } }, _sum: { amountIdr: true }, _count: true }),
    db.withdrawal.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" }, take: 50, include: { seller: sellerSelect } }),
    db.withdrawal.findMany({ where: { status: "NEEDS_ATTENTION" }, orderBy: { createdAt: "asc" }, take: 50, include: { seller: sellerSelect } }),
    db.withdrawal.findMany({
      where: { status: { notIn: ["PENDING_REVIEW", "NEEDS_ATTENTION"] } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { seller: { select: { displayName: true, slug: true } } },
    }),
  ]);
  const withReasons = <T extends { reviewReasons: string }>(rows: T[]) => rows.map((r) => ({ ...r, reasons: reasonsOf(r.reviewReasons) }));
  return {
    mode: payouts.mode,
    owedIdr: owed._sum.amountIdr ?? 0,
    inFlightIdr: inFlight._sum.amountIdr ?? 0,
    inFlightCount: inFlight._count,
    review: withReasons(review),
    toPay: withReasons(toPay),
    recent,
  };
}
