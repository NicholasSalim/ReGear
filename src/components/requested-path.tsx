"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

const subscribe = () => () => {};

/**
 * The address the visitor tried to open, so a typo is easy to spot. The 404 for
 * unknown addresses is static HTML built without it, so it appears after hydration.
 */
export function RequestedPath() {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{hydrated ? pathname : null}</>;
}
