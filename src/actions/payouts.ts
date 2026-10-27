"use server";

import { refresh } from "next/cache";
import { forbidden } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { actionI18n, formToObject, runAction, type ActionState } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import * as payouts from "@/lib/payouts/service";
import { id as idSchema, payoutAccountSchema, text, withdrawalSchema } from "@/lib/validation";

// Payout pages read balances and withdrawals uncached, so there are no cache
// tags to invalidate; refresh() re-renders the page with the new state.

export async function savePayoutAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    const limited = await rateLimit(`payout-account:${user.id}`, 10, 86_400);
    if (!limited.ok) return { error: t.actions.passwordLimit };
    const input = payoutAccountSchema.parse(formToObject(formData));
    const saved = await payouts.setPayoutAccount(user.id, input);
    await audit(user.id, "payout.account_set", "SellerProfile", saved.sellerId, { bank: input.bank, last4: input.accountNumber.slice(-4) });
    refresh();
    return { ok: true, message: t.actions.payoutAccountSaved(saved.accountName) };
  });
}

export async function requestWithdrawalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    const limited = await rateLimit(`withdraw:${user.id}`, 10, 3600);
    if (!limited.ok) return { error: t.actions.passwordLimit };
    const { amount } = withdrawalSchema.parse(formToObject(formData));
    const w = await payouts.requestWithdrawal(user.id, amount);
    await audit(user.id, "withdrawal.request", "Withdrawal", w.id, { amountIdr: amount, status: w.status });
    refresh();
    const message =
      w.status === "PENDING_REVIEW" ? t.actions.withdrawalInReview : w.status === "NEEDS_ATTENTION" ? t.actions.withdrawalQueued : t.actions.withdrawalSent;
    return { ok: true, message };
  });
}

// Admin -----------------------------------------------------------------------

async function requireAdminStrict() {
  const user = await requireUserStrict();
  if (user.role !== "ADMIN") forbidden();
  return user;
}

const DECISIONS = ["approve", "reject", "mark_paid", "mark_failed"] as const;

/** An admin decision on a withdrawal, named by the button pressed. Reject and the two "mark" steps need a note for the record. */
export async function withdrawalDecisionAction(withdrawalId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const admin = await requireAdminStrict();
    const { t } = await actionI18n();
    idSchema.parse(withdrawalId);
    const step = z.enum(DECISIONS).parse(formData.get("step"));
    const note = text(0, 500).parse(formData.get("note") ?? "");
    if (step !== "approve" && note.length < 5) return { fieldErrors: { note: t.actions.noteRequired } };

    if (step === "approve") await payouts.approveWithdrawal(withdrawalId, admin.id);
    if (step === "reject") await payouts.rejectWithdrawal(withdrawalId, admin.id, note);
    if (step === "mark_paid") await payouts.markWithdrawalPaid(withdrawalId, note);
    if (step === "mark_failed") await payouts.markWithdrawalFailed(withdrawalId, note);
    await audit(admin.id, `withdrawal.${step}`, "Withdrawal", withdrawalId, note ? { note } : {});
    refresh();
    const messages = {
      approve: t.actions.withdrawalApproved,
      reject: t.actions.withdrawalRejected,
      mark_paid: t.actions.withdrawalMarkedPaid,
      mark_failed: t.actions.withdrawalMarkedFailed,
    };
    return { ok: true, message: messages[step] };
  });
}
