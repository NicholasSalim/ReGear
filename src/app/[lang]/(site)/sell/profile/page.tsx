import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { requireSeller } from "@/lib/auth/dal";
import { updateSellerProfileAction } from "@/actions/seller";
import { PageHeader } from "@/components/ui";
import { SellerProfileForm } from "../seller-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.profileTitle };
}

export default async function SellerProfilePage() {
  const { seller } = await requireSeller("/sell/profile");
  const t = (await getDictionary()).sell;
  return (
    <div className="max-w-2xl">
      <PageHeader title={t.profileTitle} description={t.profileIntro} />
      <SellerProfileForm
        action={updateSellerProfileAction}
        submitLabel={t.save}
        initial={{ displayName: seller.displayName, bio: seller.bio, location: seller.location }}
      />
    </div>
  );
}
