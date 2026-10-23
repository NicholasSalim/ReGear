import { Fragment } from "react";
import { Link } from "@/i18n/client";

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * Text with [label](/path) links, as used in the dictionaries and legal
 * documents. Paths keep the visitor's language. `newTab` is for links inside
 * forms, so following one doesn't lose what was typed.
 */
export function RichText({ text, newTab, linkClassName = "font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800" }: { text: string; newTab?: boolean; linkClassName?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, href] = match;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <Link key={match.index} href={href} className={linkClassName} {...(newTab ? { target: "_blank", rel: "noopener" } : {})}>
        {label}
      </Link>,
    );
    last = match.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => (typeof p === "string" ? <Fragment key={`t${i}`}>{p}</Fragment> : p))}</>;
}
