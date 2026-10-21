"use client";

import { useLocale } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { useState } from "react";
import type { ActionState } from "@/lib/action";
import { CARRIERS, DISPUTE_REASON_LABELS, DISPUTE_REASONS, RETURN_REASON_LABELS, RETURN_REASONS } from "@/lib/constants";
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
  return <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4">{children}</div>;
}

export function ShipForm({ action, title = "Add shipment tracking", submit = "Mark as shipped" }: { action: FormAction; title?: string; submit?: string }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">{title}</h3>
          <FormMessage state={s} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Carrier" name="carrier" error={s.fieldErrors?.carrier}>
              <select id="carrier" name="carrier" className="input" defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {CARRIERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Tracking number" name="trackingNumber" error={s.fieldErrors?.trackingNumber}>
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
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Reason (optional)" name="reason">
            <input id="reason" name="reason" maxLength={300} className="input" />
          </Field>
          <SubmitButton variant="danger">Confirm cancellation</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReturnRequestForm({ action, daysLeft }: { action: FormAction; daysLeft: number }) {
  const locale = useLocale();
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">Request a return</h3>
          <p className="text-sm text-slate-600">{daysLeft} day(s) left in your return window.</p>
          <FormMessage state={s} />
          <Field label="Reason" name="reason" error={s.fieldErrors?.reason}>
            <select id="reason" name="reason" className="input" defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {pick(RETURN_REASON_LABELS[r], locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Details" name="details" error={s.fieldErrors?.details} hint="Reference specific items from the condition report.">
            <textarea id="details" name="details" rows={4} maxLength={2000} className="input" />
          </Field>
          <SubmitButton>Submit return request</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReturnResponseForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Note to buyer" name="note" error={s.fieldErrors?.note} hint="Required when rejecting. Include the return address when approving.">
            <textarea id="note" name="note" rows={3} maxLength={1000} className="input" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton name="decision" value="approve">
              Approve return
            </SubmitButton>
            <SubmitButton name="decision" value="reject" variant="danger">
              Reject
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function DisputeForm({ action, allowNotReceived }: { action: FormAction; allowNotReceived: boolean }) {
  const locale = useLocale();
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">Open a dispute</h3>
          <p className="text-sm text-slate-600">Payment is frozen while a ReGear specialist reviews the case. Both parties can add evidence.</p>
          <FormMessage state={s} />
          <Field label="What went wrong?" name="reason" error={s.fieldErrors?.reason}>
            <select id="reason" name="reason" className="input" defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {DISPUTE_REASONS.filter((r) => allowNotReceived || r !== "NOT_RECEIVED").map((r) => (
                <option key={r} value={r}>
                  {pick(DISPUTE_REASON_LABELS[r], locale)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Describe the problem" name="description" error={s.fieldErrors?.description}>
            <textarea id="description" name="description" rows={5} maxLength={3000} className="input" />
          </Field>
          <SubmitButton variant="danger">Open dispute</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ReviewForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <h3 className="font-semibold">Rate the seller</h3>
          <FormMessage state={s} />
          <fieldset>
            <legend className="label">Rating</legend>
            <div className="flex gap-3">
              {[5, 4, 3, 2, 1].map((n) => (
                <label key={n} className="flex items-center gap-1 text-sm">
                  <input type="radio" name="rating" value={n} defaultChecked={n === 5} className="accent-brand-600" />
                  {n}★
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Comment (optional)" name="comment" error={s.fieldErrors?.comment}>
            <textarea id="comment" name="comment" rows={3} maxLength={1000} className="input" />
          </Field>
          <SubmitButton>Submit review</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

