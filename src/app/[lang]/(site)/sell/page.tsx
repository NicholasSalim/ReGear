import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { BadgeCheck, ChevronRight, Eye, Plus } from "lucide-react";
import { requireSeller } from "@/lib/auth/dal";
import { getSellerDashboard } from "@/lib/data/orders";
import { countPendingOffers } from "@/lib/offers";
import { formatDate, formatMoney } from "@/lib/format";
import { OrderStatusBadge, Stars } from "@/components/badges";
import { ButtonLink, PageHeader } from "@/components/ui";

// Seller Hub's overview: what needs doing, how sales are going, what's listed,
// and how buyers see the shop, each linking to the page where it's handled.
export default async function SellerDashboardPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.sell;
  const h = t.hub;
  const { seller } = await requireSeller("/sell");
  const [d, pendingOffers] = await Promise.all([getSellerDashboard(seller.id), countPendingOffers(seller.id)]);
  const tasks = [
    { label: dict.offers.toAnswer, count: pendingOffers, href: "/sell/offers" },
    { label: h.awaitingShipment, count: d.orders.toShip, href: "/sell/orders?status=PAID" },
    { label: h.returnsOpen, count: d.orders.returns, href: "/sell/orders?status=RETURN_IN_PROGRESS" },
    { label: h.disputesOpen, count: d.orders.disputes, href: "/sell/orders?status=DISPUTED" },
    { label: h.draftsToFinish, count: d.listings.draft, href: "/sell/listings" },
  ];
  const pending = tasks.filter((x) => x.count > 0);

  return (
    <>
      <PageHeader
        title={seller.displayName}
        description={
          <Link href={`/sellers/${seller.slug}`} className="hover:text-brand-700 hover:underline">
            {t.viewShop}
          </Link>
        }
        actions={
          <ButtonLink href="/sell/listings/new" className="rounded-full!">
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
          {seller.verificationStatus !== "PENDING" && <ButtonLink href="/sell/profile#verification" variant="secondary">{t.getVerified}</ButtonLink>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title={h.tasks}>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-600">{h.noTasks}</p>
          ) : (
            <ul className="-mx-2">
              {pending.map((x) => (
                <li key={x.label}>
                  <Link href={x.href} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-100">
                    <span className="text-ink">{x.label}</span>
                    <span className="flex items-center gap-1">
                      <span className="num grid min-w-7 place-items-center rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">{x.count}</span>
                      <ChevronRight className="size-4 text-slate-400" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={h.sales} link={{ href: "/sell/orders", label: h.seeOrders }}>
          <p className="text-xs text-slate-500">{h.last30}</p>
          <p className="num wide mt-0.5 text-3xl font-extrabold [overflow-wrap:anywhere] text-ink">{formatMoney(d.last30.totalIdr)}</p>
          <p className="text-sm text-slate-600">{h.ordersCount(d.last30.count)}</p>
          <dl className="mt-4 border-t border-rule pt-3 text-sm">
            <dt className="text-xs text-slate-500">{h.allTime}</dt>
            <dd className="num font-bold text-ink">{formatMoney(d.earningsIdr)}</dd>
            <dd className="text-xs text-slate-500">{t.afterFee}</dd>
          </dl>
        </Panel>

        <Panel title={h.listings} link={{ href: "/sell/listings", label: h.manageListings }}>
          <dl className="space-y-3 text-sm">
            {[
              [h.active, d.listings.active],
              [h.drafts, d.listings.draft],
              [h.reserved, d.listings.reserved],
              [h.sold, d.listings.sold],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">{label}</dt>
                <dd className="num font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {d.watchers > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-700">
              <Eye className="size-4 text-slate-500" aria-hidden /> {h.watchers(d.watchers)}
            </p>
          )}
        </Panel>

        <Panel title={h.performance}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600">{h.rating}</dt>
              <dd>{seller.ratingCount > 0 ? <Stars rating={seller.ratingAvg} count={seller.ratingCount} /> : <span className="text-slate-500">{h.noRating}</span>}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600">{h.totalSales}</dt>
              <dd className="num font-semibold text-ink">{seller.salesCount}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-600">{h.verification}</dt>
              <dd className={`font-semibold ${seller.verificationStatus === "VERIFIED" ? "text-pass" : "text-slate-600"}`}>
                {seller.verificationStatus === "VERIFIED" ? h.verified : seller.verificationStatus === "PENDING" ? h.pending : h.notVerified}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      {/* The Tasks panel already says when there's nothing to do. */}
      {d.needsAction.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">{t.needsAttention}</h2>
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
        </section>
      )}
    </>
  );
}

function Panel({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {link && (
          <Link href={link.href} className="text-sm font-semibold text-brand-700 hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
