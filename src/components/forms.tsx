"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
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
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: ButtonVariant;
  className?: string;
  name?: string;
  value?: string;
  /** For forms using useActionForm directly; ActionForm provides it automatically. */
  pending?: boolean;
  disabled?: boolean;
}) {
  const { pending: submitting } = useFormStatus();
  const pending = useContext(PendingContext) || pendingProp || submitting;
  const t = useT();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={buttonClass(variant, className)} aria-busy={pending}>
      {pending ? (pendingText ?? t.forms.working) : children}
    </button>
  );
}

/** A password field with a button that shows what was typed. It hides again when the form is submitted. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const t = useT().forms;
  const [visible, setVisible] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <div className="relative">
      <input ref={input} type={visible ? "text" : "password"} className={`input pr-10 ${className ?? ""}`} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.hidePassword : t.showPassword}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:text-ink"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p key="error" role="alert" className="form-message flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p key="ok" role="status" className="form-message flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.message}
      </p>
    );
  }
  return null;
}

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const SUCCESS_MESSAGE_MS = 6000;

/**
 * useActionState for a form that keeps what was typed. React clears a form
 * after its action runs, so one wrong field would wipe all the others;
 * submitting from onSubmit inside a transition keeps the values. The action
 * stays on the form, so it still works before hydration.
 *
 * A success message goes away after a few seconds or once the form is edited
 * again, since the page itself doesn't reload.
 */
export function useActionForm(action: FormAction, { confirm, resetOnSuccess }: { confirm?: string; resetOnSuccess?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const [dismissed, setDismissed] = useState<ActionState | null>(null);
  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  useEffect(() => {
    if (!state.ok || !state.message) return;
    const timer = setTimeout(() => setDismissed(state), SUCCESS_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(data));
  }
  function onInput() {
    if (state.ok && state.message) setDismissed(state);
  }
  const shown = dismissed === state ? { ...state, message: undefined } : state;
  return { state: shown, pending, formProps: { ref, action: dispatch, onSubmit, onInput, noValidate: true } };
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
  confirm,
}: {
  action: FormAction;
  children: (state: ActionState) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  /** Asks the user before submitting. */
  confirm?: string;
}) {
  const { state, pending, formProps } = useActionForm(action, { confirm, resetOnSuccess });
  return (
    <form {...formProps} className={className}>
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
  const { state, pending, formProps } = useActionForm(action, { confirm });
  return (
    <form {...formProps} className="space-y-2">
      <SubmitButton variant={variant} className={className} pending={pending}>
        {children}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
