"use client";

import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { GroupedDigitsInput } from "@/components/smart-inputs";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Where money is sent: a seller's withdrawals, or a buyer's bank-transfer refund. */
export function BankAccountForm({
  action,
  banks,
  replacing,
  submit,
}: {
  action: FormAction;
  banks: { code: string; name: string }[];
  /** There's an account already; this form changes it. */
  replacing: boolean;
  /** Label for saving a first account. */
  submit?: string;
}) {
  const dict = useT();
  const t = dict.payoutForms;
  return (
    <ActionForm action={action} confirm={replacing ? t.confirmReplaceAccount : undefined} className="space-y-4">
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
              <GroupedDigitsInput id="accountNumber" name="accountNumber" autoComplete="off" maxDigits={20} required className="input" />
            </Field>
          </div>
          <Field label={t.accountName} name="accountName" error={s.fieldErrors?.accountName} hint={t.accountNameHint}>
            <input id="accountName" name="accountName" autoComplete="name" maxLength={100} required className="input" />
          </Field>
          <SubmitButton pendingText={t.checking} variant={replacing ? "secondary" : "primary"}>
            {replacing ? t.changeAccount : (submit ?? t.saveAccount)}
          </SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
