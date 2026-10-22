import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { requireSeller } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { ListingForm } from "../listing-form";
import { EMPTY_LISTING } from "../listing-form-values";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.newListing };
}

export default async function NewListingPage() {
  const { seller } = await requireSeller("/sell/listings/new");
  const t = (await getDictionary()).sell;
  return (
    <>
      <PageHeader title={t.newListing} description={t.newListingIntro} />
      <ListingForm listingId={null} initial={{ ...EMPTY_LISTING, location: seller.location }} />
    </>
  );
}
