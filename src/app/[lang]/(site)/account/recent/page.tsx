import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/dal";
import { RecentlyViewed } from "@/components/recently-viewed";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.recentTitle };
}

export default async function RecentPage() {
  await requireUser("/account/recent");
  const t = (await getDictionary()).account;
  return (
    <>
      <PageHeader title={t.recentTitle} description={t.recentIntro} />
      <RecentlyViewed
        title={t.recentTitle}
        clear={t.clearRecent}
        variant="page"
        empty={<EmptyState title={t.noRecent} action={<ButtonLink href="/listings">{t.findSomething}</ButtonLink>} />}
      />
    </>
  );
}
