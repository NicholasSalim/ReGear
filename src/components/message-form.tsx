"use client";

import { useEffect, useId } from "react";
import type { ActionState } from "@/lib/action";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** The box for writing a message. Clears itself once the message is sent. */
export function MessageForm({
  action,
  label,
  placeholder,
  send,
  sending,
  autoFocus,
}: {
  action: FormAction;
  label: string;
  placeholder: string;
  send: string;
  sending: string;
  autoFocus?: boolean;
}) {
  // A previous page can stay mounted (hidden) after navigating, so the id must be unique.
  const id = useId();
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-2">
      {(s) => (
        <>
          {s.error && <FormMessage state={s} />}
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            id={id}
            name="body"
            rows={3}
            maxLength={2000}
            required
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-invalid={!!s.fieldErrors?.body}
            className="input resize-y"
          />
          <div className="flex justify-end">
            <SubmitButton className="rounded-full! px-6" pendingText={sending}>
              {send}
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

/**
 * Marks a conversation read once it's actually on screen. Rendering on the
 * server isn't enough: a prefetched link would count as reading it.
 */
export function MarkRead({ action, stamp }: { action: () => Promise<void>; stamp: string }) {
  useEffect(() => {
    action().catch(() => {
      /* only a read marker; the next visit tries again */
    });
  }, [action, stamp]);
  return null;
}
