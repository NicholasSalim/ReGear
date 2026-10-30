import type { Metadata } from "next";
import type { ShippingAddress } from "@/lib/addresses";
import { ShippingAddressBlock } from "@/components/shipping-address";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/client";
import { eventText } from "@/i18n/messages";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { snapshotTitle } from "@/lib/admin/display";
import { DISPUTE_STATUS_LABELS, RETURN_REASON_LABELS, RETURN_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { OrderStatusBadge } from "@/components/badges";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.orders.title };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function AdminOrderPage({ params }: PageProps<"/[lang]/admin/orders/[id]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin.orders;
  await requireAdmin();
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { userId: true, displayName: true, slug: true, user: { select: { email: true } } } },
      listing: { select: { slug: true } },
      events: { orderBy: { createdAt: "desc" } },
      returnRequest: true,
      dispute: { select: { id: true, status: true } },
      balanceEntries: true,
    },
  });
  if (!order) notFound();

  let address: Partial<ShippingAddress> = {};
  try {
    address = JSON.parse(order.shippingAddress);
  } catch {
    /* shown as empty */
  }
  const credited = order.balanceEntries.reduce((sum, e) => sum + e.amountIdr, 0);
  const at = (d: Date | null) => (d ? formatDateTime(d, locale) : t.none);

  return (
    <>
      <PageHeader
        title={t.detailTitle(order.number)}
        description={
          <>
            <Link href={`/listings/${order.listing.slug}`} className="hover:text-brand-700">{snapshotTitle(order.listingSnapshot)}</Link>
            <span className="num ml-2 text-xs text-slate-400">{order.id}</span>
          </>
        }
        actions={<OrderStatusBadge status={order.status} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="money">
          <h2 id="money" className="mb-2 font-bold">{t.summary}</h2>
          <dl className="divide-y divide-slate-100">
            <Row label={t.price}>{formatMoney(order.priceIdr)}</Row>
            <Row label={t.shipping}>{formatMoney(order.shippingIdr)}</Row>
            <Row label={order.paidAt ? t.total : t.orderTotal}>{formatMoney(order.totalIdr)}</Row>
            <Row label={t.fee}>{formatMoney(order.platformFeeIdr)}</Row>
            <Row label={t.refunded}>{order.refundIdr ? formatMoney(order.refundIdr) : t.none}</Row>
            <Row label={t.sellerCredit}>{order.balanceEntries.length ? formatMoney(credited) : t.notCredited}</Row>
          </dl>
        </section>

        <section className="card p-5" aria-labelledby="parties">
          <h2 id="parties" className="mb-2 font-bold">{t.parties}</h2>
          <dl className="divide-y divide-slate-100">
            <Row label={t.buyer}>
              <Link href={`/admin/users/${order.buyer.id}`} className="hover:text-brand-700">{order.buyer.name || dict.common.deletedUser}</Link>
              <span className="block text-xs text-slate-500">{order.buyer.email}</span>
            </Row>
            <Row label={t.seller}>
              <Link href={`/admin/users/${order.seller.userId}`} className="hover:text-brand-700">{order.seller.displayName || dict.common.deletedShop}</Link>
              <span className="block text-xs text-slate-500">{order.seller.user.email}</span>
            </Row>
            <Row label={t.shipTo}>
              <ShippingAddressBlock address={address} />
            </Row>
          </dl>
        </section>

        <section className="card p-5" aria-labelledby="payment">
          <h2 id="payment" className="mb-2 font-bold">{t.payment}</h2>
          <dl className="divide-y divide-slate-100">
            <Row label={t.created}>{at(order.createdAt)}</Row>
            <Row label={t.paidAt}>{at(order.paidAt)}</Row>
            <Row label={t.paymentRef}><span className="num text-xs">{order.paymentRef ?? t.none}</span></Row>
            <Row label={t.refundedAt}>{at(order.refundedAt)}</Row>
            <Row label={t.cancelledAt}>{at(order.cancelledAt)}</Row>
          </dl>
        </section>

        <section className="card p-5" aria-labelledby="delivery">
          <h2 id="delivery" className="mb-2 font-bold">{t.delivery}</h2>
          <dl className="divide-y divide-slate-100">
            <Row label={t.carrier}>{order.carrier ?? t.none}</Row>
            <Row label={t.tracking}><span className="num">{order.trackingNumber ?? t.none}</span></Row>
            <Row label={t.shippedAt}>{at(order.shippedAt)}</Row>
            <Row label={t.deliveredAt}>{at(order.deliveredAt)}</Row>
            <Row label={t.completedAt}>{at(order.completedAt)}</Row>
            {order.returnRequest && (
              <Row label={t.returnTitle}>
                {pick(RETURN_STATUS_LABELS[order.returnRequest.status as keyof typeof RETURN_STATUS_LABELS], locale)} ·{" "}
                {pick(RETURN_REASON_LABELS[order.returnRequest.reason as keyof typeof RETURN_REASON_LABELS], locale)}
              </Row>
            )}
            {order.dispute && (
              <Row label={t.disputeTitle}>
                <Link href={`/disputes/${order.dispute.id}`} className="font-medium text-brand-700 hover:underline">
                  {pick(DISPUTE_STATUS_LABELS[order.dispute.status as keyof typeof DISPUTE_STATUS_LABELS], locale)}
                </Link>
              </Row>
            )}
          </dl>
        </section>
      </div>

      <section className="card mt-4 p-5" aria-labelledby="timeline">
        <h2 id="timeline" className="mb-3 font-bold">{t.timeline}</h2>
        <ol className="space-y-3">
          {order.events.map((e) => (
            <li key={e.id} className="text-sm">
              <p>{eventText(e, dict)}</p>
              <p className="text-xs text-slate-500">{formatDateTime(e.createdAt, locale)}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
