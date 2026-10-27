"use client";

import { useT } from "@/i18n/client";
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
    <ActionForm action={action} className="flex flex-wrap items-start gap-2">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <input name="reason" required minLength={5} maxLength={500} placeholder={t.removalReason} aria-label={t.removalReason} className="input max-w-56 py-1" />
            <SubmitButton variant="danger" className="px-3 py-1.5">{t.remove}</SubmitButton>
            {s.error && <p className="w-full text-xs text-rose-600">{s.error}</p>}
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
