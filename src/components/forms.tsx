"use client";

import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { buttonClass, type ButtonVariant } from "@/components/ui";

/* ------------------------------------------------------------------------ */
/* Asking before a sensitive action                                           */
/* ------------------------------------------------------------------------ */

/** What to ask before an action goes ahead. `danger`: it deletes, removes or can't be undone. */
export type ConfirmSpec = { message: string; title?: string; confirmLabel?: string; danger?: boolean };
/** A question, or one chosen from what's being submitted (e.g. which decision button was pressed); undefined asks nothing. */
export type ConfirmQuestion = string | ConfirmSpec | ((data: FormData) => string | ConfirmSpec | undefined);

const toSpec = (q: string | ConfirmSpec | undefined): ConfirmSpec | undefined => (typeof q === "string" ? { message: q } : q);

/**
 * ReGear's own "are you sure?" dialog, in place of the browser's
 * (`window.confirm`, which shows the site's address and can't be styled).
 * `ask` resolves true when confirmed; render `dialog` once, anywhere.
 */
export function useConfirm() {
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  const ask = useCallback(
    (s: ConfirmSpec) =>
      new Promise<boolean>((resolve) => {
        answer.current = resolve;
        setSpec(s);
      }),
    [],
  );
  const close = useCallback((ok: boolean) => {
    answer.current?.(ok);
    answer.current = null;
    setSpec(null);
  }, []);
  return { ask, dialog: <ConfirmDialog spec={spec} onClose={close} /> };
}

function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec | null; onClose: (ok: boolean) => void }) {
  const t = useT().forms;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (spec && !dialog.open) dialog.showModal();
    if (!spec && dialog.open) dialog.close();
  }, [spec]);
  const danger = spec?.danger;
  return (
    <dialog
      ref={ref}
      // Esc, and a click on the dimmed backdrop, cancel.
      onCancel={(e) => {
        e.preventDefault();
        onClose(false);
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(false);
      }}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      className="confirm-dialog m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-rule bg-surface p-0 text-ink shadow-xl backdrop:bg-slate-950/45"
    >
      {spec && (
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${danger ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-700"}`} aria-hidden>
              <AlertTriangle className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="confirm-title" className="text-lg font-bold">
                {spec.title ?? t.confirmTitle}
              </h2>
              <p id="confirm-message" className="mt-1 text-sm text-slate-600">
                {spec.message}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {/* Cancel gets the focus, so Enter on a stray key press doesn't confirm. */}
            <button type="button" autoFocus onClick={() => onClose(false)} className={buttonClass("secondary", "px-4 py-2")}>
              {t.confirmNo}
            </button>
            <button type="button" onClick={() => onClose(true)} className={buttonClass(danger ? "danger" : "primary", "px-4 py-2")}>
              {spec.confirmLabel ?? t.confirmYes}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

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
      {/* Both labels share one grid cell, so the button keeps its width when the text changes. */}
      <span className="inline-grid justify-items-center *:[grid-area:1/1]">
        <span className={`inline-flex items-center gap-2 ${pending ? "invisible" : ""}`}>{children}</span>
        <span className={pending ? "" : "invisible"}>{pendingText ?? t.forms.working}</span>
      </span>
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
export function useActionForm(action: FormAction, { confirm, resetOnSuccess }: { confirm?: ConfirmQuestion; resetOnSuccess?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const [dismissed, setDismissed] = useState<ActionState | null>(null);
  const { ask, dialog } = useConfirm();
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
    // Read now: which button was pressed is only known during the event.
    const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    const question = toSpec(typeof confirm === "function" ? confirm(data) : confirm);
    if (!question) {
      startTransition(() => dispatch(data));
      return;
    }
    void ask(question).then((ok) => {
      if (ok) startTransition(() => dispatch(data));
    });
  }
  function onInput() {
    if (state.ok && state.message) setDismissed(state);
  }
  const shown = dismissed === state ? { ...state, message: undefined } : state;
  return { state: shown, pending, formProps: { ref, action: dispatch, onSubmit, onInput, noValidate: true }, confirmDialog: dialog };
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
  confirm?: ConfirmQuestion;
}) {
  const { state, pending, formProps, confirmDialog } = useActionForm(action, { confirm, resetOnSuccess });
  return (
    <form {...formProps} className={className}>
      <PendingContext value={pending}>{children(state)}</PendingContext>
      {confirmDialog}
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
  confirm?: ConfirmQuestion;
  className?: string;
}) {
  const { state, pending, formProps, confirmDialog } = useActionForm(action, { confirm });
  return (
    <form {...formProps} className="space-y-2">
      <SubmitButton variant={variant} className={className} pending={pending}>
        {children}
      </SubmitButton>
      <FormMessage state={state} />
      {confirmDialog}
    </form>
  );
}
