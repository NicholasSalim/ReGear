"use client";

import { useT } from "@/i18n/client";
import { changePasswordAction, updateProfileAction } from "@/actions/auth";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

export function SettingsForms({ name, email, hasPassword, googleEmail }: { name: string; email: string; hasPassword: boolean; googleEmail?: string }) {
  const t = useT().settings;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ActionForm action={updateProfileAction} className="card space-y-4 p-6">
        {(s) => (
          <>
            <h2 className="font-bold">{t.profile}</h2>
            <FormMessage state={s} />
            <Field label={t.email} name="email-ro">
              <input id="email-ro" value={email} disabled className="input" readOnly />
            </Field>
            <Field label={t.fullName} name="name" error={s.fieldErrors?.name}>
              <input id="name" name="name" defaultValue={name} required maxLength={60} className="input" />
            </Field>
            <p className="text-sm text-slate-600">{googleEmail ? t.googleLinked(googleEmail) : t.googleNotLinked}</p>
            <SubmitButton>{t.saveProfile}</SubmitButton>
          </>
        )}
      </ActionForm>

      <ActionForm action={changePasswordAction} className="card space-y-4 p-6" resetOnSuccess>
        {(s) => (
          <>
            <h2 className="font-bold">{hasPassword ? t.changePassword : t.setPassword}</h2>
            <p className="text-sm text-slate-600">{hasPassword ? t.changeHint : t.setHint}</p>
            <FormMessage state={s} />
            {hasPassword && (
              <Field label={t.currentPassword} name="currentPassword" error={s.fieldErrors?.currentPassword}>
                <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" className="input" />
              </Field>
            )}
            <Field label={t.newPassword} name="newPassword" error={s.fieldErrors?.newPassword}>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" className="input" />
            </Field>
            <Field label={t.confirmPassword} name="confirmPassword" error={s.fieldErrors?.confirmPassword}>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" className="input" />
            </Field>
            <SubmitButton>{hasPassword ? t.changePassword : t.setPasswordButton}</SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  );
}
