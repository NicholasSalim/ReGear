"use client";

import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";
import { Field } from "@/components/ui";
import { RichText } from "@/components/rich-text";

const FIELDS = [
  { name: "fullName", autoComplete: "name" },
  { name: "phone", autoComplete: "tel", type: "tel" },
  { name: "line1", autoComplete: "address-line1", wide: true },
  { name: "line2", autoComplete: "address-line2", wide: true },
  { name: "city", autoComplete: "address-level2" },
  { name: "region", autoComplete: "address-level1" },
  { name: "postalCode", autoComplete: "postal-code" },
  { name: "country", autoComplete: "country-name" },
] as const;

export function CheckoutForm({
  action,
  defaultName,
  holdMinutes,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaultName: string;
  holdMinutes: number;
}) {
  const { state, pending, formProps } = useActionForm(action);
  const t = useT().checkoutForm;
  return (
    <form {...formProps} className="card space-y-4 p-6">
      <h2 className="font-bold">{t.shippingAddress}</h2>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name} className={"wide" in f && f.wide ? "sm:col-span-2" : undefined}>
            <Field label={t.fields[f.name]} name={f.name} error={state.fieldErrors?.[f.name]}>
              <input
                id={f.name}
                name={f.name}
                type={"type" in f ? f.type : "text"}
                autoComplete={f.autoComplete}
                defaultValue={f.name === "fullName" ? defaultName : f.name === "country" ? "Indonesia" : undefined}
                maxLength={150}
                className="input"
                aria-invalid={!!state.fieldErrors?.[f.name]}
              />
            </Field>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600">
        <RichText text={t.privacyNote} newTab />
      </p>
      <SubmitButton pending={pending} className="w-full py-3" pendingText={t.reserving}>
        {t.continue}
      </SubmitButton>
      <p className="text-center text-xs text-slate-500">{t.reservedNote(holdMinutes)}</p>
    </form>
  );
}
