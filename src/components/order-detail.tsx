import Image from "next/image";
import { CircleDot, Package, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/client";
import { eventText } from "@/i18n/messages";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
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
import { DISPUTE_STATUS_LABELS, RETURN_REASON_LABELS, RETURN_STATUS_LABELS, type ReturnStatus } from "@/lib/constants";
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

export async function OrderDetail({ order, now }: { order: OrderForUser; now: Date }) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.orders;
  const isBuyer = order.role === "BUYER";
  const isSeller = order.role === "SELLER";
  const s = order.status;
  const reachedIndex = STEPS.findIndex((step) => step === s);
  const stepTimes = [order.paidAt, order.shippedAt, order.deliveredAt, order.completedAt];
  const returnDaysLeft = order.deliveredAt
    ? Math.max(0, Math.ceil((order.deliveredAt.getTime() + order.returnWindowDays * 86_400_000 - now.getTime()) / 86_400_000))
    : 0;
  const disputeStatus = order.dispute ? DISPUTE_STATUS_LABELS[order.dispute.status as keyof typeof DISPUTE_STATUS_LABELS] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.heading(order.number)}</h1>
          <p className="text-sm text-slate-500">{t.placed(formatDateTime(order.createdAt, locale))}</p>
        </div>
        <OrderStatusBadge status={s} />
      </div>

      {/* Progress tracker */}
      {!["CANCELLED", "PENDING_PAYMENT"].includes(s) && (
        <ol className="card grid grid-cols-4 gap-2 p-4 text-center text-xs" aria-label={t.progressAria}>
          {STEPS.map((step, i) => {
            const done = !!stepTimes[i];
            return (
              <li key={step} className="flex flex-col items-center gap-1">
                <span className={`grid size-7 place-items-center rounded-full ${done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"}`} aria-hidden>
                  {i + 1}
                </span>
                <span className={done ? "font-semibold text-ink" : "text-slate-500"}>{t.steps[step]}</span>
                {stepTimes[i] && <span className="text-slate-400">{formatDateTime(stepTimes[i]!, locale)}</span>}
                <span className="sr-only">{done ? t.stepState.done : reachedIndex >= i ? t.stepState.current : t.stepState.pending}</span>
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
                  {warrantyLabel(order.snapshot.warrantyType, locale)}
                  {order.snapshot.warrantyMonths ? t.warrantyMonths(order.snapshot.warrantyMonths) : ""}
                </span>
                <span>{order.returnWindowDays ? t.returnsDays(order.returnWindowDays) : t.noReturns}</span>
              </div>
              <p className="text-sm text-slate-600">
                {isBuyer ? (
                  <>
                    {t.soldBy}{" "}
                    {order.seller.displayName ? (
                      <Link className="font-medium hover:text-brand-700" href={`/sellers/${order.seller.slug}`}>{order.seller.displayName}</Link>
                    ) : (
                      <span className="font-medium">{dict.common.deletedShop}</span>
                    )}
                  </>
                ) : (
                  <>{t.buyer(order.buyer.name || dict.common.deletedUser)}</>
                )}
              </p>
            </div>
          </section>

          {/* Actions */}
          <section className="card space-y-4 p-5" aria-labelledby="next-steps">
            <h2 id="next-steps" className="font-bold">{t.nextSteps}</h2>
            <div className="flex flex-wrap gap-3">
              {isBuyer && s === "PENDING_PAYMENT" && (
                <>
                  <div className="w-full rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
                    {t.payIntro}
                    <span className="block text-xs text-indigo-700">{t.demoNote}</span>
                  </div>
                  <ActionButton action={payOrderAction.bind(null, order.id)}>{t.pay(formatMoney(order.totalIdr))}</ActionButton>
                </>
              )}
              {(isBuyer || isSeller) && (s === "PENDING_PAYMENT" || s === "PAID") && (
                <Reveal label={t.cancelOrder} variant="ghost">
                  <CancelForm action={cancelOrderAction.bind(null, order.id)} />
                </Reveal>
              )}
              {isSeller && s === "PAID" && (
                <div className="w-full">
                  <ShipForm action={shipOrderAction.bind(null, order.id)} title={t.shipTitle} submit={t.markShipped} />
                </div>
              )}
              {isBuyer && s === "PAID" && <p className="text-sm text-slate-600">{t.waitingForShipment}</p>}
              {isBuyer && s === "SHIPPED" && <ActionButton action={confirmDeliveryAction.bind(null, order.id)}>{t.receivedItem}</ActionButton>}
              {isSeller && s === "SHIPPED" && <p className="text-sm text-slate-600">{t.inTransit}</p>}
              {isBuyer && s === "DELIVERED" && (
                <>
                  <p className="w-full text-sm text-slate-600">{t.inspectIntro}</p>
                  <ActionButton action={acceptOrderAction.bind(null, order.id)} confirm={t.acceptConfirm}>
                    {t.acceptItem}
                  </ActionButton>
                  {isWithinReturnWindow(order, now) && !order.returnRequest && (
                    <Reveal label={t.requestReturn}>
                      <ReturnRequestForm action={requestReturnAction.bind(null, order.id)} daysLeft={returnDaysLeft} />
                    </Reveal>
                  )}
                </>
              )}
              {isSeller && s === "DELIVERED" && <p className="text-sm text-slate-600">{t.sellerDelivered}</p>}
              {s === "COMPLETED" && isBuyer && !order.review && (
                <div className="w-full">
                  <ReviewForm action={leaveReviewAction.bind(null, order.id)} />
                </div>
              )}
              {s === "COMPLETED" && (
                <p className="text-sm text-slate-600">
                  {t.complete}
                  {order.review ? t.youRated(order.review.rating) : ""}
                </p>
              )}
              {(s === "CANCELLED" || s === "REFUNDED") && (
                <p className="text-sm text-slate-600">
                  {t.closed}
                  {order.refundIdr ? t.refunded(formatMoney(order.refundIdr)) : ""}.
                </p>
              )}
              {order.dispute && (
                <Link href={`/disputes/${order.dispute.id}`} className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                  <ShieldAlert className="size-4" aria-hidden /> {t.viewDispute(disputeStatus ? pick(disputeStatus, locale) : order.dispute.status)}
                </Link>
              )}
              {(isBuyer || isSeller) && !order.dispute && canOpenDispute(order) && (
                <Reveal label={t.reportProblem} variant="ghost">
                  <DisputeForm action={openDisputeAction.bind(null, order.id)} allowNotReceived={s === "PAID" || s === "SHIPPED"} />
                </Reveal>
              )}
            </div>
          </section>

          {/* Return */}
          {order.returnRequest && (
            <section className="card space-y-3 p-5" aria-labelledby="return-heading">
              <h2 id="return-heading" className="font-bold">{t.returnRequest}</h2>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">{t.status}</dt>
                  <dd className="font-medium">{pick(RETURN_STATUS_LABELS[order.returnRequest.status as ReturnStatus], locale)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">{t.reason}</dt>
                  <dd className="font-medium">{pick(RETURN_REASON_LABELS[order.returnRequest.reason as keyof typeof RETURN_REASON_LABELS], locale)}</dd>
                </div>
              </dl>
              <p className="text-sm whitespace-pre-line text-slate-700">{order.returnRequest.details}</p>
              {order.returnRequest.sellerNote && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm">
                  <strong>{t.sellerNote}</strong> {order.returnRequest.sellerNote}
                </p>
              )}
              {order.returnRequest.returnTracking && (
                <p className="text-sm">
                  {t.returnShipment} {order.returnRequest.returnCarrier} <span className="num font-semibold">{order.returnRequest.returnTracking}</span>
                </p>
              )}
              {isSeller && order.returnRequest.status === "REQUESTED" && s === "RETURN_IN_PROGRESS" && (
                <ReturnResponseForm action={respondReturnAction.bind(null, order.id)} />
              )}
              {isBuyer && order.returnRequest.status === "APPROVED" && s === "RETURN_IN_PROGRESS" && (
                <ShipForm action={shipReturnAction.bind(null, order.id)} title={t.shipBack} submit={t.submitReturnTracking} />
              )}
              {isSeller && order.returnRequest.status === "SHIPPED_BACK" && s === "RETURN_IN_PROGRESS" && (
                <ActionButton action={receiveReturnAction.bind(null, order.id)} confirm={t.receivedConfirm}>
                  {t.receivedButton}
                </ActionButton>
              )}
            </section>
          )}

          {/* Timeline */}
          <section className="card p-5" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="mb-4 font-bold">{t.timeline}</h2>
            <ol className="relative space-y-4 border-l border-slate-200 pl-6">
              {[...order.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <CircleDot className="absolute top-0.5 -left-[1.95rem] size-4 bg-white text-brand-600" aria-hidden />
                  <p className="text-sm text-ink">{eventText(e, dict)}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.createdAt, locale)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5 text-sm" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="mb-3 font-bold">{t.summary}</h2>
            <dl className="space-y-2">
              <Row label={t.item} value={formatMoney(order.priceIdr)} />
              <Row label={t.shipping} value={order.shippingIdr ? formatMoney(order.shippingIdr) : t.free} />
              <Row label={t.totalPaid} value={formatMoney(order.totalIdr)} strong />
              {!isBuyer && (
                <>
                  <Row label={t.fee} value={`−${formatMoney(order.platformFeeIdr)}`} />
                  <Row label={t.payout} value={formatMoney(order.totalIdr - order.platformFeeIdr - order.refundIdr)} strong />
                </>
              )}
              {order.refundIdr > 0 && <Row label={t.refundedLabel} value={formatMoney(order.refundIdr)} />}
            </dl>
          </section>
          {order.trackingNumber && (
            <section className="card p-5 text-sm">
              <h2 className="mb-2 flex items-center gap-2 font-bold">
                <Package className="size-4" aria-hidden /> {t.shipment}
              </h2>
              <p>{order.carrier}</p>
              <p className="num font-semibold text-ink">{order.trackingNumber}</p>
            </section>
          )}
          {order.address && (
            <section className="card p-5 text-sm">
              <h2 className="mb-2 font-bold">{t.shipTo}</h2>
              <address className="text-slate-700 not-italic">
                {[
                  order.address.fullName,
                  order.address.line1,
                  order.address.line2,
                  [order.address.city, order.address.region].filter(Boolean).join(", ") + (order.address.postalCode ? ` ${order.address.postalCode}` : ""),
                  order.address.country,
                  order.address.phone,
                ]
                  .filter(Boolean)
                  .map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
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
