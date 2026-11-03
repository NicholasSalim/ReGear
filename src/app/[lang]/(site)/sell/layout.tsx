import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";

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
          title={t.title}
          items={[
            { href: "/sell", label: nav.dashboard, exact: true },
            { href: "/sell/listings", label: nav.listings },
            { href: "/sell/offers", label: nav.offers },
            { href: "/sell/orders", label: nav.sales },
            { href: "/sell/payouts", label: nav.payouts },
            { href: "/sell/profile", label: nav.profile },
          ]}
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
