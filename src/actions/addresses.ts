"use server";

import { refresh } from "next/cache";
import { actionI18n, formToObject, runAction, type ActionState } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { deleteAddress, saveAddress, setDefaultAddress } from "@/lib/addresses";
import { rateLimit } from "@/lib/security/rate-limit";
import { id as idSchema, savedAddressSchema } from "@/lib/validation";

/** Add an address (addressId null) or update one of the user's own. */
export async function saveAddressAction(addressId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    if (addressId) idSchema.parse(addressId);
    const limited = await rateLimit(`address:${user.id}`, 30, 3600);
    if (!limited.ok) return { error: t.actions.addressLimit };

    const input = savedAddressSchema.parse(formToObject(formData));
    const result = await saveAddress(user.id, input, addressId ?? undefined);
    if (!result.ok) {
      if (result.reason === "region") return { fieldErrors: { districtCode: t.validation.region } };
      if (result.reason === "limit") return { error: t.actions.addressBookFull };
      return { error: t.actions.addressNotFound };
    }
    refresh();
    return { ok: true, message: t.actions.addressSaved, id: result.id };
  });
}

export async function deleteAddressAction(addressId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    idSchema.parse(addressId);
    if (!(await deleteAddress(user.id, addressId))) return { error: t.actions.addressNotFound };
    refresh();
    return { ok: true, message: t.actions.addressDeleted };
  });
}

export async function setDefaultAddressAction(addressId: string, _prev?: ActionState, _formData?: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUserStrict();
    const { t } = await actionI18n();
    idSchema.parse(addressId);
    if (!(await setDefaultAddress(user.id, addressId))) return { error: t.actions.addressNotFound };
    refresh();
    return { ok: true, message: t.actions.addressDefaultSet };
  });
}
