"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useT } from "@/i18n/client";
import { deleteAddressAction, saveAddressAction, setDefaultAddressAction } from "@/actions/addresses";
import { AddressCard, type BookAddress } from "@/components/address-card";
import { AddressForm } from "@/components/address-form";
import { ActionButton } from "@/components/forms";
import { Button, EmptyState } from "@/components/ui";

export function AddressBook({ addresses, defaultName, limit }: { addresses: BookAddress[]; defaultName: string; limit: number }) {
  const t = useT().address;
  // "new", an address id, or null when nothing is open.
  const [editing, setEditing] = useState<string | null>(addresses.length === 0 ? "new" : null);

  return (
    <div className="space-y-4">
      {addresses.length === 0 && editing !== "new" && <EmptyState title={t.empty} />}
      {addresses.map((a) =>
        editing === a.id ? (
          <div key={a.id} className="card p-5">
            <AddressForm action={saveAddressAction.bind(null, a.id)} initial={a} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <AddressCard key={a.id} address={a}>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" className="px-3 py-1.5" onClick={() => setEditing(a.id)}>
                {t.edit}
              </Button>
              {!a.isDefault && (
                <ActionButton action={setDefaultAddressAction.bind(null, a.id)} variant="ghost" className="px-3 py-1.5">
                  {t.setDefault}
                </ActionButton>
              )}
              <ActionButton action={deleteAddressAction.bind(null, a.id)} variant="ghost" confirm={t.confirmDelete} className="px-3 py-1.5 text-rose-700">
                {t.delete}
              </ActionButton>
            </div>
          </AddressCard>
        ),
      )}
      {editing === "new" ? (
        <div className="card p-5">
          <h2 className="mb-4 font-bold">{t.newAddress}</h2>
          <AddressForm
            action={saveAddressAction.bind(null, null)}
            defaultName={defaultName}
            onSaved={() => setEditing(null)}
            onCancel={addresses.length ? () => setEditing(null) : undefined}
          />
        </div>
      ) : (
        addresses.length < limit && (
          <Button variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden /> {t.addAddress}
          </Button>
        )
      )}
    </div>
  );
}
