import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: { default: "My account", template: "%s · ReGear" }, robots: { index: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      title="My account"
      nav={
        <DashboardNav
          items={[
            { href: "/account", label: "Overview", exact: true },
            { href: "/account/orders", label: "Purchases" },
            { href: "/account/favorites", label: "Saved items" },
            { href: "/account/settings", label: "Settings" },
            { href: "/sell", label: "Seller dashboard" },
          ]}
        />
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </DashboardShell>
  );
}
