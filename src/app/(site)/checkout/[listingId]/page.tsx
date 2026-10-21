import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { checkoutAction } from "@/actions/orders";
import { GradeBadge } from "@/components/badges";
import { ButtonLink, EmptyState, PageSkeleton } from "@/components/ui";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default function CheckoutPage({ params }: PageProps<"/checkout/[listingId]">) {
  return (
    <div className="container-page max-w-5xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Checkout params={params} />
      </Suspense>
    </div>
  );
}

async function Checkout({ params }: { params: PageProps<"/checkout/[listingId]">["params"] }) {
  const { listingId } = await params;
  const user = await requireUser(`/checkout/${listingId}`);
  if (!/^[a-z0-9]{20,32}$/i.test(listingId)) notFound();

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
    return <EmptyState title="This is your own listing" action={<ButtonLink href="/sell/listings">Manage listings</ButtonLink>} />;
  }
  if (listing.status !== "ACTIVE") {
    return <EmptyState title="This item is no longer available" description="Another buyer reserved or purchased it." action={<ButtonLink href="/listings">Keep browsing</ButtonLink>} />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <CheckoutForm action={checkoutAction.bind(null, listing.id)} defaultName={user.name} />
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
            <p className="mt-1 text-xs text-slate-500">Sold by {listing.seller.displayName}</p>
          </div>
        </div>
        <dl className="space-y-2 border-t border-slate-100 pt-3">
          <div className="flex justify-between"><dt className="text-slate-600">Item</dt><dd>{formatMoney(listing.priceIdr)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-600">Shipping</dt><dd>{listing.shippingIdr ? formatMoney(listing.shippingIdr) : "Free"}</dd></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><dt>Total</dt><dd>{formatMoney(listing.priceIdr + listing.shippingIdr)}</dd></div>
        </dl>
        <p className="flex gap-2 rounded-lg bg-brand-50 p-3 text-xs text-brand-900">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Buyer protection: payment is held until you accept the item.
          {listing.returnWindowDays > 0 ? ` ${listing.returnWindowDays}-day return window.` : ""}
        </p>
      </aside>
    </div>
  );
}
