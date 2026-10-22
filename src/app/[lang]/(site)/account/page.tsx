import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/dal";
import { getBuyerOrders, getFavorites } from "@/lib/data/orders";
import { TERMINAL_STATUSES } from "@/lib/orders/state";
import type { OrderStatus } from "@/lib/constants";
import { OrderList } from "@/components/order-list";
import { ButtonLink, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [orders, favorites, t] = await Promise.all([getBuyerOrders(user.id), getFavorites(user.id), getDictionary()]);
  const open = orders.filter((o) => !TERMINAL_STATUSES.includes(o.status as OrderStatus));

  return (
    <>
      <PageHeader title={t.account.hi(user.name.split(" ")[0])} description={user.email} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.account.openOrders} value={open.length} />
        <StatCard label={t.account.allPurchases} value={orders.length} />
        <StatCard label={t.account.savedItems} value={favorites.length} />
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t.account.inProgress}</h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">
            {t.account.seeAllPurchases}
          </Link>
        </div>
        {open.length ? (
          <OrderList basePath="/account/orders" orders={open.slice(0, 5).map((o) => ({ ...o, counterpart: o.seller.displayName }))} />
        ) : (
          <EmptyState title={t.account.noneInProgress} action={<ButtonLink href="/listings">{t.account.findSomething}</ButtonLink>} />
        )}
      </section>
    </>
  );
}
