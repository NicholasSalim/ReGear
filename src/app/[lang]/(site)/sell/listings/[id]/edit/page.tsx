import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/auth/dal";
import { mediaUrl } from "@/lib/media";
import { formatAmount } from "@/lib/format";
import { applicableChecks, getCategory } from "@/lib/catalog";
import type { ConditionCheckEntry } from "@/lib/condition";
import { EmptyState, PageHeader } from "@/components/ui";
import { ListingForm } from "../../listing-form";
import type { ListingFormValues } from "../../listing-form-values";

export const metadata: Metadata = { title: "Edit listing" };

const toMoney = (amountIdr: number | null | undefined) => (amountIdr == null ? "" : formatAmount(amountIdr));

export default async function EditListingPage({ params }: PageProps<"/[lang]/sell/listings/[id]/edit">) {
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
  const specs = JSON.parse(listing.specs || "{}");
  const checks = report ? (JSON.parse(report.checks) as ConditionCheckEntry[]) : [];
  // Checks that fit the item but are missing from the saved report were left out on purpose.
  const category = getCategory(listing.category);
  const reported = new Set(checks.map((c) => c.key));
  const excludedChecks = report && category ? applicableChecks(category, specs).flatMap((c) => (reported.has(c.key) ? [] : [c.key])) : [];
  const initial: ListingFormValues = {
    title: listing.title,
    category: listing.category,
    brand: listing.brand,
    model: listing.model,
    description: listing.description,
    price: toMoney(listing.priceIdr),
    originalPrice: toMoney(listing.originalPriceIdr),
    shipping: toMoney(listing.shippingIdr),
    location: listing.location,
    conditionGrade: listing.conditionGrade,
    warrantyType: listing.warrantyType,
    warrantyMonths: String(listing.warrantyMonths),
    warrantyTerms: listing.warrantyTerms,
    returnWindowDays: String(listing.returnWindowDays),
    specs,
    batteryHealth: report?.batteryHealth != null ? String(report.batteryHealth) : "",
    cosmeticScore: String(report?.cosmeticScore ?? 8),
    checks,
    excludedChecks,
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
