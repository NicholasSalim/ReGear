import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getFavorites } from "@/lib/data/orders";
import { ListingGrid } from "@/components/listing-card";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Saved items" };

export default async function FavoritesPage() {
  const user = await requireUser("/account/favorites");
  const favorites = await getFavorites(user.id);
  return (
    <>
      <PageHeader title="Saved items" />
      {favorites.length ? (
        <ListingGrid listings={favorites} />
      ) : (
        <EmptyState title="Nothing saved yet" description="Tap Save on a listing to keep an eye on it." action={<ButtonLink href="/listings">Browse</ButtonLink>} />
      )}
    </>
  );
}
