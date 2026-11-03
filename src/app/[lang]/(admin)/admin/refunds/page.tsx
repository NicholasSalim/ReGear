import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/dal";
import { getManualRefunds } from "@/lib/data/payouts";
import { formatDateTime, formatMoney } from "@/lib/format";
import { bankName, maskAccount } from "@/lib/payouts/provider";
import { markRefundSentAction } from "@/actions/admin";
import { EmptyState, PageHeader } from "@/components/ui";
import { RefundSentForm } from "../admin-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.refunds.title };
}

type Row = Awaited<ReturnType<typeof getManualRefunds>>["toSend"][number];

export default async function AdminRefundsPage() {
  await requireAdmin();
  const [locale, dict, d] = await Promise.all([getLocale(), getDictionary(), getManualRefunds()]);
  const t = dict.admin.refunds;

  const heading = (o: Row) => (
    <p className="text-base font-semibold">
      <span className="num">{formatMoney(o.refundIdr)}</span>
      <span className="ml-2 font-normal text-slate-500">
        <Link href={`/admin/orders/${o.id}`} className="hover:text-brand-700">{o.number}</Link> ·{" "}
        <Link href={`/admin/users/${o.buyer.id}`} className="hover:text-brand-700">{o.buyer.name || dict.common.deletedUser}</Link> · {o.buyer.email}
      </span>
    </p>
  );
  const owedSince = (o: Row) => o.events[0] && (
    <div>
      <dt className="text-slate-500">{t.owedSince}</dt>
      <dd>{formatDateTime(o.events[0].createdAt, locale)}</dd>
    </div>
  );

  return (
    <>
      <PageHeader title={t.title} description={t.intro} />

      <section aria-labelledby="to-send">
        <h2 id="to-send" className="mb-3 text-lg font-bold">{t.toSend}</h2>
        {d.toSend.length === 0 ? (
          <EmptyState title={t.toSendEmpty} />
        ) : (
          <ul className="space-y-4">
            {d.toSend.map((o) => (
              <li key={o.id} className="card grid grid-cols-1 gap-5 p-5 md:grid-cols-[1fr_18rem]">
                <div className="space-y-2 text-sm">
                  {heading(o)}
                  <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {/* The full number: this is what the admin transfers to. */}
                    <div>
                      <dt className="text-slate-500">{t.account}</dt>
                      <dd>
                        {bankName(o.refundBank ?? "")} <span className="num">{o.refundAccountNumber}</span> · {o.refundAccountName}
                      </dd>
                    </div>
                    {owedSince(o)}
                  </dl>
                </div>
                <RefundSentForm action={markRefundSentAction.bind(null, o.id)} id={o.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="waiting">
        <h2 id="waiting" className="text-lg font-bold">{t.waiting}</h2>
        <p className="mb-3 text-sm text-slate-600">{t.waitingIntro}</p>
        {d.waiting.length === 0 ? (
          <EmptyState title={t.waitingEmpty} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {d.waiting.map((o) => (
              <li key={o.id} className="space-y-1 p-4 text-sm">
                {heading(o)}
                <dl className="text-xs">{owedSince(o)}</dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="sent">
        <h2 id="sent" className="mb-3 text-lg font-bold">{t.sent}</h2>
        {d.sent.length === 0 ? (
          <EmptyState title={t.sentEmpty} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {d.sent.map((o) => (
              <li key={o.id} className="space-y-1 p-4 text-sm">
                {heading(o)}
                <p className="text-xs text-slate-500">
                  {bankName(o.refundBank ?? "")} {maskAccount(o.refundAccountNumber ?? "")} · {o.refundAccountName} ·{" "}
                  {o.refundedAt && formatDateTime(o.refundedAt, locale)}
                </p>
                {o.refundNote && (
                  <p className="text-xs text-slate-600">
                    {t.reference}: {o.refundNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
