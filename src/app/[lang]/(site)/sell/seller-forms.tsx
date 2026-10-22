"use client";

import { useLocale, useT } from "@/i18n/client";
import { pick } from "@/i18n/locales";
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
  const t = useT().sellerForms;
  return (
    <ActionForm action={action} className="card space-y-4 p-6">
      {(s) => (
        <>
          <FormMessage state={s} />
          <Field label={t.shopName} name="displayName" error={s.fieldErrors?.displayName}>
            <input id="displayName" name="displayName" defaultValue={initial?.displayName} maxLength={50} className="input" />
          </Field>
          <Field label={t.location} name="location" error={s.fieldErrors?.location}>
            <input id="location" name="location" defaultValue={initial?.location} maxLength={80} className="input" />
          </Field>
          <Field label={t.about} name="bio" error={s.fieldErrors?.bio} hint={t.aboutHint}>
            <textarea id="bio" name="bio" rows={4} defaultValue={initial?.bio} maxLength={600} className="input" />
          </Field>
          <SubmitButton>{submitLabel}</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}

export function VerificationForm({ action }: { action: FormAction }) {
  const locale = useLocale();
  const t = useT().sellerForms;
  return (
    <ActionForm action={action} className="card space-y-4 p-6">
      {(s) => (
        <>
          <FormMessage state={s} />
          {!s.ok && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.legalName} name="legalName" error={s.fieldErrors?.legalName}>
                  <input id="legalName" name="legalName" autoComplete="name" maxLength={100} className="input" />
                </Field>
                <Field label={t.phone} name="phone" error={s.fieldErrors?.phone}>
                  <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={20} className="input" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label={t.address} name="address" error={s.fieldErrors?.address}>
                    <textarea id="address" name="address" rows={2} autoComplete="street-address" maxLength={300} className="input" />
                  </Field>
                </div>
                <Field label={t.documentType} name="idType" error={s.fieldErrors?.idType}>
                  <select id="idType" name="idType" className="input" defaultValue="NATIONAL_ID">
                    {ID_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {pick(ID_TYPE_LABELS[type], locale)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t.documentNumber} name="idNumber" error={s.fieldErrors?.idNumber} hint={t.documentNumberHint}>
                  <input id="idNumber" name="idNumber" autoComplete="off" maxLength={30} className="input" />
                </Field>
              </div>
              <Field label={t.documentPhoto} name="document" error={s.fieldErrors?.document} hint={t.documentPhotoHint}>
                <input id="document" name="document" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium" />
              </Field>
              <SubmitButton pendingText={t.uploading}>{t.submit}</SubmitButton>
            </>
          )}
        </>
      )}
    </ActionForm>
  );
}
