import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/auth/dal";
import { getAdminPayouts } from "@/lib/data/payouts";
import { formatDateTime, formatMoney } from "@/lib/format";
import { bankName } from "@/lib/payouts/provider";
import { maskAccount } from "@/lib/payouts/service";
import { withdrawalDecisionAction } from "@/actions/payouts";
import { WithdrawalStatusBadge } from "@/components/badges";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { WithdrawalPayForm, WithdrawalReviewForm } from "../admin-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).payouts.adminTitle };
}

type Row = Awaited<ReturnType<typeof getAdminPayouts>>["review"][number];

export default async function AdminPayoutsPage() {
  await requireAdmin();
  const [locale, dict, d] = await Promise.all([getLocale(), getDictionary(), getAdminPayouts()]);
  const t = dict.payouts;

  // Everything the admin needs to make (or check) the bank transfer.
  const details = (w: Row) => (
    <div className="space-y-2 text-sm">
      <p className="text-base font-semibold">
        <span className="num">{formatMoney(w.amountIdr)}</span>
        <span className="ml-2 font-normal text-slate-500">
          <Link href={`/sellers/${w.seller.slug}`} className="hover:text-brand-700">{w.seller.displayName}</Link> · {w.seller.user.email}
        </span>
      </p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">{t.account}</dt>
          <dd>
            {bankName(w.bank)} <span className="num">{w.accountNumber}</span> · {w.accountName}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">{t.verifiedName}</dt>
          <dd>{w.seller.verifications[0]?.legalName ?? t.none}</dd>
        </div>
        <div>
          <dt className="text-slate-500">{t.requested}</dt>
          <dd>{formatDateTime(w.createdAt, locale)}</dd>
        </div>
      </dl>
      {w.reasons.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {w.reasons.map((r) => (
            <li key={r} className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">{t.reasons[r] ?? r}</li>
          ))}
        </ul>
      )}
      {/* Set when sending was interrupted, or the simulator refused it: check before paying. */}
      {w.note && <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{w.note}</p>}
    </div>
  );

  return (
    <>
      <PageHeader title={t.adminTitle} description={t.adminIntro} />
      {d.mode === "simulated" && <p className="mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800">{t.simulatedMode}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={t.owed} value={formatMoney(d.owedIdr)} hint={t.owedHint} />
        <StatCard label={t.inFlight} value={formatMoney(d.inFlightIdr)} hint={t.openCount(d.inFlightCount)} />
      </div>

      <section className="mt-8" aria-labelledby="review">
        <h2 id="review" className="mb-3 text-lg font-bold">{t.reviewTitle}</h2>
        {d.review.length === 0 ? (
          <EmptyState title={t.reviewEmpty} />
        ) : (
          <ul className="space-y-4">
            {d.review.map((w) => (
              <li key={w.id} className="card grid gap-5 p-5 md:grid-cols-[1fr_18rem]">
                {details(w)}
                <WithdrawalReviewForm action={withdrawalDecisionAction.bind(null, w.id)} id={w.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="to-pay">
        <h2 id="to-pay" className="text-lg font-bold">{t.manualTitle}</h2>
        <p className="mb-3 text-sm text-slate-600">{t.manualIntro}</p>
        {d.toPay.length === 0 ? (
          <EmptyState title={t.manualEmpty} />
        ) : (
          <ul className="space-y-4">
            {d.toPay.map((w) => (
              <li key={w.id} className="card grid gap-5 p-5 md:grid-cols-[1fr_18rem]">
                {details(w)}
                <WithdrawalPayForm action={withdrawalDecisionAction.bind(null, w.id)} id={w.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="recent">
        <h2 id="recent" className="mb-3 text-lg font-bold">{t.recentTitle}</h2>
        {d.recent.length === 0 ? (
          <EmptyState title={t.withdrawalsEmpty} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {d.recent.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p>
                    <span className="num font-semibold">{formatMoney(w.amountIdr)}</span> · {w.seller.displayName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {bankName(w.bank)} {maskAccount(w.accountNumber)} · {formatDateTime(w.createdAt, locale)}
                  </p>
                  {w.note && <p className="mt-1 text-xs text-slate-600">{w.note}</p>}
                </div>
                <WithdrawalStatusBadge status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
