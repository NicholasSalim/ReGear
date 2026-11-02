"use server";

import { invalidate } from "@/lib/cache";
import { actionI18n, runAction, type ActionState } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import * as offers from "@/lib/offers";
import { id as idSchema } from "@/lib/validation";

/** Rupiah as typed: digits, optionally grouped with dots, commas or spaces ("4.500.000"). */
function parseAmount(raw: FormDataEntryValue | null): number | null {
  const digits = String(raw ?? "").replace(/[.,\s]/g, "");
  if (!/^\d{1,12}$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function makeOfferAction(listingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    if (!user.emailVerified) return { error: t.domain.emailUnverified };
    idSchema.parse(listingId);
    const limited = await rateLimit(`offer:${user.id}`, 20, 3600);
    if (!limited.ok) return { error: t.actions.offerLimitRate };
    const amount = parseAmount(formData.get("amount"));
    if (!amount) return { error: t.actions.offerAmount, fieldErrors: { amount: t.actions.offerAmount } };
    const res = await offers.makeOffer(user.id, listingId, amount, String(formData.get("message") ?? "").trim());
    invalidate(res.tags);
    return { ok: true, message: t.actions.offerSent };
  });
}

export async function withdrawOfferAction(offerId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    idSchema.parse(offerId);
    const res = await offers.withdrawOffer(user.id, offerId);
    invalidate(res.tags);
    return { ok: true, message: t.actions.offerWithdrawn };
  });
}

/** The seller's answer; the submit button sends decision=accept or decision=decline. */
export async function answerOfferAction(offerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    idSchema.parse(offerId);
    const decision = formData.get("decision");
    if (decision !== "accept" && decision !== "decline") return { error: t.domain.genericError };
    const res = await offers.answerOffer(user.id, offerId, decision === "accept");
    invalidate(res.tags);
    return { ok: true, message: decision === "accept" ? t.actions.offerAccepted : t.actions.offerDeclined };
  });
}
