import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { PageSkeleton } from "@/components/ui";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin · ReGear" }, robots: { index: false, follow: false } };

// Every admin page calls requireAdmin() itself; this layout only provides chrome.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell
      title="Admin"
      nav={
        <DashboardNav
          items={[
            { href: "/admin", label: "Overview", exact: true },
            { href: "/admin/verifications", label: "Verifications" },
            { href: "/admin/disputes", label: "Disputes" },
            { href: "/admin/listings", label: "Listings" },
            { href: "/admin/audit", label: "Audit log" },
          ]}
        />
      }
    >
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </DashboardShell>
  );
}
