"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, registerAction } from "@/actions/auth";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

export function LoginForm({ next, googleEnabled }: { next?: string; googleEnabled?: boolean }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label="Email" name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label="Password" name="password" error={state.fieldErrors?.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      {googleEnabled && <p className="text-center text-xs text-slate-500">Signed up with Google? Use Continue with Google above.</p>}
      <p className="text-center text-sm text-slate-600">
        New to ReGear?{" "}
        <Link href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(registerAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label="Full name" name="name" error={state.fieldErrors?.name}>
        <input id="name" name="name" autoComplete="name" required maxLength={60} className="input" aria-invalid={!!state.fieldErrors?.name} />
      </Field>
      <Field label="Email" name="email" error={state.fieldErrors?.email}>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" aria-invalid={!!state.fieldErrors?.email} />
      </Field>
      <Field label="Password" name="password" error={state.fieldErrors?.password} hint="At least 8 characters with a letter, a number and a symbol.">
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="input" aria-invalid={!!state.fieldErrors?.password} />
      </Field>
      <SubmitButton className="w-full" pendingText="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
