"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { buttonClass, type ButtonVariant } from "@/components/ui";

// Pending state of an ActionForm, which useFormStatus does not see (see useActionForm).
const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className,
  name,
  value,
  pending: pendingProp,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
  /** For forms using useActionForm directly; ActionForm provides it automatically. */
  pending?: boolean;
}) {
  const { pending: submitting } = useFormStatus();
  const pending = useContext(PendingContext) || pendingProp || submitting;
  const t = useT();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, className)} aria-busy={pending}>
      {pending ? (pendingText ?? t.forms.working) : children}
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
 * useActionState for a form that keeps what was typed. React clears a form
 * after its action runs, so one wrong field would wipe all the others;
 * submitting from onSubmit inside a transition keeps the values. The action
 * stays on the form, so it still works before hydration.
 */
export function useActionForm(action: FormAction) {
  const [state, dispatch, pending] = useActionState(action, {});
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  }
  return { state, pending, formProps: { action: dispatch, onSubmit, noValidate: true } };
}

/**
 * Progressive-enhancement form bound to a Server Action via useActionState.
 * Renders field errors through a render prop, keeps the typed values after an
 * error, and optionally resets on success.
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
  const { state, pending, formProps } = useActionForm(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} {...formProps} className={className}>
      <PendingContext value={pending}>{children(state)}</PendingContext>
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
