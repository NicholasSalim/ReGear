import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { snapshotTitle } from "@/lib/admin/display";
import { formatDateTime, formatMoney } from "@/lib/format";
import { bankName } from "@/lib/payouts/provider";
import { maskAccount, sellerBalance } from "@/lib/payouts/service";
import { OrderStatusBadge, WithdrawalStatusBadge } from "@/components/badges";
import { Badge, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { isBanned } from "@/lib/account/ban-state";
import { banUserAction, unbanUserAction } from "@/actions/admin";
import { BanForm } from "../../admin-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.usersPage.title };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

const orderSelect = { id: true, number: true, status: true, totalIdr: true, createdAt: true, listingSnapshot: true } as const;

export default async function AdminUserPage({ params }: PageProps<"/[lang]/admin/users/[id]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin.usersPage;
  await requireAdmin();
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    include: {
      sellerProfile: true,
      oauthAccounts: { select: { provider: true } },
      // Expired sessions linger until the maintenance job clears them; count the live ones.
      _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } }, purchases: true, disputesOpened: true } },
    },
  });
  if (!user) notFound();
  const seller = user.sellerProfile;

  const [purchases, sales, salesCount, withdrawals, balance, activity, sameInbox] = await Promise.all([
    db.order.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: orderSelect }),
    seller ? db.order.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 10, select: orderSelect }) : [],
    seller ? db.order.count({ where: { sellerId: seller.id } }) : 0,
    seller ? db.withdrawal.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: "desc" }, take: 10 }) : [],
    seller ? sellerBalance(seller.id) : 0,
    db.auditLog.findMany({ where: { OR: [{ actorId: user.id }, { entityId: user.id }] }, orderBy: { createdAt: "desc" }, take: 15 }),
    // Other accounts on this person's inbox (you+1@..., y.o.u@gmail.com).
    user.mailbox
      ? db.user.findMany({
          where: { mailbox: user.mailbox, id: { not: user.id }, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 10,
          select: { id: true, email: true, bannedAt: true, bannedUntil: true },
        })
      : [],
  ]);
  const now = new Date();
  const banned = isBanned(user, now);

  const orderList = (rows: typeof purchases) =>
    rows.length === 0 ? (
      <p className="text-sm text-slate-500">{t.nothing}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm hover:text-brand-700">
              <span className="min-w-0 flex-1 truncate">
                {snapshotTitle(o.listingSnapshot)}
                <span className="block text-xs text-slate-500">
                  <span className="num">{o.number}</span> · {formatDateTime(o.createdAt, locale)}
                </span>
              </span>
              <span className="num">{formatMoney(o.totalIdr)}</span>
              <OrderStatusBadge status={o.status} />
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title={user.name || dict.common.deletedUser}
        description={
          <>
            {user.email}
            <span className="num ml-2 text-xs text-slate-400">{user.id}</span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-1.5">
            {user.role === "ADMIN" && <Badge className="bg-inverse text-white ring-inverse">{t.role.ADMIN}</Badge>}
            {user.deletedAt && <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">{t.deleted}</Badge>}
            {user.lockedUntil && user.lockedUntil > now && <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">{t.locked}</Badge>}
            {banned && <Badge className="bg-rose-600 text-white ring-rose-600">{t.banned}</Badge>}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="account">
          <h2 id="account" className="mb-2 font-bold">{t.account}</h2>
          <dl className="divide-y divide-slate-100">
            <Row label={t.joinedLabel}>{formatDateTime(user.createdAt, locale)}</Row>
            <Row label={t.emailConfirmed}>{user.emailVerifiedAt ? formatDateTime(user.emailVerifiedAt, locale) : t.no}</Row>
            <Row label={t.signIn}>
              {[user.passwordHash && t.password, ...user.oauthAccounts.map((a) => (a.provider === "google" ? "Google" : a.provider))].filter(Boolean).join(", ") || t.none}
            </Row>
            <Row label={t.sessions}>{user._count.sessions}</Row>
            {sameInbox.length > 0 && (
              <Row label={t.sameInbox}>
                <ul className="space-y-1">
                  {sameInbox.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/users/${u.id}`} className="text-brand-700 hover:underline [overflow-wrap:anywhere]">
                        {u.email}
                      </Link>
                      {isBanned(u, now) && <Badge className="bg-rose-600 text-white ring-rose-600">{t.banned}</Badge>}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
            <Row label={t.language}>{user.locale.toUpperCase()}</Row>
            {user.deletedAt && <Row label={t.deleted}>{formatDateTime(user.deletedAt, locale)}</Row>}
          </dl>
        </section>

        <section className="card p-5" aria-labelledby="shop">
          <h2 id="shop" className="mb-2 font-bold">{t.shop}</h2>
          {seller ? (
            <dl className="divide-y divide-slate-100">
              <Row label={t.shopName}>
                <Link href={`/sellers/${seller.slug}`} className="hover:text-brand-700">{seller.displayName || dict.common.deletedShop}</Link>
              </Row>
              <Row label={t.verification}>
                <Link href={`/admin/verifications?q=${encodeURIComponent(user.email)}#history`} className="hover:text-brand-700">
                  {t.sellerStatus[seller.verificationStatus] ?? seller.verificationStatus}
                </Link>
              </Row>
              <Row label={t.balance}>{formatMoney(balance)}</Row>
              <Row label={t.payoutAccount}>
                {seller.payoutBank && seller.payoutAccountNumber
                  ? `${bankName(seller.payoutBank)} ${maskAccount(seller.payoutAccountNumber)} · ${seller.payoutAccountName}`
                  : t.none}
              </Row>
              <Row label={t.salesLabel}>{salesCount}</Row>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">{t.noShop}</p>
          )}
        </section>
      </div>

      {user.role !== "ADMIN" && !user.deletedAt && (
        <section className="card mt-4 p-5" aria-labelledby="ban">
          <h2 id="ban" className="mb-2 font-bold">{t.banTitle}</h2>
          {banned ? (
            <>
              <p className="text-sm font-semibold text-rose-700">
                {user.bannedUntil ? t.bannedUntil(formatDateTime(user.bannedUntil, locale)) : t.bannedForever}{" "}
                <span className="font-normal text-slate-500">{t.bannedSince(formatDateTime(user.bannedAt!, locale))}</span>
              </p>
              {user.banReason && <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">{t.banReasonShown(user.banReason)}</p>}
              <div className="mt-3">
                <ActionButton action={unbanUserAction.bind(null, user.id)} variant="secondary" confirm={t.unbanConfirm}>
                  {t.unban}
                </ActionButton>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">{t.changeBan}</summary>
                <div className="mt-3 max-w-md">
                  <BanForm action={banUserAction.bind(null, user.id)} banned />
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="mb-3 max-w-2xl text-sm text-slate-600">{t.banIntro}</p>
              <div className="max-w-md">
                <BanForm action={banUserAction.bind(null, user.id)} banned={false} />
              </div>
            </>
          )}
        </section>
      )}

      {seller && (
        <section className="card mt-4 p-5" aria-labelledby="withdrawals">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="withdrawals" className="font-bold">{t.withdrawals}</h2>
            <Link href={`/admin/payouts?q=${encodeURIComponent(user.email)}#history`} className="text-sm font-medium text-brand-700 hover:underline">{t.seeAll}</Link>
          </div>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-slate-500">{t.nothing}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="num font-semibold">{formatMoney(w.amountIdr)}</span>
                    <span className="block text-xs text-slate-500">
                      {bankName(w.bank)} {maskAccount(w.accountNumber)} · {formatDateTime(w.createdAt, locale)}
                    </span>
                  </span>
                  <WithdrawalStatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="purchases">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="purchases" className="font-bold">{t.purchases(user._count.purchases)}</h2>
            <Link href={`/admin/orders?q=${encodeURIComponent(user.email)}`} className="text-sm font-medium text-brand-700 hover:underline">{t.seeAll}</Link>
          </div>
          {orderList(purchases)}
        </section>
        {seller && (
          <section className="card p-5" aria-labelledby="sales">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="sales" className="font-bold">{t.sales(salesCount)}</h2>
              <Link href={`/admin/orders?q=${encodeURIComponent(user.email)}`} className="text-sm font-medium text-brand-700 hover:underline">{t.seeAll}</Link>
            </div>
            {orderList(sales)}
          </section>
        )}
      </div>

      <section className="card mt-4 p-5" aria-labelledby="activity">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 id="activity" className="font-bold">{t.activity}</h2>
          <Link href={`/admin/audit?q=${user.id}`} className="text-sm font-medium text-brand-700 hover:underline">{t.seeAll}</Link>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">{t.nothing}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>
                  {dict.admin.auditActions[a.action] ?? a.action}
                  {a.actorId !== user.id && <span className="ml-1 text-xs text-slate-500">({t.byOther})</span>}
                </span>
                <span className="text-xs text-slate-500">
                  {formatDateTime(a.createdAt, locale)}
                  {a.ip && ` · ${a.ip}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
