import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { DomainError } from "@/lib/orders/service";
import { fieldErrors } from "@/lib/validation";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = {};

/**
 * Wraps a Server Action body: framework control flow (redirect, notFound,
 * auth interrupts) is re-thrown, expected domain/validation errors become
 * form state, and unexpected errors are logged without leaking internals.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DomainError) return { error: err.message };
    if (err instanceof z.ZodError) return { error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(err) };
    console.error("[action] unexpected error", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  }
  return out;
}
