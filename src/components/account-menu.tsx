"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A dropdown in the header (account, categories). The header stays on screen
 * between pages, so the menu has to close itself: when something in it is
 * picked, on a click elsewhere, and on Escape.
 */
export function AccountMenu({
  summary,
  children,
  summaryClassName = "rounded-full p-1 hover:bg-slate-100 sm:pr-3",
  panelClassName = "right-0 w-56 origin-top-right",
}: {
  summary: ReactNode;
  children: ReactNode;
  summaryClassName?: string;
  /** Where the panel sits and which corner it grows from. */
  panelClassName?: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={menu} className="group relative">
      <summary className={`flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden ${summaryClassName}`}>{summary}</summary>
      {/* The menu grows out of the control above it. */}
      <div
        className={`panel-enter absolute z-40 mt-2 rounded-xl border border-slate-200 bg-surface p-1.5 text-sm shadow-lg ${panelClassName}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button") && menu.current) menu.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
