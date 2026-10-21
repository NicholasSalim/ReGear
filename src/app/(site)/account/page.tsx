import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { getBuyerOrders, getFavorites } from "@/lib/data/orders";
import { TERMINAL_STATUSES } from "@/lib/orders/state";
import type { OrderStatus } from "@/lib/constants";
import { OrderList } from "@/components/order-list";
import { ButtonLink, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [orders, favorites] = await Promise.all([getBuyerOrders(user.id), getFavorites(user.id)]);
  const open = orders.filter((o) => !TERMINAL_STATUSES.includes(o.status as OrderStatus));

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} description={user.email} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Open orders" value={open.length} />
        <StatCard label="All purchases" value={orders.length} />
        <StatCard label="Saved items" value={favorites.length} />
      </div>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Orders in progress</h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">
            See all purchases
          </Link>
        </div>
        {open.length ? (
          <OrderList basePath="/account/orders" orders={open.slice(0, 5).map((o) => ({ ...o, counterpart: o.seller.displayName }))} />
        ) : (
          <EmptyState title="No orders in progress" action={<ButtonLink href="/listings">Find something great</ButtonLink>} />
        )}
      </section>
    </>
  );
}
