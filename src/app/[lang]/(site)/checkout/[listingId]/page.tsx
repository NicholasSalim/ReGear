import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireTrader } from "@/lib/auth/dal";
import { listAddresses } from "@/lib/addresses";
import { ADDRESS_LIMIT } from "@/lib/validation";
import { PAY_HOLD_MINUTES } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { payments } from "@/lib/payments";
import { checkoutEligibility } from "@/lib/orders/service";
import { checkoutAction } from "@/actions/orders";
import { GradeBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageSkeleton } from "@/components/ui";
import { CheckoutForm } from "./checkout-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).checkout.metaTitle, robots: { index: false } };
}

export default async function CheckoutPage({ params, searchParams }: PageProps<"/[lang]/checkout/[listingId]">) {
  const t = await getDictionary();
  return (
    <div className="container-page max-w-6xl py-8">
      <h1 className="mb-6 text-3xl font-extrabold">{t.checkout.heading}</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Checkout params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Checkout({
  params,
  searchParams,
}: {
  params: PageProps<"/[lang]/checkout/[listingId]">["params"];
  searchParams: PageProps<"/[lang]/checkout/[listingId]">["searchParams"];
}) {
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  const user = await requireTrader(`/checkout/${listingId}`);
  if (!/^[a-z0-9]{20,32}$/i.test(listingId)) notFound();
  const dict = await getDictionary();
  const t = dict.checkout;

  // "?offer=" checks out an accepted offer at its price. Placing the order runs the same check again.
  const offerParam = typeof query.offer === "string" && /^[a-z0-9]{20,32}$/i.test(query.offer) ? query.offer : null;
  const check = await checkoutEligibility(user.id, listingId, offerParam);
  if (!check.ok) {
    switch (check.reason) {
      case "notFound":
        notFound();
      case "ownListing":
        return <EmptyState title={t.ownListing} action={<ButtonLink href="/sell/listings">{t.manageListings}</ButtonLink>} />;
      case "yourOrder":
        return (
          <EmptyState
            title={check.unpaid ? t.reservedByYou : t.boughtByYou}
            description={check.unpaid ? t.reservedByYouHint : undefined}
            action={<ButtonLink href={`/account/orders/${check.orderId}`}>{check.unpaid ? t.finishPayment : t.viewYourOrder}</ButtonLink>}
          />
        );
      case "verifyEmail":
        return <EmptyState title={t.verifyFirst} description={t.verifyFirstHint(user.email)} />;
      case "offerUnavailable": {
        const listing = await db.listing.findUnique({ where: { id: listingId }, select: { slug: true } });
        return (
          <EmptyState
            title={t.offerUnavailable}
            description={t.offerUnavailableHint}
            action={listing && <ButtonLink href={`/listings/${listing.slug}`}>{t.viewListing}</ButtonLink>}
          />
        );
      }
      // Said before the buyer fills anything in, rather than after they press Continue.
      case "tooManyUnpaid":
        return <EmptyState title={dict.domain.tooManyUnpaidOrders(check.limit)} action={<ButtonLink href="/account/orders">{dict.account.nav.purchases}</ButtonLink>} />;
      case "tryLater":
        return <EmptyState title={dict.domain.checkoutAgainLater} action={<ButtonLink href="/listings">{t.keepBrowsing}</ButtonLink>} />;
      // An admin can't reach checkout (it's for traders), so it reads as unavailable.
      case "adminCannotTrade":
      case "unavailable":
        return <EmptyState title={t.unavailable} description={t.unavailableHint} action={<ButtonLink href="/listings">{t.keepBrowsing}</ButtonLink>} />;
    }
  }
  const { listing, offer } = check;

  const addresses = await listAddresses(user.id);
  const price = check.priceIdr;
  const total = price + listing.shippingIdr;

  const review = (
    <section className="card p-5 sm:p-6" aria-labelledby="review-item">
      <h2 id="review-item" className="text-lg font-bold">{t.reviewItem}</h2>
      <p className="mt-3 text-sm text-slate-600">
        {t.soldBy(listing.seller.displayName)}
        {listing.location && <> · {t.shipsFrom(listing.location)}</>}
      </p>
      <div className="mt-3 flex gap-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-plate">
          {listing.images[0] && <Image src={mediaUrl(listing.images[0].key)} alt="" fill sizes="96px" className="object-cover" />}
        </div>
        <div className="min-w-0 text-sm">
          <Link href={`/listings/${listing.slug}`} className="font-semibold text-ink hover:underline">{listing.title}</Link>
          <div className="mt-1.5">
            <GradeBadge grade={listing.conditionGrade} />
          </div>
          <p className="num mt-2 text-base font-bold text-ink">
            {formatMoney(price)}
            {offer && <span className="ml-2 text-sm font-normal text-slate-500 line-through">{formatMoney(listing.priceIdr)}</span>}
          </p>
          {offer && <p className="font-semibold text-pass">{t.acceptedOffer}</p>}
          <p className="text-slate-600">
            {listing.shippingIdr ? dict.listing.plusShipping(formatMoney(listing.shippingIdr)) : dict.listing.freeShipping}
            {" · "}
            {listing.returnWindowDays > 0 ? dict.listing.returnsDays(listing.returnWindowDays) : dict.listing.noReturns}
          </p>
        </div>
      </div>
    </section>
  );

  const pay = (
    <section className="card p-5 sm:p-6" aria-labelledby="pay-with">
      <h2 id="pay-with" className="text-lg font-bold">{t.payWith}</h2>
      <div className="mt-3 flex items-start gap-3 text-sm">
        <CreditCard className="mt-0.5 size-5 shrink-0 text-slate-500" aria-hidden />
        <div>
          <p className="text-slate-700">{t.payBody}</p>
          {payments.mode !== "live" && <p className="mt-1 text-xs text-slate-500">{payments.mode === "sandbox" ? t.paySandbox : t.paySimulated}</p>}
        </div>
      </div>
    </section>
  );

  const summary = (
    <>
      <h2 className="text-lg font-bold">{t.orderSummary}</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-slate-600">{offer ? t.acceptedOffer : t.itemCount(1)}</dt><dd className="num">{formatMoney(price)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-600">{t.shipping}</dt><dd className="num">{listing.shippingIdr ? formatMoney(listing.shippingIdr) : t.free}</dd></div>
        <div className="flex justify-between border-t border-rule pt-3 text-lg font-bold"><dt>{t.orderTotal}</dt><dd className="num">{formatMoney(total)}</dd></div>
      </dl>
      <div className="flex gap-2.5 rounded-xl bg-plate p-3 text-xs">
        <ShieldCheck className="size-5 shrink-0 text-pass" aria-hidden />
        <p>
          <strong className="block text-sm font-semibold text-ink">{t.escrowTitle}</strong>
          <span className="text-slate-600">
            {t.escrowBody}
            {listing.returnWindowDays > 0 ? t.returnWindow(listing.returnWindowDays) : ""}
          </span>
        </p>
      </div>
    </>
  );

  return (
    <CheckoutForm
      action={checkoutAction.bind(null, listing.id)}
      addresses={addresses}
      defaultName={user.name}
      holdMinutes={PAY_HOLD_MINUTES}
      limit={ADDRESS_LIMIT}
      review={review}
      pay={pay}
      summary={summary}
      offerId={offer?.id}
    />
  );
}
