import { en } from "@/i18n/dictionaries/en";
import { resolveEntry } from "@/i18n/messages";

type DomainMessages = typeof en.domain;
export type DomainCode = keyof DomainMessages;
type DomainArgs<K extends DomainCode> = DomainMessages[K] extends (...args: infer A) => string ? A : [];

/** An expected business-rule failure. The message is English (logs, tests); actions show `code` in the visitor's language. */
export class DomainError<K extends DomainCode = DomainCode> extends Error {
  readonly code: K;
  readonly args: DomainArgs<K>;
  constructor(code: K, ...args: DomainArgs<K>) {
    super(resolveEntry(en.domain[code], args));
    this.name = "DomainError";
    this.code = code;
    this.args = args;
  }
}
