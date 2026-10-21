import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [users, sellers, activeListings, pendingVerifications, openDisputes, gmv, fees, ordersByStatus] = await Promise.all([
    db.user.count(),
    db.sellerProfile.count(),
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.verificationRequest.count({ where: { status: "PENDING" } }),
    db.dispute.count({ where: { status: { not: "RESOLVED" } } }),
    db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { totalCents: true } }),
    db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { platformFeeCents: true } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return (
    <>
      <PageHeader title="Marketplace overview" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Users" value={users} hint={`${sellers} sellers`} />
        <StatCard label="Active listings" value={activeListings} />
        <StatCard label="Completed GMV" value={formatMoney(gmv._sum.totalCents ?? 0)} hint={`${formatMoney(fees._sum.platformFeeCents ?? 0)} fees`} />
        <Link href="/admin/verifications">
          <StatCard label="Pending verifications" value={pendingVerifications} hint="Open the review queue" />
        </Link>
        <Link href="/admin/disputes">
          <StatCard label="Open disputes" value={openDisputes} hint="Open the dispute list" />
        </Link>
      </div>
      <section className="card mt-8 p-5">
        <h2 className="mb-3 font-bold">Orders by status</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {ordersByStatus.map((r) => (
            <div key={r.status}>
              <dt className="text-slate-500">{r.status.replaceAll("_", " ").toLowerCase()}</dt>
              <dd className="text-lg font-semibold">{r._count._all}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
