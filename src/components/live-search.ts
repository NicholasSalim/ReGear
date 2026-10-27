"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** How long typing must pause before the search runs. */
export const SEARCH_DEBOUNCE_MS = 350;

/**
 * Search as you type without a request per keystroke: a URL change is
 * scheduled once typing pauses, and a newer one replaces any still waiting.
 * Single characters aren't searched (they match almost everything); an empty
 * box is, so clearing it shows everything again. replace(), not push(), so
 * Back leaves the page instead of stepping through every keystroke.
 */
export function useLiveSearch() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function go(url: string) {
    clearTimeout(timer.current);
    startTransition(() => router.replace(url, { scroll: false }));
  }
  function goLater(url: string, typed: string) {
    clearTimeout(timer.current);
    const length = typed.trim().length;
    if (length === 1) return;
    timer.current = setTimeout(() => go(url), SEARCH_DEBOUNCE_MS);
  }
  return { pending, go, goLater };
}
