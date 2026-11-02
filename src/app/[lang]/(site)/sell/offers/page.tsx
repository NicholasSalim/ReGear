import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { getDictionary, getLocale, type Dictionary } from "@/i18n/server";
import { requireSeller } from "@/lib/auth/dal";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { getSellerOffers, offerStatus } from "@/lib/offers";
import { answerOfferAction } from "@/actions/offers";
import { OfferStatusBadge } from "@/components/badges";
import { AnswerOfferForm } from "@/components/offer-form";
import { EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).offers.sellerTitle };
}

/** Offers on the seller's listings: the ones waiting for an answer first, then the rest. */
export default async function SellerOffersPage() {
  const { seller } = await requireSeller("/sell/offers");
  const [offers, dict, locale] = await Promise.all([getSellerOffers(seller.id), getDictionary(), getLocale()]);
  const t = dict.offers;
  const now = new Date();
  const withStatus = offers.map((o) => ({ ...o, shown: offerStatus(o, now) }));
  const waiting = withStatus.filter((o) => o.shown === "PENDING");
  const earlier = withStatus.filter((o) => o.shown !== "PENDING");

  return (
    <>
      <PageHeader title={t.sellerTitle} description={t.sellerIntro} />
      {offers.length === 0 ? (
        <EmptyState title={t.noOffers} description={t.noOffersHint} />
      ) : (
        <div className="space-y-8">
          {waiting.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">{t.waiting}</h2>
              <ul className="space-y-3">
                {waiting.map((o) => (
                  <li key={o.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <OfferItem offer={o} t={t} locale={locale} />
                    <div className="sm:w-60 sm:shrink-0">
                      <p className="num text-2xl font-extrabold text-ink">{formatMoney(o.amountIdr)}</p>
                      <p className="text-xs text-slate-600">
                        {t.asking(formatMoney(o.listing.priceIdr))} · {t.share(Math.round((o.amountIdr / o.listing.priceIdr) * 100))}
                      </p>
                      <p className="mb-3 text-xs font-medium text-fail">{t.answerBy(formatDateTime(o.expiresAt, locale))}</p>
                      <AnswerOfferForm action={answerOfferAction.bind(null, o.id)} accept={t.accept} decline={t.decline} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {earlier.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">{t.earlier}</h2>
              <ul className="card divide-y divide-rule">
                {earlier.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-4 p-4">
                    <OfferItem offer={o} t={t} locale={locale} />
                    <div className="text-right">
                      <p className="num font-bold text-ink">{formatMoney(o.amountIdr)}</p>
                      <OfferStatusBadge status={o.shown} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

type SellerOffer = Awaited<ReturnType<typeof getSellerOffers>>[number];

function OfferItem({ offer, t, locale }: { offer: SellerOffer; t: Dictionary["offers"]; locale: Locale }) {
  return (
    <div className="flex min-w-60 flex-1 gap-3">
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-plate">
        {offer.listing.images[0] && <Image src={mediaUrl(offer.listing.images[0].key)} alt="" fill sizes="64px" className="object-cover" />}
      </div>
      <div className="min-w-0 text-sm">
        <Link href={`/listings/${offer.listing.slug}`} className="font-semibold text-ink hover:underline">
          {offer.listing.title}
        </Link>
        <p className="text-slate-500">{t.from(offer.buyer.name, formatDate(offer.createdAt, locale))}</p>
        {offer.message && <p className="mt-1 rounded-lg bg-plate px-2.5 py-1.5 text-slate-700">&ldquo;{offer.message}&rdquo;</p>}
      </div>
    </div>
  );
}
