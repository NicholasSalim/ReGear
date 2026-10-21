"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

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
  return <NavLinks items={items} pathname={usePathname()} />;
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Section">
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
    <div className="container-page grid gap-6 py-8 lg:grid-cols-[13rem_1fr]">
      <aside>
        <p className="mb-2 hidden px-3 text-sm font-semibold text-ink lg:block">{title}</p>
        {nav}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
