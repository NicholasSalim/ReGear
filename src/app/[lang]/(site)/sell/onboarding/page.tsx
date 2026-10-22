import type { Metadata } from "next";
import { getDictionary, localeRedirect } from "@/i18n/server";
import { getSellerProfile, requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { SellerProfileForm } from "../seller-forms";
import { createSellerProfileAction } from "@/actions/seller";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.onboardingMetaTitle };
}

export default async function OnboardingPage() {
  const user = await requireUser("/sell/onboarding");
  if (await getSellerProfile(user.id)) await localeRedirect("/sell");
  const t = (await getDictionary()).sell;
  return (
    <div className="max-w-2xl">
      <PageHeader title={t.onboardingHeading} description={t.onboardingIntro} />
      <SellerProfileForm action={createSellerProfileAction} submitLabel={t.createShop} />
    </div>
  );
}
