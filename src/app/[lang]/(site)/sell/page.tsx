import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { BadgeCheck, Plus } from "lucide-react";
import { requireSeller } from "@/lib/auth/dal";
import { getSellerDashboard } from "@/lib/data/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { OrderStatusBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function SellerDashboardPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.sell;
  const { seller } = await requireSeller("/sell");
  const d = await getSellerDashboard(seller.id);

  return (
    <>
      <PageHeader
        title={seller.displayName}
        description={
          <Link href={`/sellers/${seller.slug}`} className="hover:text-brand-700">
            {t.viewShop}
          </Link>
        }
        actions={
          <ButtonLink href="/sell/listings/new">
            <Plus className="size-4" aria-hidden /> {t.newListing}
          </ButtonLink>
        }
      />

      {seller.verificationStatus !== "VERIFIED" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm">
          <p className="flex items-center gap-2 text-brand-900">
            <BadgeCheck className="size-5" aria-hidden />
            {seller.verificationStatus === "PENDING" ? t.verificationPending : t.verifyPitch}
          </p>
          {seller.verificationStatus !== "PENDING" && <ButtonLink href="/sell/verification" variant="secondary">{t.getVerified}</ButtonLink>}
        </div>
      )}

      {/* Four across only from xl: beside the sidebar, 1024px leaves cards too narrow for amounts in rupiah. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t.activeListings} value={d.listings.active} hint={t.listingsHint(d.listings.draft, d.listings.reserved)} />
        <StatCard label={t.toShip} value={d.orders.toShip} hint={t.inTransit(d.orders.inTransit)} />
        <StatCard label={t.completedSales} value={d.orders.completed} />
        <StatCard label={t.netEarnings} value={formatMoney(d.earningsIdr)} hint={t.afterFee} />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t.needsAttention}</h2>
        {d.needsAction.length === 0 ? (
          <EmptyState title={t.allCaughtUp} description={t.allCaughtUpHint} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {d.needsAction.map((o) => (
              <li key={o.id}>
                <Link href={`/sell/orders/${o.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.snapshot.title}</p>
                    <p className="text-xs text-slate-500">
                      {o.status === "PAID" && `${t.shipThis} `}
                      {o.returnRequest?.status === "REQUESTED" && `${t.respondReturn} `}
                      {o.returnRequest?.status === "SHIPPED_BACK" && `${t.confirmReturn} `}
                      {t.orderLine(o.number, formatDate(o.createdAt, locale))}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
