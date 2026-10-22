import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/dal";
import { getBuyerOrders } from "@/lib/data/orders";
import { OrderList } from "@/components/order-list";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.purchasesTitle };
}

export default async function PurchasesPage() {
  const user = await requireUser("/account/orders");
  const [orders, t] = await Promise.all([getBuyerOrders(user.id), getDictionary()]);
  return (
    <>
      <PageHeader title={t.account.purchasesTitle} description={t.account.purchasesIntro} />
      {orders.length ? (
        <OrderList basePath="/account/orders" orders={orders.map((o) => ({ ...o, counterpart: o.seller.displayName }))} />
      ) : (
        <EmptyState title={t.account.noPurchases} action={<ButtonLink href="/listings">{t.common.browseListings}</ButtonLink>} />
      )}
    </>
  );
}
