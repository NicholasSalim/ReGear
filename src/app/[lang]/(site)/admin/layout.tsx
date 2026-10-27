import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/server";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { PageSkeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = (await getDictionary()).admin;
  return { title: { default: t.metaTitle, template: t.metaTemplate }, robots: { index: false, follow: false } };
}

// Every admin page calls requireAdmin() itself; this layout only provides chrome.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = (await getDictionary()).admin;
  const nav = t.nav;
  return (
    <DashboardShell
      title={t.title}
      nav={
        <DashboardNav
          items={[
            { href: "/admin", label: nav.overview, exact: true },
            { href: "/admin/verifications", label: nav.verifications },
            { href: "/admin/disputes", label: nav.disputes },
            { href: "/admin/payouts", label: nav.payouts },
            { href: "/admin/listings", label: nav.listings },
            { href: "/admin/audit", label: nav.audit },
          ]}
        />
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </DashboardShell>
  );
}
