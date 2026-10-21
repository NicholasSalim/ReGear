import Link from "next/link";
import { BadgeCheck, Plus } from "lucide-react";
import { requireSeller } from "@/lib/auth/dal";
import { getSellerDashboard } from "@/lib/data/orders";
import { formatDate, formatMoney } from "@/lib/format";
import { OrderStatusBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageHeader, StatCard } from "@/components/ui";

export default async function SellerDashboardPage() {
  const { seller } = await requireSeller("/sell");
  const d = await getSellerDashboard(seller.id);

  return (
    <>
      <PageHeader
        title={seller.displayName}
        description={
          <Link href={`/sellers/${seller.slug}`} className="hover:text-brand-700">
            View your public shop
          </Link>
        }
        actions={
          <ButtonLink href="/sell/listings/new">
            <Plus className="size-4" aria-hidden /> New listing
          </ButtonLink>
        }
      />

      {seller.verificationStatus !== "VERIFIED" && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm">
          <p className="flex items-center gap-2 text-brand-900">
            <BadgeCheck className="size-5" aria-hidden />
            {seller.verificationStatus === "PENDING"
              ? "Your verification is under review."
              : "Verified sellers get a trust badge, rank higher with buyers and can list without limits."}
          </p>
          {seller.verificationStatus !== "PENDING" && <ButtonLink href="/sell/verification" variant="secondary">Get verified</ButtonLink>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active listings" value={d.listings.active} hint={`${d.listings.draft} drafts, ${d.listings.reserved} reserved`} />
        <StatCard label="To ship" value={d.orders.toShip} hint={`${d.orders.inTransit} in transit`} />
        <StatCard label="Completed sales" value={d.orders.completed} />
        <StatCard label="Net earnings" value={formatMoney(d.earningsCents)} hint="After the 5% ReGear fee" />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Needs your attention</h2>
        {d.needsAction.length === 0 ? (
          <EmptyState title="All caught up" description="New orders, return requests and disputes will appear here." />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {d.needsAction.map((o) => (
              <li key={o.id}>
                <Link href={`/sell/orders/${o.id}`} className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{o.snapshot.title}</p>
                    <p className="text-xs text-slate-500">
                      {o.status === "PAID" && "Ship this order. "}
                      {o.returnRequest?.status === "REQUESTED" && "Respond to the return request. "}
                      {o.returnRequest?.status === "SHIPPED_BACK" && "Confirm you received the return. "}
                      Order {o.number}, {formatDate(o.createdAt)}
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
