import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireTrader } from "@/lib/auth/dal";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { getBuyerOffers, offerStatus } from "@/lib/offers";
import { OfferStatusBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).offers.buyerTitle };
}

/** The buyer's offers, newest first; an accepted one links straight to checkout at its price. */
export default async function BuyerOffersPage() {
  const user = await requireTrader("/account/offers");
  const [offers, dict, locale] = await Promise.all([getBuyerOffers(user.id), getDictionary(), getLocale()]);
  const t = dict.offers;
  const now = new Date();

  return (
    <>
      <PageHeader title={t.buyerTitle} description={t.buyerIntro} />
      {offers.length === 0 ? (
        <EmptyState title={t.buyerNone} description={t.buyerNoneHint} action={<ButtonLink href="/listings">{dict.account.findSomething}</ButtonLink>} />
      ) : (
        <ul className="card divide-y divide-rule">
          {offers.map((o) => {
            const status = offerStatus(o, now);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-plate">
                  {o.listing.images[0] && <Image src={mediaUrl(o.listing.images[0].key)} alt="" fill sizes="64px" className="object-cover" />}
                </div>
                <div className="min-w-44 flex-1 text-sm">
                  <Link href={`/listings/${o.listing.slug}`} className="font-semibold text-ink hover:underline">
                    {o.listing.title}
                  </Link>
                  <p className="text-slate-600">{t.youOffered(formatMoney(o.amountIdr), formatDate(o.createdAt, locale))}</p>
                  <p className="text-xs text-slate-500">{t.asking(formatMoney(o.listing.priceIdr))}</p>
                </div>
                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <OfferStatusBadge status={status} />
                  {status === "ACCEPTED" && o.listing.status === "ACTIVE" && (
                    <>
                      <ButtonLink href={`/checkout/${o.listing.id}?offer=${o.id}`} className="rounded-full! px-4 py-1.5">
                        {dict.listing.buyAtOffer(formatMoney(o.amountIdr))}
                      </ButtonLink>
                      <span className="text-xs font-medium text-fail">{t.buyBy(formatDateTime(o.expiresAt, locale))}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
