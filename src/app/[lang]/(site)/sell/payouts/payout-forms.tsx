"use client";

import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { formatAmount, formatMoney } from "@/lib/format";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function PayoutAccountForm({
  action,
  banks,
  replacing,
}: {
  action: FormAction;
  banks: { code: string; name: string }[];
  /** The seller already has an account; this form changes it. */
  replacing: boolean;
}) {
  const dict = useT();
  const t = dict.payoutForms;
  return (
    <ActionForm action={action} className="space-y-4">
      {(s) => (
        <>
          <FormMessage state={s} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t.bank} name="bank" error={s.fieldErrors?.bank}>
              <select id="bank" name="bank" defaultValue="" required className="input">
                <option value="" disabled>
                  {dict.forms.choose}
                </option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.accountNumber} name="accountNumber" error={s.fieldErrors?.accountNumber}>
              <input id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" maxLength={30} required className="input" />
            </Field>
          </div>
          <Field label={t.accountName} name="accountName" error={s.fieldErrors?.accountName} hint={t.accountNameHint}>
            <input id="accountName" name="accountName" autoComplete="name" maxLength={100} required className="input" />
          </Field>
          <SubmitButton pendingText={t.checking} variant={replacing ? "secondary" : "primary"}>
            {replacing ? t.changeAccount : t.saveAccount}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

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
