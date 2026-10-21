import type { Metadata } from "next";
import { requireSeller } from "@/lib/auth/dal";
import { updateSellerProfileAction } from "@/actions/seller";
import { PageHeader } from "@/components/ui";
import { SellerProfileForm } from "../seller-forms";

export const metadata: Metadata = { title: "Shop profile" };

export default async function SellerProfilePage() {
  const { seller } = await requireSeller("/sell/profile");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Shop profile" description="Shown on your public shop page and listings." />
      <SellerProfileForm
        action={updateSellerProfileAction}
        submitLabel="Save"
        initial={{ displayName: seller.displayName, bio: seller.bio, location: seller.location }}
      />
    </div>
  );
}
