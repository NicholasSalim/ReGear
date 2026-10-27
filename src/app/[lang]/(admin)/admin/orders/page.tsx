import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, like, readSearch } from "@/lib/admin/search";
import { snapshotTitle } from "@/lib/admin/display";
import { ORDER_STATUSES, ORDER_STATUS_INFO } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { OrderStatusBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/ui";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.orders.title };
}

export default async function AdminOrdersPage({ searchParams }: PageProps<"/[lang]/admin/orders">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const search = readSearch(await searchParams, ORDER_STATUSES);
  const where: Prisma.OrderWhereInput = {
    ...(search.status ? { status: search.status } : {}),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    ...(search.q
      ? {
          OR: [
            { id: search.q },
            { number: like(search.q) },
            { paymentRef: search.q },
            { listingSnapshot: like(search.q) },
            { buyer: { OR: [{ name: like(search.q) }, { email: like(search.q) }] } },
            { seller: { OR: [{ displayName: like(search.q) }, { user: { email: like(search.q) } }] } },
          ],
        }
      : {}),
  };
  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: search.skip,
      take: search.take,
      select: {
        id: true,
        number: true,
        status: true,
        totalIdr: true,
        createdAt: true,
        listingSnapshot: true,
        buyer: { select: { name: true } },
        seller: { select: { displayName: true } },
      },
    }),
    db.order.count({ where }),
  ]);

  return (
    <>
      <PageHeader title={t.orders.title} description={t.orders.intro} />
      <SearchBar
        search={search}
        path="/admin/orders"
        placeholder={t.placeholders.orders}
        statuses={ORDER_STATUSES.map((s) => ({ value: s, label: pick(ORDER_STATUS_INFO[s].label, locale) }))}
      />
      {orders.length === 0 ? (
        <EmptyState title={t.searchBar.none} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-slate-50">
                <div className="min-w-0 flex-1 basis-full sm:basis-0">
                  <p className="truncate font-semibold">{snapshotTitle(o.listingSnapshot)}</p>
                  <p className="text-xs text-slate-500">
                    <span className="num">{o.number}</span> · {t.orders.line(o.buyer.name || dict.common.deletedUser, o.seller.displayName || dict.common.deletedShop)} · {formatDateTime(o.createdAt, locale)}
                  </p>
                </div>
                <span className="num font-semibold">{formatMoney(o.totalIdr)}</span>
                <OrderStatusBadge status={o.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager search={search} total={total} path="/admin/orders" />
    </>
  );
}
