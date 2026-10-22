"use client";

import { useActionState } from "react";
import { Link, useT } from "@/i18n/client";
import { loginAction, registerAction } from "@/actions/auth";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled?: boolean }) {
  const [state, action] = useActionState(loginAction, {});
  const t = useT().auth;
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label={t.email} name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label={t.password} name="password" error={state.fieldErrors?.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <SubmitButton className="w-full" pendingText={t.signingIn}>
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
  const [state, action] = useActionState(registerAction, {});
  const t = useT().auth;
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label={t.fullName} name="name" error={state.fieldErrors?.name}>
        <input id="name" name="name" autoComplete="name" required maxLength={60} className="input" aria-invalid={!!state.fieldErrors?.name} />
      </Field>
      <Field label={t.email} name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label={t.password} name="password" error={state.fieldErrors?.password} hint={t.passwordHint}>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="input" aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <SubmitButton className="w-full" pendingText={t.creatingAccount}>
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
