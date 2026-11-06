"use client";

import { GrowingTextarea } from "@/components/smart-inputs";
import { useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import type { ActionState } from "@/lib/action";
import { DISPUTE_RESOLUTION_LABELS, DISPUTE_RESOLUTIONS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function MessageForm({ action }: { action: FormAction }) {
  const t = useT().disputeForms;
  return (
    <ActionForm action={action} className="card space-y-3 p-4" resetOnSuccess>
      {(s) => (
        <>
          <FormMessage state={{ ...s, message: undefined }} />
          <Field label={t.addMessage} name="body" error={s.fieldErrors?.body}>
            <GrowingTextarea id="body" name="body" rows={4} maxLength={2000} className="input" />
          </Field>
          <SubmitButton>{t.send}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

/** `maxRefundIdr` is exclusive: the seller keeps a positive payout. */
export function ResolveForm({ action, maxRefundIdr }: { action: FormAction; maxRefundIdr: number }) {
  const locale = useLocale();
  const t = useT().disputeForms;
  const [resolution, setResolution] = useState<string>("REFUND_BUYER");
  return (
    <ActionForm action={action} className="space-y-3">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label={t.resolution} name="resolution" error={s.fieldErrors?.resolution}>
            <select id="resolution" name="resolution" className="input" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {DISPUTE_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {pick(DISPUTE_RESOLUTION_LABELS[r], locale)}
                </option>
              ))}
            </select>
          </Field>
          {resolution === "PARTIAL_REFUND" && (
            <Field label={t.refundAmount} name="refundIdr" error={s.fieldErrors?.refundIdr} hint={t.lessThan(formatMoney(maxRefundIdr))}>
              <input id="refundIdr" name="refundIdr" inputMode="numeric" placeholder={t.amountPlaceholder} className="input" />
            </Field>
          )}
          <Field label={t.decisionNote} name="note" error={s.fieldErrors?.note}>
            <GrowingTextarea id="note" name="note" rows={3} maxLength={2000} className="input" />
          </Field>
          <SubmitButton variant="danger">{t.resolve}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
