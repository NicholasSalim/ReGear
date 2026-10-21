"use client";

import type { ActionState } from "@/lib/action";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function VerificationDecisionForm({ action, id }: { action: FormAction; id: string }) {
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <FormMessage state={s} />
            <Field label="Note to seller" name={`note-${id}`} error={s.fieldErrors?.note} hint="Required when rejecting.">
              <textarea id={`note-${id}`} name="note" rows={2} maxLength={500} className="input" />
            </Field>
            <div className="flex gap-2">
              <SubmitButton name="decision" value="approve">Approve</SubmitButton>
              <SubmitButton name="decision" value="reject" variant="danger">Reject</SubmitButton>
            </div>
          </>
        )
      }
    </ActionForm>
  );
}

export function ModerateForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="flex flex-wrap items-start gap-2">
      {(s) =>
        s.ok ? (
          <FormMessage state={s} />
        ) : (
          <>
            <input name="reason" required minLength={5} maxLength={500} placeholder="Removal reason" aria-label="Removal reason" className="input max-w-56 py-1" />
            <SubmitButton variant="danger" className="px-3 py-1.5">Remove</SubmitButton>
            {s.error && <p className="w-full text-xs text-rose-600">{s.error}</p>}
          </>
        )
      }
    </ActionForm>
  );
}
