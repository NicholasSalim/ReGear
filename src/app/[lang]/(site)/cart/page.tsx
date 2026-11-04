import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { requireTrader } from "@/lib/auth/dal";
import { getCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { removeFromCartAction } from "@/actions/buying";
import { GradeBadge } from "@/components/badges";
import { ActionButton } from "@/components/forms";
import { ButtonLink, EmptyState, PageSkeleton } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).cart.metaTitle, robots: { index: false } };
}

export default async function CartPage() {
  const t = (await getDictionary()).cart;
  return (
    <div className="container-page max-w-6xl py-8">
      <h1 className="mb-1 text-3xl font-extrabold">{t.title}</h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">{t.intro}</p>
      <Suspense fallback={<PageSkeleton />}>
        <Cart />
      </Suspense>
    </div>
  );
}

/** The cart grouped by seller, with a summary of what can still be bought. */
async function Cart() {
  const user = await requireTrader("/cart");
  const [items, dict] = await Promise.all([getCart(user.id), getDictionary()]);
  const t = dict.cart;
  if (items.length === 0) {
    return <EmptyState title={t.empty} description={t.emptyHint} action={<ButtonLink href="/listings">{dict.account.findSomething}</ButtonLink>} />;
  }

  const bySeller = new Map<string, typeof items>();
  for (const item of items) bySeller.set(item.seller.id, [...(bySeller.get(item.seller.id) ?? []), item]);
  const available = items.filter((i) => i.status === "ACTIVE");
  const subtotal = available.reduce((sum, i) => sum + i.priceIdr, 0);
  const shipping = available.reduce((sum, i) => sum + i.shippingIdr, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
      <div className="space-y-4">
        {[...bySeller.values()].map((group) => (
          <section key={group[0].seller.id} className="card p-4 sm:p-5" aria-label={t.soldBy(group[0].seller.displayName)}>
            <p className="mb-3 text-sm text-slate-600">
              {t.soldBy("")}
              <Link href={`/sellers/${group[0].seller.slug}`} className="font-semibold text-ink hover:underline">
                {group[0].seller.displayName}
              </Link>
            </p>
            <ul className="divide-y divide-rule">
              {group.map((item) => {
                const buyable = item.status === "ACTIVE";
                return (
                  <li key={item.id} className="flex flex-wrap gap-4 py-4 first:pt-0 last:pb-0">
                    <div className={`relative size-24 shrink-0 overflow-hidden rounded-xl bg-plate ${buyable ? "" : "opacity-50"}`}>
                      {item.images[0] && <Image src={mediaUrl(item.images[0].key)} alt="" fill sizes="96px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <Link href={`/listings/${item.slug}`} className="font-semibold text-ink hover:underline">
                        {item.title}
                      </Link>
                      <div className="mt-1">
                        <GradeBadge grade={item.conditionGrade} />
                      </div>
                      {buyable ? (
                        <p className="mt-1 text-slate-600">{item.shippingIdr ? dict.listing.plusShipping(formatMoney(item.shippingIdr)) : dict.listing.freeShipping}</p>
                      ) : (
                        <p className="mt-1 font-semibold text-fail">{t.unavailable}</p>
                      )}
                    </div>
                    {/* On phones the price and buttons get a row of their own, under the item. */}
                    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-col sm:items-end">
                      <span className="mr-auto sm:hidden" aria-hidden />
                      <p className={`num text-lg font-bold ${buyable ? "text-ink" : "text-slate-400 line-through"}`}>{formatMoney(item.priceIdr)}</p>
                      {buyable && (
                        <ButtonLink href={`/checkout/${item.id}`} className="rounded-full! px-5">
                          {t.checkout}
                        </ButtonLink>
                      )}
                      <ActionButton action={removeFromCartAction.bind(null, item.id)} variant="ghost" className="px-3 py-1 text-xs text-slate-600">
                        {t.remove}
                      </ActionButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="card space-y-4 p-5">
          <h2 className="text-lg font-bold">{t.summary}</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">{t.items(available.length)}</dt><dd className="num">{formatMoney(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">{t.shipping}</dt><dd className="num">{shipping ? formatMoney(shipping) : dict.checkout.free}</dd></div>
            <div className="flex justify-between border-t border-rule pt-3 text-lg font-bold"><dt>{t.total}</dt><dd className="num">{formatMoney(subtotal + shipping)}</dd></div>
          </dl>
          <p className="text-xs text-slate-600">{t.note}</p>
          <p className="flex gap-2 rounded-xl bg-plate p-3 text-xs text-slate-600">
            <ShieldCheck className="size-4 shrink-0 text-pass" aria-hidden /> {dict.checkout.escrowBody}
          </p>
        </div>
      </aside>
    </div>
  );
}
