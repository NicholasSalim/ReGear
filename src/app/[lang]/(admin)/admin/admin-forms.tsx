"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { BAN_LENGTHS } from "@/lib/constants";
import type { ActionState } from "@/lib/action";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function VerificationDecisionForm({ action, id }: { action: FormAction; id: string }) {
  const t = useT().adminForms;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <Field label={t.noteToSeller} name={`note-${id}`} error={s.fieldErrors?.note} hint={t.noteHint}>
              <textarea id={`note-${id}`} name="note" rows={2} maxLength={500} className="input" />
            </Field>
            <div className="flex gap-2">
              <SubmitButton name="decision" value="approve">{t.approve}</SubmitButton>
              <SubmitButton name="decision" value="reject" variant="danger">{t.reject}</SubmitButton>
            </div>
          </>
        )
      }
    </ActionForm>
  );
}

export function ModerateForm({ action }: { action: FormAction }) {
  const t = useT().adminForms;
  return (
    <ActionForm action={action} confirm={t.confirmRemove} className="flex flex-wrap items-start gap-2">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <input name="reason" required minLength={5} maxLength={500} placeholder={t.removalReason} aria-label={t.removalReason} className="input max-w-56 py-1" />
            <SubmitButton variant="danger" className="px-3 py-1.5">{t.remove}</SubmitButton>
            {(s.fieldErrors?.reason ?? s.error) && <p className="w-full text-xs text-rose-600">{s.fieldErrors?.reason ?? s.error}</p>}
          </>
        )
      }
    </ActionForm>
  );
}

/** Approve or reject a withdrawal held for review. */
export function WithdrawalReviewForm({ action, id }: { action: FormAction; id: string }) {
  const t = useT().payoutForms;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <Field label={t.note} name={`note-${id}`} error={s.fieldErrors?.note} hint={t.reviewNoteHint}>
              <textarea id={`note-${id}`} name="note" rows={2} maxLength={500} className="input" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="step" value="approve">{t.approve}</SubmitButton>
              <SubmitButton name="step" value="reject" variant="danger">{t.reject}</SubmitButton>
            </div>
          </>
        )
      }
    </ActionForm>
  );
}

/** Record a bank-transfer refund the admin sent. */
export function RefundSentForm({ action, id }: { action: FormAction; id: string }) {
  const t = useT().payoutForms;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <Field label={t.note} name={`note-${id}`} error={s.fieldErrors?.note} hint={t.refundNoteHint}>
              <textarea id={`note-${id}`} name="note" rows={2} maxLength={500} required minLength={5} className="input" />
            </Field>
            <SubmitButton>{t.markRefunded}</SubmitButton>
          </>
        )
      }
    </ActionForm>
  );
}

/** Record how a withdrawal waiting to be paid by hand ended. */
export function WithdrawalPayForm({ action, id }: { action: FormAction; id: string }) {
  const t = useT().payoutForms;
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <Field label={t.note} name={`note-${id}`} error={s.fieldErrors?.note} hint={t.attentionNoteHint}>
              <textarea id={`note-${id}`} name="note" rows={2} maxLength={500} className="input" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="step" value="mark_paid">{t.markPaid}</SubmitButton>
              <SubmitButton name="step" value="mark_failed" variant="danger">{t.markFailed}</SubmitButton>
            </div>
          </>
        )
      }
    </ActionForm>
  );
}

/** Ban an account, or change how long its ban lasts (`banned`). */
export function BanForm({ action, banned }: { action: FormAction; banned: boolean }) {
  const t = useT().adminForms;
  const [length, setLength] = useState<string>("7");
  return (
    <ActionForm action={action} confirm={banned ? undefined : t.banConfirm} className="space-y-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <Field label={t.banLength} name="length" error={s.fieldErrors?.length}>
              <select id="length" name="length" value={length} onChange={(e) => setLength(e.target.value)} className="input">
                {BAN_LENGTHS.map((l) => (
                  <option key={l} value={l}>
                    {t.banLengths[l]}
                  </option>
                ))}
              </select>
            </Field>
            {length === "custom" && (
              <Field label={t.banUntil} name="until" error={s.fieldErrors?.until}>
                <input id="until" name="until" type="date" required className="input" />
              </Field>
            )}
            <Field label={t.banReason} name="reason" error={s.fieldErrors?.reason} hint={t.banReasonHint}>
              <textarea id="reason" name="reason" rows={2} required minLength={5} maxLength={500} className="input" />
            </Field>
            <SubmitButton variant="danger">{banned ? t.banChange : t.ban}</SubmitButton>
          </>
        )
      }
    </ActionForm>
  );
}
