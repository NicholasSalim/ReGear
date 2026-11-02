"use client";

import { useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** The header's category links on phones: a menu that opens downward, and closes once a link is picked. */
export function PhoneCategories({ label, children }: { label: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={menu} className="group container-page text-sm font-medium text-slate-600 sm:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-1 py-2 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <nav
        aria-label={label}
        className="panel-enter grid origin-top grid-cols-2 gap-x-4 pb-2"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a") && menu.current) menu.current.open = false;
        }}
      >
        {children}
      </nav>
    </details>
  );
}
