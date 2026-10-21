"use client";

import { changePasswordAction, updateProfileAction } from "@/actions/auth";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

export function SettingsForms({ name, email, hasPassword, googleEmail }: { name: string; email: string; hasPassword: boolean; googleEmail?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ActionForm action={updateProfileAction} className="card space-y-4 p-6">
        {(s) => (
          <>
            <h2 className="font-bold">Profile</h2>
            <FormMessage state={s} />
            <Field label="Email" name="email-ro">
              <input id="email-ro" value={email} disabled className="input" readOnly />
            </Field>
            <Field label="Full name" name="name" error={s.fieldErrors?.name}>
              <input id="name" name="name" defaultValue={name} required maxLength={60} className="input" />
            </Field>
            <p className="text-sm text-slate-600">
              {googleEmail ? `Google sign-in is linked (${googleEmail}).` : "Google sign-in is not linked. Sign in with Google using this email to link it."}
            </p>
            <SubmitButton>Save profile</SubmitButton>
          </>
        )}
      </ActionForm>

      <ActionForm action={changePasswordAction} className="card space-y-4 p-6" resetOnSuccess>
        {(s) => (
          <>
            <h2 className="font-bold">{hasPassword ? "Change password" : "Set a password"}</h2>
            <p className="text-sm text-slate-600">
              {hasPassword ? "Changing your password signs you out on all other devices." : "Your account uses Google sign-in. Add a password to also sign in with your email."}
            </p>
            <FormMessage state={s} />
            {hasPassword && (
              <Field label="Current password" name="currentPassword" error={s.fieldErrors?.currentPassword}>
                <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" className="input" />
              </Field>
            )}
            <Field label="New password" name="newPassword" error={s.fieldErrors?.newPassword}>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" className="input" />
            </Field>
            <Field label="Confirm new password" name="confirmPassword" error={s.fieldErrors?.confirmPassword}>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" className="input" />
            </Field>
            <SubmitButton>{hasPassword ? "Change password" : "Set password"}</SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  );
}
