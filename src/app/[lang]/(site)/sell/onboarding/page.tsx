import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSellerProfile, requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { SellerProfileForm } from "../seller-forms";
import { createSellerProfileAction } from "@/actions/seller";

export const metadata: Metadata = { title: "Start selling" };

export default async function OnboardingPage() {
  const user = await requireUser("/sell/onboarding");
  if (await getSellerProfile(user.id)) redirect("/sell");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Start selling on ReGear" description="Set up your shop. You can verify your identity afterwards to earn the trust badge." />
      <SellerProfileForm action={createSellerProfileAction} submitLabel="Create shop" />
    </div>
  );
}
