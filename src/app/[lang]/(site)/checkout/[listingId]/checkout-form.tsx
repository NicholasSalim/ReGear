"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Link, useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { saveAddressAction } from "@/actions/addresses";
import { AddressCard, type BookAddress } from "@/components/address-card";
import { AddressForm } from "@/components/address-form";
import { FormMessage, SubmitButton, useActionForm } from "@/components/forms";
import { Button } from "@/components/ui";
import { RichText } from "@/components/rich-text";

export function CheckoutForm({
  action,
  addresses,
  defaultName,
  holdMinutes,
  limit,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  addresses: BookAddress[];
  defaultName: string;
  holdMinutes: number;
  limit: number;
}) {
  const { state, pending, formProps } = useActionForm(action);
  const t = useT().checkoutForm;
  const ta = useT().address;
  const [selected, setSelected] = useState<string | null>(addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null);
  const [adding, setAdding] = useState(addresses.length === 0);
  // A newly saved address shows up after the page refreshes; until then, keep the old choice valid.
  const chosen = addresses.some((a) => a.id === selected) ? selected : (addresses[0]?.id ?? null);

  return (
    <div className="card space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{t.shippingAddress}</h2>
        {addresses.length > 0 && (
          <Link href="/account/addresses" className="text-sm font-medium text-brand-700 hover:underline">
            {t.manageAddresses}
          </Link>
        )}
      </div>

      {addresses.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="sr-only">{t.chooseAddress}</legend>
          {addresses.map((a) => (
            <label key={a.id} className="block cursor-pointer">
              <AddressCard address={a} selected={chosen === a.id}>
                <span className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm font-medium">
                  <input type="radio" name="addressChoice" checked={chosen === a.id} onChange={() => setSelected(a.id)} className="size-4 accent-brand-600" />
                  {t.sendHere}
                </span>
              </AddressCard>
            </label>
          ))}
        </fieldset>
      )}

      {adding ? (
        <div className="rounded-lg border border-slate-200 p-4">
          <h3 className="mb-4 font-semibold">{addresses.length ? ta.newAddress : t.firstAddress}</h3>
          <AddressForm
            action={saveAddressAction.bind(null, null)}
            defaultName={defaultName}
            onSaved={(id) => {
              setSelected(id);
              setAdding(false);
            }}
            onCancel={addresses.length ? () => setAdding(false) : undefined}
          />
        </div>
      ) : (
        addresses.length < limit && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> {ta.addAddress}
          </Button>
        )
      )}

      <form {...formProps} className="space-y-4 border-t border-slate-100 pt-4">
        <FormMessage state={state} />
        <input type="hidden" name="addressId" value={chosen ?? ""} />
        <p className="text-xs text-slate-600">
          <RichText text={t.privacyNote} newTab />
        </p>
        <SubmitButton pending={pending} disabled={!chosen || adding} className="w-full py-3" pendingText={t.reserving}>
          {t.continue}
        </SubmitButton>
        <p className="text-center text-xs text-slate-500">{t.reservedNote(holdMinutes)}</p>
      </form>
    </div>
  );
}
