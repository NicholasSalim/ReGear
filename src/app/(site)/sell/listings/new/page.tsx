import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { EMPTY_LISTING, ListingForm } from "../listing-form";

export const metadata: Metadata = { title: "New listing" };

export default async function NewListingPage() {
  const { seller } = await requireSeller("/sell/listings/new");
  return (
    <>
      <PageHeader title="New listing" description="Structured details help buyers trust your item and find it in filters and comparisons." />
      <ListingForm listingId={null} initial={{ ...EMPTY_LISTING, location: seller.location }} />
    </>
  );
}
