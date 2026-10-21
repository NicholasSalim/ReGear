import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Seller dashboard", template: "%s · Seller · ReGear" }, robots: { index: false } };

export default function SellLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      title="Seller"
      nav={
        <DashboardNav
          items={[
            { href: "/sell", label: "Dashboard", exact: true },
            { href: "/sell/listings", label: "Listings" },
            { href: "/sell/orders", label: "Sales" },
            { href: "/sell/verification", label: "Verification" },
            { href: "/sell/profile", label: "Shop profile" },
          ]}
        />
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </DashboardShell>
  );
}
