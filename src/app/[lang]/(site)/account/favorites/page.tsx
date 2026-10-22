import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/dal";
import { getFavorites } from "@/lib/data/orders";
import { ListingGrid } from "@/components/listing-card";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.savedTitle };
}

export default async function FavoritesPage() {
  const user = await requireUser("/account/favorites");
  const [favorites, t] = await Promise.all([getFavorites(user.id), getDictionary()]);
  return (
    <>
      <PageHeader title={t.account.savedTitle} />
      {favorites.length ? (
        <ListingGrid listings={favorites} />
      ) : (
        <EmptyState
          title={t.account.nothingSaved}
          description={t.account.nothingSavedHint}
          action={<ButtonLink href="/listings">{t.account.browse}</ButtonLink>}
        />
      )}
    </>
  );
}
