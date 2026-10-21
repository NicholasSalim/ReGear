import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { Logo } from "@/components/site-header";

// Stripped-down chrome for focused flows (sign-in, sign-up) and root error
// pages: the logo and a way back home, nothing else to distract.
export async function MinimalShell({ children }: { children: React.ReactNode }) {
  const t = await getDictionary();
  return (
    <>
      <header className="container-page flex h-16 items-center justify-between">
        <Logo />
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          {t.nav.backToHome}
        </Link>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
    </>
  );
}
