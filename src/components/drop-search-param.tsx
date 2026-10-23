"use client";

import { useEffect } from "react";

/**
 * Removes a one-time query parameter (such as ?error=) from the address bar
 * once its message is on screen, so a reload or a shared link doesn't show it again.
 */
export function DropSearchParam({ name }: { name: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(name)) return;
    url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url);
  }, [name]);
  return null;
}
