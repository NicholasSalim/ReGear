import type { Metadata } from "next";
import { pick } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import Link from "next/link";
import { requireSeller } from "@/lib/auth/dal";
import { getSellerOrders } from "@/lib/data/orders";
import { ORDER_STATUSES, ORDER_STATUS_INFO } from "@/lib/constants";
import { OrderList } from "@/components/order-list";
import { EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Sales" };

export default async function SellerOrdersPage({ searchParams }: PageProps<"/[lang]/sell/orders">) {
  const locale = await getLocale();
  const { seller } = await requireSeller("/sell/orders");
  const raw = (await searchParams).status;
  const status = typeof raw === "string" && (ORDER_STATUSES as readonly string[]).includes(raw) ? raw : undefined;
  const orders = await getSellerOrders(seller.id, status);

  return (
    <>
      <PageHeader title="Sales" description="Ship orders, handle returns and respond to disputes." />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Filter by status">
        <Link href="/sell/orders" className={`rounded-full px-3 py-1 ${!status ? "bg-ink text-white" : "bg-white ring-1 ring-slate-200"}`}>All</Link>
        {(["PAID", "SHIPPED", "DELIVERED", "RETURN_IN_PROGRESS", "DISPUTED", "COMPLETED"] as const).map((s) => (
          <Link key={s} href={`/sell/orders?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-ink text-white" : "bg-white ring-1 ring-slate-200"}`}>
            {pick(ORDER_STATUS_INFO[s].label, locale)}
          </Link>
        ))}
      </nav>
      {orders.length ? (
        <OrderList basePath="/sell/orders" orders={orders.map((o) => ({ ...o, counterpart: o.buyer.name }))} />
      ) : (
        <EmptyState title="No sales here yet" />
      )}
    </>
  );
}
