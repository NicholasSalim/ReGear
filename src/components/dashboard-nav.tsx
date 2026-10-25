"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Link, useT } from "@/i18n/client";
import { splitLocale } from "@/i18n/locales";

type NavItem = { href: string; label: string; exact?: boolean };

// The pathname is runtime data on dynamic routes, so the active-state version
// streams in while the static link list is part of the prerendered shell.
export function DashboardNav({ items }: { items: NavItem[] }) {
  return (
    <Suspense fallback={<NavLinks items={items} pathname={null} />}>
      <ActiveNav items={items} />
    </Suspense>
  );
}

function ActiveNav({ items }: { items: NavItem[] }) {
  // Compare without the language prefix: "/en/account" is the "/account" item.
  return <NavLinks items={items} pathname={splitLocale(usePathname()).path} />;
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const t = useT();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label={t.nav.section}>
      {items.map((item) => {
        const active = !!pathname && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ title, nav, children }: { title: string; nav: React.ReactNode; children: React.ReactNode }) {
  return (
    // minmax(0, 1fr): the sidebar's scrolling link row must not widen the column past the screen.
    <div className="container-page grid grid-cols-1 gap-6 py-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside>
        <p className="mb-2 hidden px-3 text-sm font-semibold text-ink lg:block">{title}</p>
        {nav}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
