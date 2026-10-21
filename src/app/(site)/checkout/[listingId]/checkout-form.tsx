"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

const FIELDS = [
  { name: "fullName", label: "Full name", autoComplete: "name" },
  { name: "phone", label: "Phone", autoComplete: "tel", type: "tel" },
  { name: "line1", label: "Address line 1", autoComplete: "address-line1", wide: true },
  { name: "line2", label: "Address line 2 (optional)", autoComplete: "address-line2", wide: true },
  { name: "city", label: "City", autoComplete: "address-level2" },
  { name: "region", label: "State / province", autoComplete: "address-level1" },
  { name: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { name: "country", label: "Country", autoComplete: "country-name" },
] as const;

export function CheckoutForm({
  action,
  defaultName,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaultName: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="card space-y-4 p-6" noValidate>
      <h2 className="font-bold">Shipping address</h2>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name} className={"wide" in f && f.wide ? "sm:col-span-2" : undefined}>
            <Field label={f.label} name={f.name} error={state.fieldErrors?.[f.name]}>
              <input
                id={f.name}
                name={f.name}
                type={"type" in f ? f.type : "text"}
                autoComplete={f.autoComplete}
                defaultValue={f.name === "fullName" ? defaultName : undefined}
                maxLength={150}
                className="input"
                aria-invalid={!!state.fieldErrors?.[f.name]}
              />
            </Field>
          </div>
        ))}
      </div>
      <SubmitButton className="w-full py-3" pendingText="Reserving item…">
        Continue to payment
      </SubmitButton>
      <p className="text-center text-xs text-slate-500">The item is reserved for 30 minutes while you complete payment.</p>
    </form>
  );
}
