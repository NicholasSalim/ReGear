import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { DISPUTE_REASON_LABELS, DISPUTE_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.disputesTitle };
}

export default async function AdminDisputesPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const disputes = await db.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      order: { select: { number: true, totalIdr: true, buyer: { select: { name: true } }, seller: { select: { displayName: true } } } },
      _count: { select: { messages: true } },
    },
  });
  const tone: Record<string, string> = {
    OPEN: "bg-rose-50 text-rose-700 ring-rose-600/20",
    UNDER_REVIEW: "bg-amber-50 text-amber-800 ring-amber-600/20",
    RESOLVED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  };

  return (
    <>
      <PageHeader title={t.disputesTitle} />
      {disputes.length === 0 ? (
        <EmptyState title={t.noDisputes} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link href={`/disputes/${d.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.disputeLine(pick(DISPUTE_REASON_LABELS[d.reason as keyof typeof DISPUTE_REASON_LABELS], locale), d.order.number)}</p>
                  <p className="text-xs text-slate-500">
                    {t.disputeMeta(d.order.buyer.name || dict.common.deletedUser, d.order.seller.displayName || dict.common.deletedShop, formatMoney(d.order.totalIdr), d._count.messages, formatDateTime(d.createdAt, locale))}
                  </p>
                </div>
                <Badge className={tone[d.status]}>{d.status in DISPUTE_STATUS_LABELS ? pick(DISPUTE_STATUS_LABELS[d.status as keyof typeof DISPUTE_STATUS_LABELS], locale) : d.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
