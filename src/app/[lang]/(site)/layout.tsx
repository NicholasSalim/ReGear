import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { SiteFooter } from "@/components/site-footer";
import { CompareTray } from "@/components/compare";

// Chrome for the marketplace itself. Sign-in pages live in (auth) without it.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={null}>
        <VerifyEmailBanner />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <CompareTray />
    </>
  );
}
