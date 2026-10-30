import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { ORDER_STATUS_INFO, type OrderStatus } from "@/lib/constants";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  const [users, sellers, activeListings, pendingVerifications, openDisputes, gmv, fees, ordersByStatus] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.sellerProfile.count({ where: { user: { deletedAt: null } } }),
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.verificationRequest.count({ where: { status: "PENDING" } }),
    db.dispute.count({ where: { status: { not: "RESOLVED" } } }),
    db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { totalIdr: true } }),
    db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { platformFeeIdr: true } }),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return (
    <>
      <PageHeader title={t.overviewTitle} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label={t.users} value={users} hint={t.sellers(sellers)} />
        <StatCard label={t.activeListings} value={activeListings} />
        <StatCard label={t.gmv} value={formatMoney(gmv._sum.totalIdr ?? 0)} hint={t.fees(formatMoney(fees._sum.platformFeeIdr ?? 0))} />
        <Link href="/admin/verifications">
          <StatCard label={t.pendingVerifications} value={pendingVerifications} hint={t.openQueue} />
        </Link>
        <Link href="/admin/disputes">
          <StatCard label={t.openDisputes} value={openDisputes} hint={t.openDisputeList} />
        </Link>
      </div>
      <section className="card mt-8 p-5">
        <h2 className="mb-3 font-bold">{t.ordersByStatus}</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {ordersByStatus.map((r) => (
            <div key={r.status}>
              <dt className="text-slate-500">{r.status in ORDER_STATUS_INFO ? pick(ORDER_STATUS_INFO[r.status as OrderStatus].label, locale) : r.status}</dt>
              <dd className="text-lg font-semibold">{r._count._all}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
