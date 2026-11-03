import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireSeller } from "@/lib/auth/dal";
import { MIN_WITHDRAWAL_IDR } from "@/lib/constants";
import { getSellerPayouts } from "@/lib/data/payouts";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { BANKS, bankName, payouts } from "@/lib/payouts/provider";
import { maskAccount } from "@/lib/payouts/service";
import { requestWithdrawalAction, savePayoutAccountAction } from "@/actions/payouts";
import { WithdrawalStatusBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageHeader, StatCard, cn } from "@/components/ui";
import { BankAccountForm } from "@/components/bank-account-form";
import { WithdrawForm } from "./payout-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).payouts.sellerTitle };
}

export default async function SellerPayoutsPage() {
  const { seller } = await requireSeller("/sell/payouts");
  const [locale, dict, data] = await Promise.all([getLocale(), getDictionary(), getSellerPayouts(seller.id)]);
  const t = dict.payouts;
  const min = formatMoney(MIN_WITHDRAWAL_IDR);
  const hasAccount = !!(seller.payoutBank && seller.payoutAccountNumber && seller.payoutAccountName);

  // Why the seller can't withdraw right now, if they can't.
  const blocker =
    seller.verificationStatus !== "VERIFIED" ? (
      <>
        {t.needVerified} <Link href="/sell/profile#verification" className="font-semibold underline">{t.getVerified}</Link>
      </>
    ) : !hasAccount ? (
      t.needAccount
    ) : data.hasOpenWithdrawal ? (
      t.openWithdrawal
    ) : data.balance < MIN_WITHDRAWAL_IDR ? (
      t.belowMinimum(min)
    ) : null;

  return (
    <>
      <PageHeader title={t.sellerTitle} description={t.sellerIntro} />
      {payouts.mode === "simulated" && <p className="mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800">{t.simulatedNote}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t.available} value={formatMoney(data.balance)} hint={t.availableHint} />
        <StatCard label={t.beingWithdrawn} value={formatMoney(data.beingWithdrawn)} />
      </div>

      <section className="card mt-6 space-y-3 p-5" aria-labelledby="withdraw">
        <div>
          <h2 id="withdraw" className="font-bold">{t.withdrawTitle}</h2>
          <p className="text-sm text-slate-600">{t.withdrawIntro(min)}</p>
        </div>
        {blocker ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{blocker}</p>
        ) : (
          <WithdrawForm action={requestWithdrawalAction} maxIdr={data.balance} />
        )}
      </section>

      <section className="card mt-6 space-y-4 p-5" aria-labelledby="bank-account">
        <div>
          <h2 id="bank-account" className="font-bold">{t.accountTitle}</h2>
          <p className="text-sm text-slate-600">{t.accountIntro}</p>
        </div>
        {hasAccount ? (
          <p className="text-sm">
            <span className="font-semibold">
              {bankName(seller.payoutBank!)} {maskAccount(seller.payoutAccountNumber!)}
            </span>{" "}
            · {seller.payoutAccountName}
            {seller.payoutAccountSetAt && <span className="block text-xs text-slate-500">{t.accountChangedAt(formatDateTime(seller.payoutAccountSetAt, locale))}</span>}
          </p>
        ) : (
          <p className="text-sm text-slate-500">{t.noAccount}</p>
        )}
        <BankAccountForm action={savePayoutAccountAction} banks={[...BANKS]} replacing={hasAccount} />
      </section>

      <section className="mt-8" aria-labelledby="withdrawals">
        <h2 id="withdrawals" className="mb-3 text-lg font-bold">{t.withdrawalsTitle}</h2>
        {data.withdrawals.length === 0 ? (
          <EmptyState title={t.withdrawalsEmpty} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {data.withdrawals.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="num font-semibold">{formatMoney(w.amountIdr)}</p>
                  <p className="text-xs text-slate-500">
                    {t.to(`${bankName(w.bank)} ${maskAccount(w.accountNumber)}`)} · {formatDate(w.createdAt, locale)}
                  </p>
                </div>
                <WithdrawalStatusBadge status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-bold">{t.historyTitle}</h2>
        {data.entries.length === 0 ? (
          <EmptyState title={t.historyEmpty} action={<ButtonLink href="/sell/orders" variant="secondary">{dict.sell.nav.sales}</ButtonLink>} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {data.entries.map((e) => {
              const label = t.entry[e.type];
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">
                      {e.order && typeof label === "function" ? (
                        <Link href={`/sell/orders/${e.order.id}`} className="hover:text-brand-700">{label(e.order.number)}</Link>
                      ) : typeof label === "string" ? (
                        label
                      ) : (
                        e.type
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(e.createdAt, locale)}</p>
                  </div>
                  <p className={cn("num shrink-0 font-semibold", e.amountIdr < 0 ? "text-slate-700" : "text-emerald-700")}>
                    {e.amountIdr > 0 ? "+" : "−"}
                    {formatMoney(Math.abs(e.amountIdr))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
