"use client";

import { GrowingTextarea } from "@/components/smart-inputs";
import { useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import type { ActionState } from "@/lib/action";
import { CARRIER_LABELS, CARRIERS, DISPUTE_REASON_LABELS, DISPUTE_REASONS, RETURN_REASON_LABELS, RETURN_REASONS } from "@/lib/constants";
import { ActionButton, ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Button, Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export { ActionButton };

/** Disclosure wrapper so secondary forms don't clutter the order page. */
export function Reveal({ label, variant = "secondary", children }: { label: string; variant?: "secondary" | "danger" | "ghost"; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return <div className="reveal w-full rounded-xl border border-slate-200 bg-slate-50 p-4">{children}</div>;
}

export function ShipForm({ action, title, submit }: { action: FormAction; title: string; submit: string }) {
  const locale = useLocale();
  const all = useT();
  const t = all.orderActions;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">{title}</h3>
          <FormMessage state={s} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t.carrier} name="carrier" error={s.fieldErrors?.carrier}>
              <select id="carrier" name="carrier" className="input" defaultValue="">
                <option value="" disabled>
                  {all.forms.choose}
                </option>
                {CARRIERS.map((c) => {
                  const label = CARRIER_LABELS[c];
                  return (
                    <option key={c} value={c}>
                      {label ? pick(label, locale) : c}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label={t.tracking} name="trackingNumber" error={s.fieldErrors?.trackingNumber}>
              <input id="trackingNumber" name="trackingNumber" className="input" maxLength={40} autoComplete="off" />
            </Field>
          </div>
          <SubmitButton>{submit}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function CancelForm({ action }: { action: FormAction }) {
  const t = useT().orderActions;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label={t.reasonOptional} name="reason">
            <input id="reason" name="reason" maxLength={300} className="input" />
          </Field>
          <SubmitButton variant="danger">{t.confirmCancel}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReturnRequestForm({ action, daysLeft }: { action: FormAction; daysLeft: number }) {
  const locale = useLocale();
  const all = useT();
  const t = all.orderActions;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">{t.requestReturn}</h3>
          <p className="text-sm text-slate-600">{t.daysLeft(daysLeft)}</p>
          <FormMessage state={s} />
          <Field label={t.reason} name="reason" error={s.fieldErrors?.reason}>
            <select id="reason" name="reason" className="input" defaultValue="">
              <option value="" disabled>
                {all.forms.choose}
              </option>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {pick(RETURN_REASON_LABELS[r], locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.details} name="details" error={s.fieldErrors?.details} hint={t.detailsHint}>
            <GrowingTextarea id="details" name="details" rows={4} maxLength={2000} className="input" />
          </Field>
          <SubmitButton>{t.submitReturn}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReturnResponseForm({ action }: { action: FormAction }) {
  const t = useT().orderActions;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label={t.noteToBuyer} name="note" error={s.fieldErrors?.note} hint={t.noteHint}>
            <GrowingTextarea id="note" name="note" rows={3} maxLength={1000} className="input" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton name="decision" value="approve">
              {t.approve}
            </SubmitButton>
            <SubmitButton name="decision" value="reject" variant="danger">
              {t.reject}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function DisputeForm({ action, allowNotReceived }: { action: FormAction; allowNotReceived: boolean }) {
  const locale = useLocale();
  const all = useT();
  const t = all.orderActions;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">{t.openDispute}</h3>
          <p className="text-sm text-slate-600">{t.disputeIntro}</p>
          <FormMessage state={s} />
          <Field label={t.whatWentWrong} name="reason" error={s.fieldErrors?.reason}>
            <select id="reason" name="reason" className="input" defaultValue="">
              <option value="" disabled>
                {all.forms.choose}
              </option>
              {DISPUTE_REASONS.filter((r) => allowNotReceived || r !== "NOT_RECEIVED").map((r) => (
                <option key={r} value={r}>
                  {pick(DISPUTE_REASON_LABELS[r], locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.describe} name="description" error={s.fieldErrors?.description}>
            <GrowingTextarea id="description" name="description" rows={5} maxLength={3000} className="input" />
          </Field>
          <SubmitButton variant="danger">{t.openDisputeButton}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReviewForm({ action }: { action: FormAction }) {
  const t = useT().orderActions;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">{t.rateSeller}</h3>
          <FormMessage state={s} />
          <fieldset aria-describedby={s.fieldErrors?.rating ? "rating-error" : undefined}>
            <legend className="label">{t.rating}</legend>
            <div className="flex gap-3">
              {[5, 4, 3, 2, 1].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="rating" value={n} required className="accent-brand-600" />
                  {n}★
                </label>
              ))}
            </div>
            {s.fieldErrors?.rating && <p id="rating-error" className="mt-1 text-sm text-rose-600">{s.fieldErrors.rating}</p>}
          </fieldset>
          <Field label={t.commentOptional} name="comment" error={s.fieldErrors?.comment}>
            <GrowingTextarea id="comment" name="comment" rows={3} maxLength={1000} className="input" />
          </Field>
          <SubmitButton>{t.submitReview}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
