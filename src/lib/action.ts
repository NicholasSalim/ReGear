import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { resolveEntry } from "@/i18n/messages";
import { dictionaryFor, getRequestLocale, type Dictionary } from "@/i18n/server";
import type { Locale } from "@/i18n/locales";
import { DomainError } from "@/lib/orders/service";
import { InvalidTransitionError } from "@/lib/orders/state";
import { fieldErrors } from "@/lib/validation";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** The id of what the action created, for forms that act on it next. */
  id?: string;
};

export const initialActionState: ActionState = {};

/** Language and dictionary for a Server Action's response. */
export async function actionI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getRequestLocale();
  return { locale, t: dictionaryFor(locale) };
}

/**
 * Wraps a Server Action body: framework control flow (redirect, notFound,
 * auth interrupts) is re-thrown, expected domain/validation errors become
 * form state in the visitor's language, and unexpected errors are logged
 * without leaking internals.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    const { locale, t } = await actionI18n();
    if (err instanceof DomainError) {
      const { code, args } = err as DomainError;
      return { error: resolveEntry(t.domain[code], args) };
    }
    if (err instanceof InvalidTransitionError) return { error: t.domain.invalidTransition };
    if (err instanceof z.ZodError) return { error: t.validation.fixFields, fieldErrors: fieldErrors(err, t, locale) };
    console.error("[action] unexpected error", err);
    return { error: t.domain.genericError };
  }
}

export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}
