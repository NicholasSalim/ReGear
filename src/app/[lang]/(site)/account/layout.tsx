import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { LogOut } from "lucide-react";
import { DashboardNav, DashboardShell } from "@/components/dashboard-nav";
import { logoutAction } from "@/actions/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: { default: t.account.metaTitle, template: "%s | ReGear" }, robots: { index: false } };
}

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  const nav = t.account.nav;
  return (
    <DashboardShell
      title={t.account.title}
      nav={
        <DashboardNav
          title={t.account.title}
          // Things checked often first, things set once last.
          groups={[
            { items: [{ href: "/account", label: nav.overview, exact: true }] },
            {
              items: [
                { href: "/account/orders", label: nav.purchases },
                { href: "/account/offers", label: nav.offers },
                { href: "/account/favorites", label: nav.saved },
                { href: "/account/searches", label: nav.searches },
                { href: "/account/recent", label: nav.recent },
                { href: "/account/messages", label: nav.messages },
              ],
            },
            {
              items: [
                { href: "/account/addresses", label: nav.addresses },
                { href: "/account/settings", label: nav.settings },
              ],
            },
            { items: [{ href: "/sell", label: nav.sellerDashboard }] },
          ]}
          footer={
            <form action={logoutAction}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100">
                <LogOut className="size-4" aria-hidden /> {t.nav.signOut}
              </button>
            </form>
          }
        />
      }
    >
      {children}
    </DashboardShell>
  );
}
