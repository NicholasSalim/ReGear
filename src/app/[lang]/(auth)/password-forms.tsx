"use client";

import { useT } from "@/i18n/client";
import { requestPasswordResetAction, resetPasswordAction } from "@/actions/auth";
import { FormMessage, PasswordInput, SubmitButton, useActionForm } from "@/components/forms";
import { Field } from "@/components/ui";

export function ForgotPasswordForm() {
  const { state, pending, formProps } = useActionForm(requestPasswordResetAction);
  const t = useT().passwordReset;
  return (
    <form {...formProps} className="space-y-4">
      <FormMessage state={state} />
      <Field label={t.email} name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <SubmitButton pending={pending} className="w-full" pendingText={t.sending}>
        {t.send}
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { state, pending, formProps } = useActionForm(resetPasswordAction);
  const t = useT().passwordReset;
  return (
    <form {...formProps} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <Field label={t.newPassword} name="newPassword" error={state.fieldErrors?.newPassword} hint={t.hint}>
        <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" required minLength={8} maxLength={128} aria-invalid={!!state.fieldErrors?.newPassword} />
      </Field>
      <Field label={t.confirmPassword} name="confirmPassword" error={state.fieldErrors?.confirmPassword}>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required maxLength={128} aria-invalid={!!state.fieldErrors?.confirmPassword} />
      </Field>
      <SubmitButton pending={pending} className="w-full" pendingText={t.saving}>
        {t.save}
      </SubmitButton>
    </form>
  );
}
