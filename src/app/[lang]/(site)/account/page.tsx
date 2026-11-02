import { Store } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { getSellerProfile, requireUser } from "@/lib/auth/dal";
import { getBuyerOrders, getFavorites } from "@/lib/data/orders";
import { TERMINAL_STATUSES } from "@/lib/orders/state";
import type { OrderStatus } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { TileRow } from "@/components/listing-card";
import { OrderList } from "@/components/order-list";
import { RecentlyViewed } from "@/components/recently-viewed";
import { ButtonLink, EmptyState, StatCard } from "@/components/ui";

// My ReGear's summary: who you are, what's on its way, what you're watching,
// what you looked at lately, and a way into selling.
export default async function AccountPage() {
  const user = await requireUser("/account");
  const [orders, favorites, seller, profile, t, locale] = await Promise.all([
    getBuyerOrders(user.id),
    getFavorites(user.id),
    getSellerProfile(user.id),
    db.user.findUnique({ where: { id: user.id }, select: { createdAt: true } }),
    getDictionary(),
    getLocale(),
  ]);
  const open = orders.filter((o) => !TERMINAL_STATUSES.includes(o.status as OrderStatus));

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-100 text-xl font-bold text-brand-800" aria-hidden>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{t.account.hi(user.name.split(" ")[0])}</h1>
          <p className="text-sm text-slate-600">
            {user.email}
            {profile && <> · {t.account.memberSince(formatDate(profile.createdAt, locale))}</>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t.account.openOrders} value={open.length} />
        <StatCard label={t.account.allPurchases} value={orders.length} />
        <StatCard label={t.account.savedItems} value={favorites.length} />
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t.account.inProgress}</h2>
          <Link href="/account/orders" className="text-sm font-semibold text-brand-700 hover:underline">
            {t.account.seeAllPurchases}
          </Link>
        </div>
        {open.length ? (
          <OrderList basePath="/account/orders" orders={open.slice(0, 5).map((o) => ({ ...o, counterpart: o.seller.displayName || t.common.deletedShop }))} />
        ) : (
          <EmptyState title={t.account.noneInProgress} action={<ButtonLink href="/listings">{t.account.findSomething}</ButtonLink>} />
        )}
      </section>

      {favorites.length > 0 && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{t.account.watchlistTitle}</h2>
            <Link href="/account/favorites" className="text-sm font-semibold text-brand-700 hover:underline">
              {t.account.seeWatchlist}
            </Link>
          </div>
          <TileRow listings={favorites.slice(0, 6)} />
        </section>
      )}

      <RecentlyViewed title={t.account.recentTitle} clear={t.account.clearRecent} variant="panel" />

      <section className="mt-10 flex flex-col gap-4 rounded-2xl bg-plate p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Store className="mt-0.5 size-6 shrink-0 text-slate-600" aria-hidden />
          <div>
            <h2 className="font-bold">{t.account.sellingTitle}</h2>
            <p className="text-sm text-slate-600">{t.account.sellingBody}</p>
          </div>
        </div>
        <Link
          href={seller ? "/sell" : "/sell/listings/new"}
          className="press inline-flex h-10 shrink-0 items-center self-start rounded-full bg-inverse px-5 text-sm font-semibold text-white hover:bg-[#2a3448] sm:self-auto"
        >
          {seller ? t.account.sellerHubCta : t.account.sellingCta}
        </Link>
      </section>
    </>
  );
}
