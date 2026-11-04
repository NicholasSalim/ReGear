// Messages produced on the server but shown in the visitor's language.
//
// Validation messages are written as keys into the dictionary's `validation`
// section (with their arguments) and translated when an action turns zod
// issues into form errors. Order events store their details as JSON and are
// worded when displayed. Both survive being produced in one place and read in
// another, where the language is only known at the end.

import { en } from "./dictionaries/en";
import type { Dictionary } from "./server";
import { LOCALES, pick, type Locale, type Localized } from "./locales";

type Fn = (...args: never[]) => string;
type Args<E> = E extends (...args: infer A) => string ? A : [];
/** Arguments may be bilingual text; it is picked in the reader's language. */
type Encodable<A extends unknown[]> = { [I in keyof A]: A[I] | Localized };

export function isLocalized(value: unknown): value is Localized {
  return typeof value === "object" && value !== null && LOCALES.every((l) => typeof (value as Record<string, unknown>)[l] === "string");
}

/** Calls a dictionary entry that may be a plain string or a function. */
export function resolveEntry(entry: string | Fn, args: readonly unknown[]): string {
  return typeof entry === "function" ? (entry as (...a: unknown[]) => string)(...args) : entry;
}

// Validation ---------------------------------------------------------------

const PREFIX = "i18n:";
export type ValidationKey = keyof Dictionary["validation"];

/** A zod issue message that is translated later: `vmsg("minChars", 8)`. */
export function vmsg<K extends ValidationKey>(key: K, ...args: Encodable<Args<Dictionary["validation"][K]>>): string {
  return PREFIX + JSON.stringify([key, args]);
}

/** zod's own issue, for wording the rules that have no message of their own. */
type Issue = { code: string; input?: unknown; minimum?: number | bigint; maximum?: number | bigint; origin?: string };

/** Turns a message from vmsg() into text; zod's own defaults are worded from the kind of problem. */
export function translateValidation(message: string, t: Dictionary, locale: Locale, issue?: Issue): string {
  if (!message.startsWith(PREFIX)) {
    if (issue?.code === "invalid_type" && (issue.input === undefined || issue.input === null || Number.isNaN(issue.input))) return t.validation.required;
    if (issue?.code === "too_small" && issue.origin === "number") return t.validation.numberMin(Number(issue.minimum));
    if (issue?.code === "too_big" && issue.origin === "number") return t.validation.numberMax(Number(issue.maximum));
    return t.validation.invalid;
  }
  try {
    const [key, args] = JSON.parse(message.slice(PREFIX.length)) as [string, unknown[]];
    const entry = (t.validation as Record<string, string | Fn>)[key];
    if (!entry) return t.validation.invalid;
    return resolveEntry(entry, args.map((a) => (isLocalized(a) ? pick(a, locale) : a)));
  } catch {
    return t.validation.invalid;
  }
}

// Order events -------------------------------------------------------------

export type EventType = keyof Dictionary["events"];
export type EventParams<T extends EventType> = Args<Dictionary["events"][T]> extends [infer P, ...unknown[]] ? P : Record<string, never>;

/** Wording for a stored order event; events from before params existed keep their stored text. */
/**
 * Wording for a dispute message. ReGear's own notes are stored in English (so
 * older rows work too) and reworded for the reader; people's messages are
 * shown as written.
 */
export function disputeMessageText(message: { authorRole: string; body: string }, t: Dictionary): string {
  if (message.authorRole !== "ADMIN") return message.body;
  const stored = en.disputes.system;
  if (message.body === stored.reviewing) return t.disputes.system.reviewing;
  if (message.body.startsWith(stored.resolutionPrefix)) {
    return t.disputes.system.resolutionPrefix + message.body.slice(stored.resolutionPrefix.length);
  }
  return message.body;
}

export function eventText(event: { type: string; message: string; params: string | null }, t: Dictionary): string {
  if (event.params === null) return event.message;
  const entry = (t.events as Record<string, string | Fn>)[event.type];
  if (!entry) return event.message;
  try {
    return resolveEntry(entry, [JSON.parse(event.params)]);
  } catch {
    return event.message;
  }
}
