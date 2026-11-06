"use client";

import { Link, useT } from "@/i18n/client";
import { confirmSignupAction, loginAction, registerAction, resendSignupCodeAction } from "@/actions/auth";
import { ActionButton, FormMessage, PasswordInput, SubmitButton, useActionForm } from "@/components/forms";
import { Field } from "@/components/ui";
import { CodeInput, NewPasswordInput } from "@/components/smart-inputs";
import { RichText } from "@/components/rich-text";

export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled?: boolean }) {
  const { state, pending, formProps } = useActionForm(loginAction);
  const t = useT().auth;
  return (
    <form {...formProps} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label={t.email} name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label={t.password} name="password" error={state.fieldErrors?.password}>
        <PasswordInput id="password" name="password" autoComplete="current-password" required aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <p className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
          {t.forgotLink}
        </Link>
      </p>
      <SubmitButton pending={pending} className="w-full" pendingText={t.signingIn}>
        {t.signIn}
      </SubmitButton>
      {googleEnabled && <p className="text-center text-xs text-slate-500">{t.googleHint}</p>}
      <p className="text-center text-sm text-slate-600">
        {t.newToReGear}{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-brand-700 hover:underline">
          {t.createAccountLink}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const { state, pending, formProps } = useActionForm(registerAction);
  const t = useT().auth;
  return (
    <form {...formProps} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label={t.fullName} name="name" error={state.fieldErrors?.name}>
        <input id="name" name="name" autoComplete="name" required maxLength={60} className="input" aria-invalid={!!state.fieldErrors?.name} />
      </Field>
      <Field label={t.email} name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label={t.password} name="password" error={state.fieldErrors?.password}>
        <NewPasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} maxLength={128} aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <div>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="acceptTerms" required className="mt-0.5 size-4 shrink-0 accent-brand-600" aria-invalid={!!state.fieldErrors?.acceptTerms} aria-describedby={state.fieldErrors?.acceptTerms ? "acceptTerms-error" : undefined} />
          <span>
            <RichText text={t.acceptTerms} newTab />
          </span>
        </label>
        {state.fieldErrors?.acceptTerms && (
          <p id="acceptTerms-error" className="mt-1 text-xs font-medium text-rose-600">
            {state.fieldErrors.acceptTerms}
          </p>
        )}
      </div>
      <SubmitButton pending={pending} className="w-full" pendingText={t.creatingAccount}>
        {t.createAccount}
      </SubmitButton>
      <p className="text-center text-sm text-slate-600">
        {t.haveAccount}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-brand-700 hover:underline">
          {t.signIn}
        </Link>
      </p>
    </form>
  );
}

export function ConfirmSignupForm({ next }: { next?: string }) {
  const { state, pending, formProps } = useActionForm(confirmSignupAction);
  const t = useT().auth;
  return (
    <div className="space-y-4">
      <form {...formProps} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <FormMessage state={state} />
        <Field label={t.code} name="code" error={state.fieldErrors?.code}>
          {/* One box per digit; pasting "123 456" or the phone's suggested code fills them all. */}
          <CodeInput id="code" name="code" autoFocus invalid={!!state.fieldErrors?.code} />
        </Field>
        <SubmitButton pending={pending} className="w-full" pendingText={t.confirmingCode}>
          {t.confirmCode}
        </SubmitButton>
      </form>
      <ActionButton action={resendSignupCodeAction} variant="secondary" className="w-full">
        {t.resendCode}
      </ActionButton>
    </div>
  );
}
