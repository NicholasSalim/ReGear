import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/server";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { PageSkeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: { default: t.account.metaTitle, template: "%s · ReGear" }, robots: { index: false } };
}

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  const nav = t.account.nav;
  return (
    <DashboardShell
      title={t.account.title}
      nav={
        <DashboardNav
          items={[
            { href: "/account", label: nav.overview, exact: true },
            { href: "/account/orders", label: nav.purchases },
            { href: "/account/favorites", label: nav.saved },
            { href: "/account/settings", label: nav.settings },
            { href: "/sell", label: nav.sellerDashboard },
          ]}
        />
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </DashboardShell>
  );
}
