import Image from "next/image";
import { Check, CircleDot, MessageCircle, ShieldAlert, Truck } from "lucide-react";
import { Link } from "@/i18n/client";
import { ShippingAddressBlock } from "@/components/shipping-address";
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
  saveRefundAccountAction,
  shipOrderAction,
  shipReturnAction,
} from "@/actions/orders";
import {
  DISPUTE_STATUS_LABELS,
  ORDER_STATUS_INFO,
  QRIS_MAX_IDR,
  REFUND_BY_HAND_DAYS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_LABELS,
  type OrderStatus,
  type ReturnStatus,
} from "@/lib/constants";
import { findConversation } from "@/lib/messages";
import type { OrderForUser } from "@/lib/data/orders";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { payments, refundsByHand } from "@/lib/payments";
import { bankName, BANKS, maskAccount } from "@/lib/payouts/provider";
import { BankAccountForm } from "@/components/bank-account-form";
import { canOpenDispute, isWithinReturnWindow } from "@/lib/orders/state";
import { GradeBadge, warrantyLabel } from "@/components/badges";
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

  const statusInfo = ORDER_STATUS_INFO[s as OrderStatus];
  const latestEvent = order.events.at(-1);
  // The step the order is on now: the last one with a time, or none before payment.
  const current = stepTimes.reduce((last, time, i) => (time ? i : last), -1);
  // The buyer can always reach the seller; the seller replies in a conversation the buyer started.
  const conversation = isSeller ? await findConversation(order.buyerId, order.listingId) : null;
  const tracked = !["CANCELLED", "PENDING_PAYMENT", "REFUNDED"].includes(s);
  // A bank transfer is refunded by hand, to an account the buyer gives.
  const refundByHand = isBuyer && order.refundIdr > 0 && refundsByHand(order.paymentMethod);
  const refundAccount = order.refundBank && order.refundAccountNumber ? `${bankName(order.refundBank)} ${maskAccount(order.refundAccountNumber)}` : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-slate-500">{t.details}</p>
        <h1 className="text-2xl font-extrabold sm:text-3xl">{t.heading(order.number)}</h1>
      </div>

      {/* Where the order stands, in one sentence and one line of steps. */}
      <section className="card overflow-hidden" aria-labelledby="order-status">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <h2 id="order-status" className="text-xl font-extrabold text-ink">
              {statusInfo ? pick(statusInfo.label, locale) : s}
            </h2>
            {latestEvent && (
              <p className="mt-1 text-sm text-slate-600">
                {eventText(latestEvent, dict)} <span className="text-slate-400">· {formatDateTime(latestEvent.createdAt, locale)}</span>
              </p>
            )}
          </div>
        </div>
        {tracked && (
          <ol className="flex border-t border-rule px-2 pt-5 pb-4 text-center text-xs" aria-label={t.progressAria}>
            {STEPS.map((step, i) => {
              const done = !!stepTimes[i];
              const nextDone = !!stepTimes[i + 1];
              return (
                <li key={step} className="relative flex flex-1 flex-col items-center gap-1 px-1">
                  {i < STEPS.length - 1 && (
                    <span aria-hidden className={`absolute top-3.5 left-1/2 h-0.5 w-full ${nextDone ? "bg-pass" : "bg-rule"}`} />
                  )}
                  <span
                    aria-hidden
                    className={`relative grid size-7 place-items-center rounded-full ${done ? "bg-pass text-white" : "border-2 border-rule bg-surface text-slate-400"} ${i === current ? "ring-4 ring-pass/20" : ""}`}
                  >
                    {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={done ? "font-semibold text-ink" : "text-slate-500"}>{t.steps[step]}</span>
                  {stepTimes[i] && <span className="text-slate-500">{formatDate(stepTimes[i]!, locale)}</span>}
                  <span className="sr-only">{done ? t.stepState.done : reachedIndex >= i ? t.stepState.current : t.stepState.pending}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {/* Item */}
          <section className="card flex flex-wrap gap-4 p-5">
            <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-plate">
              {order.snapshot.imageKey && <Image src={mediaUrl(order.snapshot.imageKey)} alt="" fill sizes="112px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Link href={`/listings/${order.snapshot.slug}`} className="text-base font-semibold text-ink hover:underline">
                {order.snapshot.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <GradeBadge grade={order.snapshot.conditionGrade} />
                <span>
                  {warrantyLabel(order.snapshot.warrantyType, locale)}
                  {order.snapshot.warrantyMonths ? t.warrantyMonths(order.snapshot.warrantyMonths) : ""}
                </span>
                <span aria-hidden>·</span>
                <span>{order.returnWindowDays ? t.returnsDays(order.returnWindowDays) : t.noReturns}</span>
              </div>
              <p className="num text-lg font-bold text-ink">{formatMoney(order.priceIdr)}</p>
              {order.offerId && <p className="text-sm font-semibold text-pass">{t.boughtWithOffer}</p>}
              <Link href={`/listings/${order.snapshot.slug}`} className="inline-block text-sm font-semibold text-brand-700 hover:underline">
                {t.viewListing}
              </Link>
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
                    <span className="mt-1 block">{t.bankTransferNote(order.totalIdr > QRIS_MAX_IDR ? formatMoney(QRIS_MAX_IDR) : null)}</span>
                    {payments.mode !== "live" && (
                      <span className="block text-xs text-indigo-700">{payments.mode === "sandbox" ? t.sandboxNote : t.demoNote}</span>
                    )}
                  </div>
                  <ActionButton action={payOrderAction.bind(null, order.id)}>{t.pay(formatMoney(order.totalIdr))}</ActionButton>
                </>
              )}
              {isBuyer && s === "PAID" && <p className="w-full text-sm text-slate-600">{t.waitingForShipment}</p>}
              {isSeller && s === "PAID" && (
                <div className="w-full">
                  <ShipForm action={shipOrderAction.bind(null, order.id)} title={t.shipTitle} submit={t.markShipped} />
                </div>
              )}
              {(isBuyer || isSeller) && (s === "PENDING_PAYMENT" || s === "PAID") && (
                <Reveal label={t.cancelOrder} variant="ghost">
                  <CancelForm action={cancelOrderAction.bind(null, order.id)} />
                </Reveal>
              )}
              {isBuyer && s === "SHIPPED" && <ActionButton action={confirmDeliveryAction.bind(null, order.id)}>{t.receivedItem}</ActionButton>}
              {isSeller && s === "SHIPPED" && <p className="w-full text-sm text-slate-600">{t.inTransit}</p>}
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
              {isSeller && s === "DELIVERED" && <p className="w-full text-sm text-slate-600">{t.sellerDelivered}</p>}
              {s === "COMPLETED" && isBuyer && !order.review && (
                <div className="w-full">
                  <ReviewForm action={leaveReviewAction.bind(null, order.id)} />
                </div>
              )}
              {s === "COMPLETED" && (
                <p className="w-full text-sm text-slate-600">
                  {t.complete}
                  {order.review ? t.youRated(order.review.rating) : ""}
                </p>
              )}
              {(s === "CANCELLED" || s === "REFUNDED") && (
                <p className="w-full text-sm text-slate-600">
                  {t.closed}
                  {/* A by-hand refund is only "refunded" once an admin has sent it. */}
                  {order.refundIdr ? (order.refundedAt ? t.refunded : t.refundPending)(formatMoney(order.refundIdr)) : ""}.
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

          {refundByHand && (
            <section className="card space-y-3 p-5" aria-labelledby="refund-heading">
              <h2 id="refund-heading" className="font-bold">{t.refundTitle}</h2>
              {order.refundedAt ? (
                <p className="text-sm text-slate-600">{t.refundSentTo(formatMoney(order.refundIdr), refundAccount ?? "", formatDate(order.refundedAt, locale))}</p>
              ) : refundAccount ? (
                <>
                  <p className="text-sm text-slate-600">{t.refundWaiting(formatMoney(order.refundIdr), refundAccount, order.refundAccountName ?? "", REFUND_BY_HAND_DAYS)}</p>
                  <Reveal label={t.changeRefundAccount} variant="ghost">
                    <BankAccountForm action={saveRefundAccountAction.bind(null, order.id)} banks={[...BANKS]} replacing />
                  </Reveal>
                </>
              ) : (
                <>
                  <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.refundNeedsAccount(formatMoney(order.refundIdr), REFUND_BY_HAND_DAYS)}</p>
                  <BankAccountForm action={saveRefundAccountAction.bind(null, order.id)} banks={[...BANKS]} replacing={false} submit={t.saveRefundAccount} />
                </>
              )}
            </section>
          )}

          {/* Return */}
          {order.returnRequest && (
            <section className="card space-y-3 p-5" aria-labelledby="return-heading">
              <h2 id="return-heading" className="font-bold">{t.returnRequest}</h2>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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
                  <CircleDot className="absolute top-0.5 -left-[1.95rem] size-4 bg-surface text-brand-700" aria-hidden />
                  <p className="text-sm text-ink">{eventText(e, dict)}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.createdAt, locale)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-5 text-sm" aria-labelledby="info-heading">
            <h2 id="info-heading" className="mb-3 font-bold">{t.orderInfo}</h2>
            <dl className="space-y-2">
              <Row label={t.orderNumber} value={order.number} />
              <Row label={t.placedOn} value={formatDateTime(order.createdAt, locale)} />
              <Row
                label={isBuyer ? t.seller : t.buyerLabel}
                value={isBuyer ? order.seller.displayName || dict.common.deletedShop : order.buyer.name || dict.common.deletedUser}
              />
            </dl>
            {isBuyer && order.seller.displayName && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={`/account/messages/new?listing=${order.listingId}`}
                  className="press inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-semibold text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50"
                >
                  <MessageCircle className="size-4" aria-hidden /> {dict.messages.contactSeller}
                </Link>
                <Link href={`/sellers/${order.seller.slug}`} className="inline-flex items-center px-1 py-1.5 font-semibold text-brand-700 hover:underline">
                  {dict.listing.visitStore}
                </Link>
              </div>
            )}
            {conversation?.lastSenderId && (
              <Link
                href={`/account/messages/${conversation.id}`}
                className="press mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-semibold text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50"
              >
                <MessageCircle className="size-4" aria-hidden /> {t.messageBuyer}
              </Link>
            )}
          </section>

          <section className="card p-5 text-sm" aria-labelledby="summary-heading">
            <h2 id="summary-heading" className="mb-3 font-bold">{t.summary}</h2>
            <dl className="space-y-2">
              <Row label={t.item} value={formatMoney(order.priceIdr)} />
              <Row label={t.shipping} value={order.shippingIdr ? formatMoney(order.shippingIdr) : t.free} />
              <Row label={order.paidAt ? t.totalPaid : t.orderTotal} value={formatMoney(order.totalIdr)} strong />
              {!isBuyer && (
                <>
                  <Row label={t.fee} value={`−${formatMoney(order.platformFeeIdr)}`} />
                  <Row label={t.payout} value={formatMoney(order.totalIdr - order.platformFeeIdr - order.refundIdr)} strong />
                </>
              )}
              {order.refundIdr > 0 && <Row label={order.refundedAt ? t.refundedLabel : t.refundPendingLabel} value={formatMoney(order.refundIdr)} />}
            </dl>
          </section>

          <section className="card p-5 text-sm" aria-labelledby="delivery-heading">
            <h2 id="delivery-heading" className="mb-3 flex items-center gap-2 font-bold">
              <Truck className="size-4" aria-hidden /> {t.delivery}
            </h2>
            {order.trackingNumber ? (
              <dl className="space-y-2">
                <Row label={t.carrier} value={order.carrier ?? ""} />
                <div className="flex justify-between gap-3 text-slate-600">
                  <dt>{t.tracking}</dt>
                  <dd className="num font-semibold text-ink">{order.trackingNumber}</dd>
                </div>
              </dl>
            ) : (
              tracked && <p className="text-slate-600">{t.notShippedYet}</p>
            )}
            {order.address && (
              <div className={order.trackingNumber || tracked ? "mt-4 border-t border-rule pt-4" : ""}>
                <h3 className="mb-1.5 font-semibold text-ink">{t.shipTo}</h3>
                <ShippingAddressBlock address={order.address} />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-rule pt-2 font-semibold text-ink" : "text-slate-600"}`}>
      <dt>{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
