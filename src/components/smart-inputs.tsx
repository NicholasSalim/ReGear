"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { useT } from "@/i18n/client";
import { PasswordInput } from "@/components/forms";

// Inputs that help while typing: one box per code digit, a password strength
// meter, digits grouped in fours, and notes that grow as they're written.

/* ------------------------------------------------------------------------ */
/* One box per digit                                                          */
/* ------------------------------------------------------------------------ */

/**
 * A code typed one digit per box. Typing moves to the next box, Backspace on an
 * empty box goes back, and pasting (or the phone's one-time-code suggestion)
 * fills every box at once. The form receives the digits as one value, `name`.
 */
export function CodeInput({ id, name, length = 6, invalid, autoFocus }: { id: string; name: string; length?: number; invalid?: boolean; autoFocus?: boolean }) {
  const t = useT().forms;
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // A form that's reset (e.g. after a refused code) empties the boxes too.
  useEffect(() => {
    const form = boxes.current[0]?.form;
    if (!form) return;
    const clear = () => setDigits(Array(length).fill(""));
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, [length]);

  function fill(from: number, typed: string) {
    const clean = typed.replace(/\D/g, "");
    const next = [...digits];
    if (!clean) {
      next[from] = "";
      setDigits(next);
      return;
    }
    let i = from;
    for (const ch of clean) {
      if (i >= length) break;
      next[i++] = ch;
    }
    setDigits(next);
    boxes.current[Math.min(i, length - 1)]?.focus();
  }

  return (
    <div className="flex gap-2 sm:gap-2.5" role="group">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            boxes.current[i] = el;
          }}
          id={i === 0 ? id : undefined}
          aria-label={i === 0 ? undefined : t.codeDigit(i + 1, length)}
          aria-invalid={invalid || undefined}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && i === 0}
          value={digit}
          onChange={(e) => {
            const typed = e.target.value;
            // Typing over a filled box keeps only the new digit.
            fill(i, digit && typed.length === 2 ? (typed[0] === digit ? typed[1] : typed[0]) : typed);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digit && i > 0) {
              e.preventDefault();
              const next = [...digits];
              next[i - 1] = "";
              setDigits(next);
              boxes.current[i - 1]?.focus();
            } else if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < length - 1) boxes.current[i + 1]?.focus();
          }}
          onFocus={(e) => e.target.select()}
          className={`num h-14 w-11 min-w-0 flex-1 rounded-xl border bg-surface text-center text-2xl font-semibold text-ink transition-[border-color,transform,box-shadow] duration-150 focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 focus:outline-none sm:w-12 sm:flex-none ${
            digit ? "scale-[1.04] border-ink" : "border-rule"
          } aria-invalid:border-fail motion-reduce:transition-none`}
        />
      ))}
      <input type="hidden" name={name} value={digits.join("")} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Password strength                                                          */
/* ------------------------------------------------------------------------ */

/** The same rules the server checks (src/lib/validation.ts), shown as they're met. */
export const PASSWORD_RULES = {
  length: (p: string) => p.length >= 8,
  letter: (p: string) => /[a-zA-Z]/.test(p),
  number: (p: string) => /[0-9]/.test(p),
  symbol: (p: string) => /[^a-zA-Z0-9\s]/.test(p),
} as const;

/** 0–5: one point per rule met, and one more for a long password once all are met. */
export function passwordScore(p: string) {
  const met = Object.values(PASSWORD_RULES).filter((rule) => rule(p)).length;
  return met + (met === 4 && p.length >= 12 ? 1 : 0);
}

const BAR_COLORS = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

/** A new-password field with a strength bar and the rules ticked off as they're met. */
export function NewPasswordInput(props: Omit<ComponentProps<"input">, "type" | "value" | "onChange">) {
  const t = useT().forms;
  const [value, setValue] = useState("");
  const score = passwordScore(value);
  const hintId = `${props.id}-strength`;
  return (
    <div className="space-y-2">
      <PasswordInput {...props} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={hintId} />
      <div id={hintId} className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none ${value && i < Math.min(4, Math.max(1, score)) ? BAR_COLORS[score] : "bg-slate-200"}`}
              />
            ))}
          </div>
          <span className="w-20 text-right text-xs font-medium text-slate-600" aria-live="polite">
            {value ? t.strength[score] : ""}
          </span>
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {(Object.keys(PASSWORD_RULES) as (keyof typeof PASSWORD_RULES)[]).map((key) => {
            const met = PASSWORD_RULES[key](value);
            return (
              <li key={key} className={`flex items-center gap-1.5 transition-colors duration-200 ${met ? "text-emerald-700" : "text-slate-500"}`}>
                <span
                  className={`flex size-3.5 items-center justify-center rounded-full transition-[background-color,transform] duration-200 motion-reduce:transition-none ${met ? "scale-100 bg-emerald-600 text-white" : "scale-90 bg-slate-200"}`}
                  aria-hidden
                >
                  {met && <Check className="size-2.5" strokeWidth={3.5} />}
                </span>
                {t.passwordRules[key]}
                <span className="sr-only">{met ? t.ruleMet : t.ruleNotMet}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Digits in groups of four                                                   */
/* ------------------------------------------------------------------------ */

const groupDigits = (s: string, max: number) =>
  s
    .replace(/\D/g, "")
    .slice(0, max)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

/**
 * A number shown in groups of four as it's typed (1234 5678 90), easier to
 * check against a bank book. The spaces are sent too; the server strips them.
 */
export function GroupedDigitsInput({ maxDigits = 20, className, ...props }: Omit<ComponentProps<"input">, "value" | "onChange" | "inputMode"> & { maxDigits?: number }) {
  const [value, setValue] = useState("");
  return (
    <input
      {...props}
      inputMode="numeric"
      value={value}
      maxLength={maxDigits + Math.floor((maxDigits - 1) / 4)}
      onChange={(e) => {
        const el = e.target;
        // Keep the cursor after the same digit, even as spaces come and go.
        const digitsBefore = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
        const next = groupDigits(el.value, maxDigits);
        setValue(next);
        requestAnimationFrame(() => {
          let pos = 0;
          for (let seen = 0; pos < next.length && seen < digitsBefore; pos++) if (/\d/.test(next[pos])) seen++;
          el.setSelectionRange(pos, pos);
        });
      }}
      className={`num tracking-wide ${className ?? ""}`}
    />
  );
}

/* ------------------------------------------------------------------------ */
/* Notes that grow                                                            */
/* ------------------------------------------------------------------------ */

/**
 * A textarea that grows downwards as the text gets longer (and back when it's
 * cut), easing into its new height with a little spring. Starts at `rows`.
 * For people who prefer reduced motion, it simply jumps to size.
 */
export function GrowingTextarea({ className, onInput, rows = 3, ...props }: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const first = useRef(true);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const from = el.offsetHeight;
    // Measure the height the text needs, without letting the browser draw the in-between.
    el.style.transition = "none";
    el.style.height = "auto";
    const to = el.scrollHeight + (el.offsetHeight - el.clientHeight);
    el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.transition = first.current ? "none" : "";
    el.style.height = `${to}px`;
    first.current = false;
  }, []);

  // Typed text, values set by the page (editing a listing), and a form being reset.
  useLayoutEffect(resize, [props.value, resize]);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const later = () => requestAnimationFrame(resize);
    form.addEventListener("reset", later);
    window.addEventListener("resize", later);
    return () => {
      form.removeEventListener("reset", later);
      window.removeEventListener("resize", later);
    };
  }, [resize]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      {...props}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={`resize-none overflow-hidden transition-[height] duration-300 ease-[cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none ${className ?? ""}`}
    />
  );
}
