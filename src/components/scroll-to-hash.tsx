"use client";

import { useEffect } from "react";

/**
 * Scrolls to this section when the URL names it. Streamed sections arrive
 * after the browser's own jump to the #fragment, which then finds nothing.
 */
export function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash === `#${id}`) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
