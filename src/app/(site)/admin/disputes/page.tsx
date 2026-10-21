import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { DISPUTE_REASON_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Disputes" };

export default async function AdminDisputesPage() {
  await requireAdmin();
  const disputes = await db.dispute.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      order: { select: { number: true, totalCents: true, buyer: { select: { name: true } }, seller: { select: { displayName: true } } } },
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
      <PageHeader title="Disputes" />
      {disputes.length === 0 ? (
        <EmptyState title="No disputes" />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {disputes.map((d) => (
            <li key={d.id}>
              <Link href={`/disputes/${d.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{DISPUTE_REASON_LABELS[d.reason as keyof typeof DISPUTE_REASON_LABELS]}, order {d.order.number}</p>
                  <p className="text-xs text-slate-500">
                    {d.order.buyer.name} vs {d.order.seller.displayName}, {formatMoney(d.order.totalCents)}, {d._count.messages} messages, opened {formatDateTime(d.createdAt)}
                  </p>
                </div>
                <Badge className={tone[d.status]}>{d.status.replace("_", " ").toLowerCase()}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
