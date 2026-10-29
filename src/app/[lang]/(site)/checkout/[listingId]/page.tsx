import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { listAddresses } from "@/lib/addresses";
import { ADDRESS_LIMIT } from "@/lib/validation";
import { PAYMENT_HOLD_MINUTES } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { checkoutAction } from "@/actions/orders";
import { GradeBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageSkeleton } from "@/components/ui";
import { CheckoutForm } from "./checkout-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).checkout.metaTitle, robots: { index: false } };
}

export default async function CheckoutPage({ params }: PageProps<"/[lang]/checkout/[listingId]">) {
  const t = await getDictionary();
  return (
    <div className="container-page max-w-5xl py-8">
      <h1 className="mb-6 text-2xl font-bold">{t.checkout.heading}</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Checkout params={params} />
      </Suspense>
    </div>
  );
}

async function Checkout({ params }: { params: PageProps<"/[lang]/checkout/[listingId]">["params"] }) {
  const { listingId } = await params;
  const user = await requireUser(`/checkout/${listingId}`);
  if (!/^[a-z0-9]{20,32}$/i.test(listingId)) notFound();
  const t = (await getDictionary()).checkout;

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      priceIdr: true,
      shippingIdr: true,
      conditionGrade: true,
      returnWindowDays: true,
      images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 },
      seller: { select: { userId: true, displayName: true } },
    },
  });
  if (!listing) notFound();
  if (listing.seller.userId === user.id) {
    return <EmptyState title={t.ownListing} action={<ButtonLink href="/sell/listings">{t.manageListings}</ButtonLink>} />;
  }
  if (listing.status !== "ACTIVE") {
    return <EmptyState title={t.unavailable} description={t.unavailableHint} action={<ButtonLink href="/listings">{t.keepBrowsing}</ButtonLink>} />;
  }
  if (!user.emailVerified) {
    return <EmptyState title={t.verifyFirst} description={t.verifyFirstHint(user.email)} />;
  }

  const addresses = await listAddresses(user.id);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <CheckoutForm
        action={checkoutAction.bind(null, listing.id)}
        addresses={addresses}
        defaultName={user.name}
        holdMinutes={PAYMENT_HOLD_MINUTES}
        limit={ADDRESS_LIMIT}
      />
      <aside className="card h-fit space-y-4 p-5 text-sm">
        <div className="flex gap-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
            {listing.images[0] && <Image src={mediaUrl(listing.images[0].key)} alt="" fill sizes="64px" className="object-cover" />}
          </div>
          <div>
            <Link href={`/listings/${listing.slug}`} className="font-semibold hover:text-brand-700">{listing.title}</Link>
            <div className="mt-1">
              <GradeBadge grade={listing.conditionGrade} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{t.soldBy(listing.seller.displayName)}</p>
          </div>
        </div>
        <dl className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex justify-between"><dt className="text-slate-600">{t.item}</dt><dd>{formatMoney(listing.priceIdr)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">{t.shipping}</dt><dd>{listing.shippingIdr ? formatMoney(listing.shippingIdr) : t.free}</dd></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><dt>{t.total}</dt><dd>{formatMoney(listing.priceIdr + listing.shippingIdr)}</dd></div>
        </dl>
        <p className="flex gap-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-900">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          {t.protection}
          {listing.returnWindowDays > 0 ? t.returnWindow(listing.returnWindowDays) : ""}
        </p>
      </aside>
    </div>
  );
}
