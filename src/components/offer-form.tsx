"use client";

import { GrowingTextarea } from "@/components/smart-inputs";
import { useState } from "react";
import { Tag } from "lucide-react";
import { useT } from "@/i18n/client";
import type { ActionState } from "@/lib/action";
import { ActionForm, FormMessage, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** "Make offer" in the buy box: a button that opens the offer form in place. */
export function MakeOfferForm({ action, min, price }: { action: FormAction; min: string; price: string }) {
  const [open, setOpen] = useState(false);
  const t = useT().offerForm;
  const pill = "press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-semibold";

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${pill} bg-surface text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50`}>
        <Tag className="size-4" aria-hidden /> {t.title}
      </button>
    );
  }
  return (
    <div className="reveal rounded-2xl border border-rule bg-surface p-4">
      <ActionForm action={action} className="space-y-3">
        {(s) =>
          s.ok ? (
            <FormMessage state={s} />
          ) : (
            <>
              <h3 className="font-bold">{t.title}</h3>
              <FormMessage state={s} />
              <Field label={t.amount} name="offer-amount" error={s.fieldErrors?.amount} hint={t.hint(min, price)}>
                <input id="offer-amount" name="amount" inputMode="numeric" autoComplete="off" required className="input text-base" autoFocus />
              </Field>
              <Field label={t.message} name="offer-message">
                <GrowingTextarea id="offer-message" name="message" rows={2} maxLength={300} className="input" />
              </Field>
              <p className="text-xs text-slate-500">{t.terms}</p>
              <div className="flex gap-2">
                <SubmitButton className="flex-1 rounded-full!" pendingText={t.sending}>
                  {t.send}
                </SubmitButton>
                <button type="button" onClick={() => setOpen(false)} className="press rounded-full px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  {t.cancel}
                </button>
              </div>
            </>
          )
        }
      </ActionForm>
    </div>
  );
}

/** The seller's Accept / Decline buttons for one offer. */
export function AnswerOfferForm({ action, accept, decline }: { action: FormAction; accept: string; decline: string }) {
  const t = useT().offerForm;
  return (
    <ActionForm action={action} confirm={(d) => (d.get("decision") === "decline" ? { message: t.confirmDecline, danger: true } : t.confirmAccept)} className="space-y-2">
      {(s) => (
        <>
          <FormMessage state={s} />
          {!s.ok && (
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="decision" value="accept" className="rounded-full! px-5">
                {accept}
              </SubmitButton>
              <SubmitButton name="decision" value="decline" variant="secondary" className="rounded-full! px-5">
                {decline}
              </SubmitButton>
            </div>
          )}
        </>
      )}
    </ActionForm>
  );
}
