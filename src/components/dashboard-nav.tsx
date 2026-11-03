"use client";

import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Link, useT } from "@/i18n/client";
import { splitLocale } from "@/i18n/locales";

type NavItem = { href: string; label: string; exact?: boolean };
/** Links under an optional heading. Unlabelled groups are just spaced apart. */
export type NavGroup = { label?: string; items: NavItem[] };

// The pathname is runtime data on dynamic routes, so the active-state version
// streams in while the static link list is part of the prerendered shell.
export function DashboardNav({ title, items, groups }: { title: string; items?: NavItem[]; groups?: NavGroup[] }) {
  const all = groups ?? [{ items: items ?? [] }];
  return (
    <Suspense fallback={<Nav title={title} groups={all} pathname={null} />}>
      <ActiveNav title={title} groups={all} />
    </Suspense>
  );
}

function ActiveNav({ title, groups }: { title: string; groups: NavGroup[] }) {
  // Compare without the language prefix: "/en/account" is the "/account" item.
  return <Nav title={title} groups={groups} pathname={splitLocale(usePathname()).path} />;
}

const isActive = (item: NavItem, pathname: string | null) =>
  !!pathname && (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

function Nav({ title, groups, pathname }: { title: string; groups: NavGroup[]; pathname: string | null }) {
  const t = useT();
  const current = groups.flatMap((g) => g.items).find((item) => isActive(item, pathname));
  return (
    <>
      {/* Phones: one button naming the current page instead of rows of links
          above the content. Keyed by page, so it's closed again after a pick. */}
      <details key={pathname ?? ""} className="group lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-rule bg-surface px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate">
            <span className="text-slate-500">{title}</span>
            {current && <span className="font-semibold text-ink">: {current.label}</span>}
          </span>
          <ChevronDown className="size-4 shrink-0 text-slate-500 transition-transform duration-200 ease-out group-open:rotate-180" aria-hidden />
        </summary>
        <div className="panel-enter mt-2 rounded-xl border border-rule bg-surface p-1.5">
          <Groups groups={groups} pathname={pathname} label={t.nav.section} />
        </div>
      </details>
      <div className="hidden lg:block">
        <Groups groups={groups} pathname={pathname} label={t.nav.section} />
      </div>
    </>
  );
}

function Groups({ groups, pathname, label }: { groups: NavGroup[]; pathname: string | null; label: string }) {
  return (
    <nav className="flex flex-col gap-4" aria-label={label}>
      {groups.map((group, i) => (
        <div key={group.label ?? i} className="flex flex-col gap-0.5">
          {group.label && <p className="px-3 pb-1 text-xs font-semibold text-slate-500">{group.label}</p>}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DashboardShell({ title, nav, children }: { title: string; nav: React.ReactNode; children: React.ReactNode }) {
  return (
    // minmax(0, 1fr): wide content must not stretch the column past the screen.
    <div className="container-page grid grid-cols-1 gap-6 py-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside>
        <p className="mb-2 hidden px-3 text-sm font-semibold text-ink lg:block">{title}</p>
        {nav}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
