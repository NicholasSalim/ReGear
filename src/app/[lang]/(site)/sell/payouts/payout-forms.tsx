"use client";

import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { formatAmount, formatMoney } from "@/lib/format";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function WithdrawForm({ action, maxIdr }: { action: FormAction; maxIdr: number }) {
  const t = useT().payoutForms;
  return (
    <ActionForm action={action} confirm={t.confirmWithdraw} className="space-y-4">
      {(s) => (
        <>
          <FormMessage state={s} />
          {!s.ok && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="sm:w-64">
                <Field label={t.amount} name="amount" error={s.fieldErrors?.amount} hint={t.amountHint(formatMoney(maxIdr))}>
                  <input id="amount" name="amount" inputMode="numeric" defaultValue={formatAmount(maxIdr)} required className="input num" />
                </Field>
              </div>
              <SubmitButton pendingText={t.withdrawing} className="sm:mt-6">
                {t.withdraw}
              </SubmitButton>
            </div>
          )}
        </>
      )}
    </ActionForm>
  );
}
