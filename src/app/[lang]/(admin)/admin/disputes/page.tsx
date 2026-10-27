import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, like, readSearch } from "@/lib/admin/search";
import { DISPUTE_REASON_LABELS, DISPUTE_RESOLUTION_LABELS, DISPUTE_STATUSES, DISPUTE_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.disputesTitle };
}

export default async function AdminDisputesPage({ searchParams }: PageProps<"/[lang]/admin/disputes">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const search = readSearch(await searchParams, DISPUTE_STATUSES);
  const where: Prisma.DisputeWhereInput = {
    ...(search.status ? { status: search.status } : {}),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    ...(search.q
      ? {
          OR: [
            { id: search.q },
            { order: { number: like(search.q) } },
            { order: { buyer: { OR: [{ name: like(search.q) }, { email: like(search.q) }] } } },
            { order: { seller: { OR: [{ displayName: like(search.q) }, { user: { email: like(search.q) } }] } } },
          ],
        }
      : {}),
  };
  const [disputes, total] = await Promise.all([
    db.dispute.findMany({
      where,
      // Open ones first, oldest first: that's the work queue.
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      skip: search.skip,
      take: search.take,
      include: {
        order: { select: { id: true, number: true, totalIdr: true, buyer: { select: { name: true } }, seller: { select: { displayName: true } } } },
        _count: { select: { messages: true } },
      },
    }),
    db.dispute.count({ where }),
  ]);
  const tone: Record<string, string> = {
    OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
    UNDER_REVIEW: "bg-amber-50 text-amber-800 ring-amber-600/20",
    RESOLVED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  };

  return (
    <>
      <PageHeader title={t.disputesTitle} />
      <SearchBar
        search={search}
        path="/admin/disputes"
        placeholder={t.placeholders.disputes}
        statuses={DISPUTE_STATUSES.map((s) => ({ value: s, label: pick(DISPUTE_STATUS_LABELS[s], locale) }))}
      />
      {disputes.length === 0 ? (
        <EmptyState title={search.q || search.status || search.from || search.to ? t.searchBar.none : t.noDisputes} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {disputes.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/disputes/${d.id}`} className="font-semibold hover:text-brand-700">
                  {t.disputeLine(pick(DISPUTE_REASON_LABELS[d.reason as keyof typeof DISPUTE_REASON_LABELS], locale), d.order.number)}
                </Link>
                <p className="text-xs text-slate-500">
                  {t.disputeMeta(d.order.buyer.name || dict.common.deletedUser, d.order.seller.displayName || dict.common.deletedShop, formatMoney(d.order.totalIdr), d._count.messages, formatDateTime(d.createdAt, locale))}
                </p>
                <p className="text-xs text-slate-500">
                  {d.resolution && d.resolution in DISPUTE_RESOLUTION_LABELS && (
                    <>
                      {pick(DISPUTE_RESOLUTION_LABELS[d.resolution as keyof typeof DISPUTE_RESOLUTION_LABELS], locale)}
                      {d.refundIdr > 0 && ` (${formatMoney(d.refundIdr)})`}
                      {d.resolvedAt && ` · ${formatDateTime(d.resolvedAt, locale)}`}
                      {" · "}
                    </>
                  )}
                  <Link href={`/admin/orders/${d.order.id}`} className="font-medium text-brand-700 hover:underline">{t.viewOrder}</Link>
                </p>
              </div>
              <Badge className={tone[d.status]}>{d.status in DISPUTE_STATUS_LABELS ? pick(DISPUTE_STATUS_LABELS[d.status as keyof typeof DISPUTE_STATUS_LABELS], locale) : d.status}</Badge>
            </li>
          ))}
        </ul>
      )}
      <Pager search={search} total={total} path="/admin/disputes" />
    </>
  );
}
