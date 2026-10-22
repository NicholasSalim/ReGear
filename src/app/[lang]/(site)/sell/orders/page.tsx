import type { Metadata } from "next";
import { pick } from "@/i18n/locales";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireSeller } from "@/lib/auth/dal";
import { getSellerOrders } from "@/lib/data/orders";
import { ORDER_STATUSES, ORDER_STATUS_INFO } from "@/lib/constants";
import { OrderList } from "@/components/order-list";
import { EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.salesTitle };
}

export default async function SellerOrdersPage({ searchParams }: PageProps<"/[lang]/sell/orders">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.sell;
  const { seller } = await requireSeller("/sell/orders");
  const raw = (await searchParams).status;
  const status = typeof raw === "string" && (ORDER_STATUSES as readonly string[]).includes(raw) ? raw : undefined;
  const orders = await getSellerOrders(seller.id, status);

  return (
    <>
      <PageHeader title={t.salesTitle} description={t.salesIntro} />
      <nav className="mb-4 flex flex-wrap gap-2 text-sm" aria-label={t.filterAria}>
        <Link href="/sell/orders" className={`rounded-full px-3 py-1 ${!status ? "bg-ink text-white" : "bg-white ring-1 ring-slate-200"}`}>{t.all}</Link>
        {(["PAID", "SHIPPED", "DELIVERED", "RETURN_IN_PROGRESS", "DISPUTED", "COMPLETED"] as const).map((s) => (
          <Link key={s} href={`/sell/orders?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-ink text-white" : "bg-white ring-1 ring-slate-200"}`}>
            {pick(ORDER_STATUS_INFO[s].label, locale)}
          </Link>
        ))}
      </nav>
      {orders.length ? (
        <OrderList basePath="/sell/orders" orders={orders.map((o) => ({ ...o, counterpart: o.buyer.name }))} />
      ) : (
        <EmptyState title={t.noSales} />
      )}
    </>
  );
}
