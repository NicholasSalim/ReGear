"use client";

import { useState } from "react";
import type { ActionState } from "@/lib/action";
import { DISPUTE_RESOLUTION_LABELS, DISPUTE_RESOLUTIONS } from "@/lib/constants";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function MessageForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="card space-y-3 p-4" resetOnSuccess>
      {(s) => (
        <>
          <FormMessage state={{ ...s, message: undefined }} />
          <Field label="Add a message or evidence description" name="body" error={s.fieldErrors?.body}>
            <textarea id="body" name="body" rows={4} maxLength={2000} className="input" />
          </Field>
          <SubmitButton>Send</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function ResolveForm({ action, totalCents }: { action: FormAction; totalCents: number }) {
  const [resolution, setResolution] = useState<string>("REFUND_BUYER");
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Resolution" name="resolution" error={s.fieldErrors?.resolution}>
            <select id="resolution" name="resolution" className="input" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {DISPUTE_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {DISPUTE_RESOLUTION_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          {resolution === "PARTIAL_REFUND" && (
            <Field label="Refund amount" name="refundCents" error={s.fieldErrors?.refundCents} hint={`Less than ${(totalCents / 100).toFixed(2)}`}>
              <input id="refundCents" name="refundCents" type="number" step="0.01" min="0.01" className="input" />
            </Field>
          )}
          <Field label="Decision note (shared with both parties)" name="note" error={s.fieldErrors?.note}>
            <textarea id="note" name="note" rows={3} maxLength={2000} className="input" />
          </Field>
          <SubmitButton variant="danger">Resolve dispute</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
