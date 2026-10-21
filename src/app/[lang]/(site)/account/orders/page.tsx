import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getBuyerOrders } from "@/lib/data/orders";
import { OrderList } from "@/components/order-list";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage() {
  const user = await requireUser("/account/orders");
  const orders = await getBuyerOrders(user.id);
  return (
    <>
      <PageHeader title="Purchases" description="Track deliveries, request returns and open disputes." />
      {orders.length ? (
        <OrderList basePath="/account/orders" orders={orders.map((o) => ({ ...o, counterpart: o.seller.displayName }))} />
      ) : (
        <EmptyState title="You haven't bought anything yet" action={<ButtonLink href="/listings">Browse listings</ButtonLink>} />
      )}
    </>
  );
}
