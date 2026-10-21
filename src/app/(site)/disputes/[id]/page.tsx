import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { getDisputeForUser } from "@/lib/data/orders";
import { DISPUTE_REASON_LABELS, DISPUTE_RESOLUTION_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney } from "@/lib/format";
import { postDisputeMessageAction } from "@/actions/orders";
import { markDisputeUnderReviewAction, resolveDisputeAction } from "@/actions/admin";
import { OrderStatusBadge } from "@/components/badges";
import { ActionButton } from "@/components/forms";
import { Badge, PageSkeleton } from "@/components/ui";
import { MessageForm, ResolveForm } from "./dispute-forms";

export const metadata: Metadata = { title: "Dispute", robots: { index: false } };

export default function DisputePage({ params }: PageProps<"/disputes/[id]">) {
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

async function Dispute({ params }: { params: PageProps<"/disputes/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser(`/disputes/${id}`);
  const dispute = await getDisputeForUser(id, user);
  if (!dispute) notFound();
  const closed = dispute.status === "RESOLVED";
  const orderHref = dispute.role === "BUYER" ? `/account/orders/${dispute.order.id}` : dispute.role === "SELLER" ? `/sell/orders/${dispute.order.id}` : `/admin/disputes`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-6">
        <div>
          <Link href={orderHref} className="text-sm text-slate-500 hover:text-brand-700">Back to order</Link>
          <h1 className="mt-2 text-2xl font-bold">Dispute: {DISPUTE_REASON_LABELS[dispute.reason as keyof typeof DISPUTE_REASON_LABELS]}</h1>
          <p className="text-sm text-slate-500">
            {dispute.snapshot.title}, order {dispute.order.number}, opened {formatDateTime(dispute.createdAt)}
          </p>
        </div>

        {closed && dispute.resolution && (
          <div className="rounded-xl bg-brand-50 p-4 text-sm text-brand-900">
            <p className="font-semibold">Resolved: {DISPUTE_RESOLUTION_LABELS[dispute.resolution as keyof typeof DISPUTE_RESOLUTION_LABELS]}{dispute.refundIdr ? ` (${formatMoney(dispute.refundIdr)})` : ""}</p>
            {dispute.resolutionNote && <p className="mt-1">{dispute.resolutionNote}</p>}
          </div>
        )}

        <ol className="space-y-3" aria-label="Messages">
          {dispute.messages.map((m) => (
            <li key={m.id} className="card p-4">
              <div className="mb-2 flex items-center gap-2 text-xs">
                <Badge className={ROLE_STYLE[m.authorRole]}>{m.authorRole === "ADMIN" ? "ReGear" : m.authorRole.toLowerCase()}</Badge>
                <span className="font-medium text-slate-700">{m.authorRole === "ADMIN" ? "ReGear specialist" : m.author.name}</span>
                <span className="text-slate-400">{formatDateTime(m.createdAt)}</span>
              </div>
              <p className="text-sm whitespace-pre-line text-slate-800">{m.body}</p>
            </li>
          ))}
        </ol>

        {!closed && <MessageForm action={postDisputeMessageAction.bind(null, dispute.id)} />}
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2 p-5 text-sm">
          <h2 className="font-bold">Case details</h2>
          <p>Status: <strong>{dispute.status.replace("_", " ").toLowerCase()}</strong></p>
          <p className="flex items-center gap-2">Order: <OrderStatusBadge status={dispute.order.status} /></p>
          <p>Total: {formatMoney(dispute.order.totalIdr)}</p>
          <p>Buyer: {dispute.order.buyer.name}</p>
          <p>Seller: {dispute.order.seller.displayName}</p>
          {dispute.order.trackingNumber && <p>Tracking: {dispute.order.carrier} <span className="num font-semibold">{dispute.order.trackingNumber}</span></p>}
        </div>
        {dispute.role === "ADMIN" && !closed && (
          <div className="card space-y-4 p-5">
            <h2 className="font-bold">Admin</h2>
            {dispute.status === "OPEN" && <ActionButton action={markDisputeUnderReviewAction.bind(null, dispute.id)} variant="secondary">Mark under review</ActionButton>}
            <ResolveForm action={resolveDisputeAction.bind(null, dispute.id)} totalIdr={dispute.order.totalIdr} />
          </div>
        )}
        <p className="text-xs text-slate-500">
          Keep all communication here so our team has the full picture. Never share payment details or move the deal off-platform.
        </p>
      </aside>
    </div>
  );
}
