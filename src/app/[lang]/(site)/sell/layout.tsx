import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/server";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { PageSkeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).sell;
  return { title: { default: t.metaTitle, template: t.metaTemplate }, robots: { index: false } };
}

export default async function SellLayout({ children }: { children: React.ReactNode }) {
  const t = (await getDictionary()).sell;
  const nav = t.nav;
  return (
    <DashboardShell
      title={t.title}
      nav={
        <DashboardNav
          items={[
            { href: "/sell", label: nav.dashboard, exact: true },
            { href: "/sell/listings", label: nav.listings },
            { href: "/sell/orders", label: nav.sales },
            { href: "/sell/verification", label: nav.verification },
            { href: "/sell/profile", label: nav.profile },
          ]}
        />
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </DashboardShell>
  );
}
