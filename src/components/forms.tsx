"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { buttonClass, type ButtonVariant } from "@/components/ui";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, className)} aria-busy={pending}>
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  }
  return null;
}

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Progressive-enhancement form bound to a Server Action via useActionState.
 * Renders field errors through a render prop and optionally resets on success.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: FormAction;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate>
      {children(state)}
    </form>
  );
}

/**
 * Small button bound to a Server Action whose other arguments are pre-bound
 * (e.g. `payOrderAction.bind(null, id)`). The server reference is passed to
 * useActionState directly so the form also works before hydration / without JS.
 */
export function ActionButton({
  action,
  children,
  variant = "primary",
  confirm,
  className,
}: {
  action: FormAction;
  children: ReactNode;
  variant?: ButtonVariant;
  confirm?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="space-y-2"
    >
      <SubmitButton variant={variant} className={className}>
        {children}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
