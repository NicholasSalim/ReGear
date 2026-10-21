import Image from "next/image";
import Link from "next/link";
import { CircleDot, Package, ShieldAlert } from "lucide-react";
import {
  acceptOrderAction,
  cancelOrderAction,
  confirmDeliveryAction,
  leaveReviewAction,
  openDisputeAction,
  payOrderAction,
  receiveReturnAction,
  requestReturnAction,
  respondReturnAction,
  shipOrderAction,
  shipReturnAction,
} from "@/actions/orders";
import { RETURN_REASON_LABELS, RETURN_STATUS_LABELS, type ReturnStatus } from "@/lib/constants";
import type { OrderForUser } from "@/lib/data/orders";
import { formatDateTime, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { canOpenDispute, isWithinReturnWindow } from "@/lib/orders/state";
import { GradeBadge, OrderStatusBadge, warrantyLabel } from "@/components/badges";
import {
  ActionButton,
  CancelForm,
  DisputeForm,
  Reveal,
  ReturnRequestForm,
  ReturnResponseForm,
  ReviewForm,
  ShipForm,
} from "@/components/order-actions";

const STEPS = ["PAID", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export function OrderDetail({ order, now }: { order: OrderForUser; now: Date }) {
  const isBuyer = order.role === "BUYER";
  const isSeller = order.role === "SELLER";
  const s = order.status;
  const reachedIndex = STEPS.findIndex((step) => step === s);
  const stepTimes = [order.paidAt, order.shippedAt, order.deliveredAt, order.completedAt];
  const returnDaysLeft = order.deliveredAt
    ? Math.max(0, Math.ceil((order.deliveredAt.getTime() + order.returnWindowDays * 86_400_000 - now.getTime()) / 86_400_000))
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Order {order.number}</h1>
          <p className="text-sm text-slate-500">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <OrderStatusBadge status={s} />
      </div>

      {/* Progress tracker */}
      {!["CANCELLED", "PENDING_PAYMENT"].includes(s) && (
        <ol className="card grid grid-cols-4 gap-2 p-4 text-center text-xs" aria-label="Order progress">
          {STEPS.map((step, i) => {
            const done = !!stepTimes[i];
            return (
              <li key={step} className="flex flex-col items-center gap-1">
                <span className={`grid size-7 place-items-center rounded-full ${done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`} aria-hidden>
                  {i + 1}
                </span>
                <span className={done ? "font-semibold text-ink" : "text-slate-500"}>{step.charAt(0) + step.slice(1).toLowerCase()}</span>
                {stepTimes[i] && <span className="text-slate-400">{formatDateTime(stepTimes[i]!)}</span>}
                <span className="sr-only">{done ? "completed" : reachedIndex >= i ? "current" : "pending"}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {/* Item */}
          <section className="card flex gap-4 p-4">
            <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {order.snapshot.imageKey && <Image src={mediaUrl(order.snapshot.imageKey)} alt="" fill sizes="96px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <Link href={`/listings/${order.snapshot.slug}`} className="font-semibold text-ink hover:text-brand-700">
                {order.snapshot.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <GradeBadge grade={order.snapshot.conditionGrade} />
                <span>
                  {warrantyLabel(order.snapshot.warrantyType)}
                  {order.snapshot.warrantyMonths ? `, ${order.snapshot.warrantyMonths} months` : ""}
                </span>
                <span>{order.returnWindowDays ? `${order.returnWindowDays}-day returns` : "No returns"}</span>
              </div>
              <p className="text-sm text-slate-600">
                {isBuyer ? (
                  <>
                    Sold by <Link className="font-medium hover:text-brand-700" href={`/sellers/${order.seller.slug}`}>{order.seller.displayName}</Link>
                  </>
                ) : (
                  <>Buyer: {order.buyer.name}</>
                )}
              </p>
            </div>
          </section>

          {/* Actions */}
          <section className="card space-y-4 p-5" aria-labelledby="next-steps">
            <h2 id="next-steps" className="font-bold">Next steps</h2>
            <div className="flex flex-wrap gap-3">
              {isBuyer && s === "PENDING_PAYMENT" && (
                <>
                  <div className="w-full rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                    Complete payment to secure this item. Your money is held in escrow until you accept the item.
                    <span className="block text-xs text-indigo-700">Demo mode: payments are simulated, no card is charged.</span>
                  </div>
                  <ActionButton action={payOrderAction.bind(null, order.id)}>Pay {formatMoney(order.totalCents)}</ActionButton>
                </>
              )}
              {(isBuyer || isSeller) && (s === "PENDING_PAYMENT" || s === "PAID") && (
                <Reveal label="Cancel order" variant="ghost">
                  <CancelForm action={cancelOrderAction.bind(null, order.id)} />
                </Reveal>
              )}
              {isSeller && s === "PAID" && (
                <div className="w-full">
                  <ShipForm action={shipOrderAction.bind(null, order.id)} />
                </div>
              )}
              {isBuyer && s === "PAID" && <p className="text-sm text-slate-600">Waiting for the seller to ship your item.</p>}
              {isBuyer && s === "SHIPPED" && (
                <ActionButton action={confirmDeliveryAction.bind(null, order.id)}>I received the item</ActionButton>
              )}
              {isSeller && s === "SHIPPED" && <p className="text-sm text-slate-600">In transit. The buyer will confirm delivery.</p>}
              {isBuyer && s === "DELIVERED" && (
                <>
                  <p className="w-full text-sm text-slate-600">
                    Check the item against its condition report. Accepting releases payment to the seller.
                  </p>
                  <ActionButton action={acceptOrderAction.bind(null, order.id)} confirm="Accept the item and release payment to the seller?">
                    Accept item
                  </ActionButton>
                  {isWithinReturnWindow(order, now) && !order.returnRequest && (
                    <Reveal label="Request a return">
                      <ReturnRequestForm action={requestReturnAction.bind(null, order.id)} daysLeft={returnDaysLeft} />
                    </Reveal>
                  )}
                </>
              )}
              {isSeller && s === "DELIVERED" && <p className="text-sm text-slate-600">Delivered. Payment is released when the buyer accepts or the return window closes.</p>}
              {s === "COMPLETED" && isBuyer && !order.review && (
                <div className="w-full">
                  <ReviewForm action={leaveReviewAction.bind(null, order.id)} />
                </div>
              )}
              {s === "COMPLETED" && <p className="text-sm text-slate-600">This order is complete.{order.review ? ` You rated the seller ${order.review.rating}★.` : ""}</p>}
              {(s === "CANCELLED" || s === "REFUNDED") && (
                <p className="text-sm text-slate-600">
                  This order is closed{order.refundCents ? `, ${formatMoney(order.refundCents)} refunded` : ""}.
                </p>
              )}
              {order.dispute && (
                <Link href={`/disputes/${order.dispute.id}`} className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                  <ShieldAlert className="size-4" aria-hidden /> View dispute ({order.dispute.status.toLowerCase().replace("_", " ")})
                </Link>
              )}
              {(isBuyer || isSeller) && !order.dispute && canOpenDispute(order) && (
                <Reveal label="Report a problem" variant="ghost">
                  <DisputeForm action={openDisputeAction.bind(null, order.id)} allowNotReceived={s === "PAID" || s === "SHIPPED"} />
                </Reveal>
              )}
            </div>
          </section>

          {/* Return */}
          {order.returnRequest && (
            <section className="card space-y-3 p-5" aria-labelledby="return-heading">
              <h2 id="return-heading" className="font-bold">Return request</h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-medium">{RETURN_STATUS_LABELS[order.returnRequest.status as ReturnStatus]}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Reason</dt>
                  <dd className="font-medium">{RETURN_REASON_LABELS[order.returnRequest.reason as keyof typeof RETURN_REASON_LABELS]}</dd>
                </div>
              </dl>
              <p className="text-sm whitespace-pre-line text-slate-700">{order.returnRequest.details}</p>
              {order.returnRequest.sellerNote && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm"><strong>Seller:</strong> {order.returnRequest.sellerNote}</p>
              )}
              {order.returnRequest.returnTracking && (
                <p className="text-sm">Return shipment: {order.returnRequest.returnCarrier} <span className="num font-semibold">{order.returnRequest.returnTracking}</span></p>
              )}
              {isSeller && order.returnRequest.status === "REQUESTED" && s === "RETURN_IN_PROGRESS" && (
                <ReturnResponseForm action={respondReturnAction.bind(null, order.id)} />
              )}
              {isBuyer && order.returnRequest.status === "APPROVED" && s === "RETURN_IN_PROGRESS" && (
                <ShipForm action={shipReturnAction.bind(null, order.id)} title="Ship the item back" submit="Submit return tracking" />
              )}
              {isSeller && order.returnRequest.status === "SHIPPED_BACK" && s === "RETURN_IN_PROGRESS" && (
                <ActionButton action={receiveReturnAction.bind(null, order.id)} confirm="Confirm you received the item back? The buyer will be refunded in full.">
                  Item received — refund buyer
                </ActionButton>
              )}
            </section>
          )}

          {/* Timeline */}
          <section className="card p-5" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="mb-4 font-bold">Tracking & history</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-6">
              {[...order.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <CircleDot className="absolute top-0.5 -left-[1.95rem] size-4 bg-white text-brand-600" aria-hidden />
                  <p className="text-sm text-ink">{e.message}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5 text-sm" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="mb-3 font-bold">Summary</h2>
            <dl className="space-y-2">
              <Row label="Item" value={formatMoney(order.priceCents)} />
              <Row label="Shipping" value={order.shippingCents ? formatMoney(order.shippingCents) : "Free"} />
              <Row label="Total paid" value={formatMoney(order.totalCents)} strong />
              {!isBuyer && (
                <>
                  <Row label="ReGear fee (5%)" value={`−${formatMoney(order.platformFeeCents)}`} />
                  <Row label="Seller payout" value={formatMoney(order.totalCents - order.platformFeeCents - order.refundCents)} strong />
                </>
              )}
              {order.refundCents > 0 && <Row label="Refunded" value={formatMoney(order.refundCents)} />}
            </dl>
          </section>
          {order.trackingNumber && (
            <section className="card p-5 text-sm">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <Package className="size-4" aria-hidden /> Shipment
              </h2>
              <p>{order.carrier}</p>
              <p className="num font-semibold text-ink">{order.trackingNumber}</p>
            </section>
          )}
          {order.address && (
            <section className="card p-5 text-sm">
              <h2 className="mb-2 font-bold">Ship to</h2>
              <address className="text-slate-700 not-italic">
                {order.address.fullName}
                <br />
                {order.address.line1}
                {order.address.line2 && (
                  <>
                    <br />
                    {order.address.line2}
                  </>
                )}
                <br />
                {order.address.city}
                {order.address.region ? `, ${order.address.region}` : ""} {order.address.postalCode}
                <br />
                {order.address.country}
                <br />
                {order.address.phone}
              </address>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-slate-100 pt-2 font-semibold text-ink" : "text-slate-600"}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
