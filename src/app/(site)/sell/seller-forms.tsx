"use client";

import type { ActionState } from "@/lib/action";
import { ID_TYPE_LABELS, ID_TYPES } from "@/lib/constants";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function SellerProfileForm({
  action,
  submitLabel,
  initial,
}: {
  action: FormAction;
  submitLabel: string;
  initial?: { displayName: string; bio: string; location: string };
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-6">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label="Shop name" name="displayName" error={s.fieldErrors?.displayName}>
            <input id="displayName" name="displayName" defaultValue={initial?.displayName} maxLength={50} className="input" />
          </Field>
          <Field label="Location (city, country)" name="location" error={s.fieldErrors?.location}>
            <input id="location" name="location" defaultValue={initial?.location} maxLength={80} className="input" />
          </Field>
          <Field label="About your shop" name="bio" error={s.fieldErrors?.bio} hint="Optional. What you sell, how you test devices, shipping times.">
            <textarea id="bio" name="bio" rows={4} defaultValue={initial?.bio} maxLength={600} className="input" />
          </Field>
          <SubmitButton>{submitLabel}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function VerificationForm({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action} className="card space-y-4 p-6">
      {(s) => (
        <>
          <FormMessage state={s} />
          {!s.ok && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Legal full name" name="legalName" error={s.fieldErrors?.legalName}>
                  <input id="legalName" name="legalName" autoComplete="name" maxLength={100} className="input" />
                </Field>
                <Field label="Phone" name="phone" error={s.fieldErrors?.phone}>
                  <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={20} className="input" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Address" name="address" error={s.fieldErrors?.address}>
                    <textarea id="address" name="address" rows={2} autoComplete="street-address" maxLength={300} className="input" />
                  </Field>
                </div>
                <Field label="Document type" name="idType" error={s.fieldErrors?.idType}>
                  <select id="idType" name="idType" className="input" defaultValue="NATIONAL_ID">
                    {ID_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ID_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Document number" name="idNumber" error={s.fieldErrors?.idNumber} hint="We only keep the last 4 characters.">
                  <input id="idNumber" name="idNumber" autoComplete="off" maxLength={30} className="input" />
                </Field>
              </div>
              <Field label="Photo of the document" name="document" error={s.fieldErrors?.document} hint="JPEG/PNG/WebP up to 8MB. Kept in private storage that only ReGear reviewers can access; never shown to buyers.">
                <input id="document" name="document" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium" />
              </Field>
              <SubmitButton pendingText="Uploading…">Submit for review</SubmitButton>
            </>
          )}
        </>
      )}
    </ActionForm>
  );
}
