"use client";

import { usePathname } from "next/navigation";

/** The address the visitor tried to open, so a typo is easy to spot. */
export function RequestedPath() {
  return <>{usePathname()}</>;
}
