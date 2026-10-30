import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { disputeMessageText } from "@/i18n/messages";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireUser } from "@/lib/auth/dal";
import { getDisputeForUser } from "@/lib/data/orders";
import { DISPUTE_REASON_LABELS, DISPUTE_RESOLUTION_LABELS, DISPUTE_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { postDisputeMessageAction } from "@/actions/orders";
import { markDisputeUnderReviewAction, resolveDisputeAction } from "@/actions/admin";
import { OrderStatusBadge } from "@/components/badges";
import { ActionButton } from "@/components/forms";
import { Badge, PageSkeleton } from "@/components/ui";
import { MessageForm, ResolveForm } from "./dispute-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).disputes.metaTitle, robots: { index: false } };
}

export default function DisputePage({ params }: PageProps<"/[lang]/disputes/[id]">) {
  return (
    <div className="container-page max-w-5xl py-8">
      <Suspense fallback={<PageSkeleton />}>
        <Dispute params={params} />
      </Suspense>
    </div>
  );
}

const ROLE_STYLE: Record<string, string> = {
  BUYER: "bg-sky-50 text-sky-800 ring-sky-600/20",
  SELLER: "bg-violet-50 text-violet-800 ring-violet-600/20",
  ADMIN: "bg-brand-50 text-brand-800 ring-brand-600/20",
};

async function Dispute({ params }: { params: PageProps<"/[lang]/disputes/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/disputes/${id}`);
  const [dispute, locale, dict] = await Promise.all([getDisputeForUser(id, user), getLocale(), getDictionary()]);
  if (!dispute) notFound();
  const t = dict.disputes;
  const closed = dispute.status === "RESOLVED";
  const orderHref = dispute.role === "BUYER" ? `/account/orders/${dispute.order.id}` : dispute.role === "SELLER" ? `/sell/orders/${dispute.order.id}` : `/admin/disputes`;
  const reason = pick(DISPUTE_REASON_LABELS[dispute.reason as keyof typeof DISPUTE_REASON_LABELS], locale);
  const status = DISPUTE_STATUS_LABELS[dispute.status as keyof typeof DISPUTE_STATUS_LABELS];
  const resolution = dispute.resolution ? DISPUTE_RESOLUTION_LABELS[dispute.resolution as keyof typeof DISPUTE_RESOLUTION_LABELS] : undefined;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <div>
          <Link href={orderHref} className="text-sm text-slate-500 hover:text-brand-700">{t.backToOrder}</Link>
          <h1 className="mt-2 text-2xl font-bold">{t.heading(reason)}</h1>
          <p className="text-sm text-slate-500">{t.subtitle(dispute.snapshot.title, dispute.order.number, formatDateTime(dispute.createdAt, locale))}</p>
        </div>

        {closed && resolution && (
          <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
            <p className="font-semibold">
              {t.resolved(pick(resolution, locale))}
              {dispute.refundIdr ? ` (${formatMoney(dispute.refundIdr)})` : ""}
            </p>
            {dispute.resolutionNote && <p className="mt-1">{dispute.resolutionNote}</p>}
          </div>
        )}

        <ol className="space-y-3" aria-label={t.messagesAria}>
          {dispute.messages.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="mb-2 flex items-center gap-2 text-xs">
                <Badge className={ROLE_STYLE[m.authorRole]}>{t.roles[m.authorRole] ?? m.authorRole}</Badge>
                <span className="font-medium text-slate-700">{m.authorRole === "ADMIN" ? t.specialist : m.author.name || dict.common.deletedUser}</span>
                <span className="text-slate-400">{formatDateTime(m.createdAt, locale)}</span>
              </div>
              <p className="text-sm whitespace-pre-line text-slate-800">{disputeMessageText(m, dict)}</p>
            </li>
          ))}
        </ol>

        {!closed && <MessageForm action={postDisputeMessageAction.bind(null, dispute.id)} />}
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2 p-5 text-sm">
          <h2 className="font-bold">{t.caseDetails}</h2>
          <p>
            {t.status} <strong>{status ? pick(status, locale) : dispute.status}</strong>
          </p>
          <p className="flex items-center gap-2">
            {t.order} <OrderStatusBadge status={dispute.order.status} />
          </p>
          <p>{t.total(formatMoney(dispute.order.totalIdr))}</p>
          <p>{t.buyer(dispute.order.buyer.name || dict.common.deletedUser)}</p>
          <p>{t.seller(dispute.order.seller.displayName || dict.common.deletedShop)}</p>
          {dispute.order.trackingNumber && (
            <p>
              {t.tracking} {dispute.order.carrier} <span className="num font-semibold">{dispute.order.trackingNumber}</span>
            </p>
          )}
        </div>
        {dispute.role === "ADMIN" && !closed && (
          <div className="card space-y-4 p-5">
            <h2 className="font-bold">{t.admin}</h2>
            {dispute.status === "OPEN" && (
              <ActionButton action={markDisputeUnderReviewAction.bind(null, dispute.id)} variant="secondary">
                {t.markUnderReview}
              </ActionButton>
            )}
            <ResolveForm action={resolveDisputeAction.bind(null, dispute.id)} maxRefundIdr={dispute.order.totalIdr - dispute.order.platformFeeIdr} />
          </div>
        )}
        <p className="text-xs text-slate-500">{t.stayOnPlatform}</p>
      </aside>
    </div>
  );
}
