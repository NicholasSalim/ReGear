import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/auth/dal";
import { mediaUrl } from "@/lib/media";
import type { ConditionCheckEntry } from "@/lib/condition";
import { EmptyState, PageHeader } from "@/components/ui";
import { ListingForm, type ListingFormValues } from "../../listing-form";

export const metadata: Metadata = { title: "Edit listing" };

const toMoney = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));

export default async function EditListingPage({ params }: PageProps<"/sell/listings/[id]/edit">) {
  const { id } = await params;
  const { seller } = await requireSeller(`/sell/listings/${id}/edit`);
  if (!/^[a-z0-9]{20,32}$/i.test(id)) notFound();

  const listing = await db.listing.findUnique({
    where: { id },
    include: { conditionReport: true, images: { orderBy: { position: "asc" } } },
  });
  // Ownership check: other sellers' listings look like they don't exist.
  if (!listing || listing.sellerId !== seller.id || listing.status === "REMOVED") notFound();
  if (listing.status !== "DRAFT" && listing.status !== "ACTIVE") {
    return <EmptyState title="This listing can't be edited" description="Listings are locked once an order is placed." />;
  }

  const report = listing.conditionReport;
  const initial: ListingFormValues = {
    title: listing.title,
    category: listing.category,
    brand: listing.brand,
    model: listing.model,
    description: listing.description,
    price: toMoney(listing.priceCents),
    originalPrice: toMoney(listing.originalPriceCents),
    shipping: toMoney(listing.shippingCents),
    location: listing.location,
    conditionGrade: listing.conditionGrade,
    warrantyType: listing.warrantyType,
    warrantyMonths: String(listing.warrantyMonths),
    warrantyTerms: listing.warrantyTerms,
    returnWindowDays: String(listing.returnWindowDays),
    specs: JSON.parse(listing.specs || "{}"),
    batteryHealth: report?.batteryHealth != null ? String(report.batteryHealth) : "",
    cosmeticScore: String(report?.cosmeticScore ?? 8),
    checks: report ? (JSON.parse(report.checks) as ConditionCheckEntry[]) : [],
    includedAccessories: report ? (JSON.parse(report.includedAccessories) as string[]).join(", ") : "",
    knownIssues: report?.knownIssues ?? "",
    serialVerified: report?.serialVerified ?? false,
    originalBox: report?.originalBox ?? false,
    images: listing.images.map((i) => ({ id: i.id, url: mediaUrl(i.key) })),
  };

  return (
    <>
      <PageHeader title="Edit listing" description={listing.status === "ACTIVE" ? "Changes go live immediately when you publish." : "Draft"} />
      <ListingForm listingId={listing.id} initial={initial} />
    </>
  );
}
