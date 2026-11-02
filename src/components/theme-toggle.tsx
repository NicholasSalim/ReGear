"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/client";
import { THEME_KEY } from "@/lib/theme";

const listeners = new Set<() => void>();
const isDark = () => document.documentElement.dataset.theme === "dark";

function apply(theme: "light" | "dark") {
  document.documentElement.dataset.theme = theme;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // A choice made in another tab applies here too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY && (e.newValue === "dark" || e.newValue === "light")) apply(e.newValue);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function ThemeToggle({ className = "text-slate-600 hover:bg-slate-100 hover:text-ink" }: { className?: string }) {
  const t = useT();
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = isDark() ? "light" : "dark";
    apply(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts until the page reloads */
    }
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={dark} aria-label={t.theme.darkMode} className={`press rounded-lg p-2 ${className}`}>
      {/* CSS picks the icon, so the right one shows before the page hydrates. */}
      <Moon className="size-4 dark:hidden" aria-hidden />
      <Sun className="hidden size-4 dark:block" aria-hidden />
    </button>
  );
}
