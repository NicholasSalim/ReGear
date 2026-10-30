import { Suspense } from "react";
import { ShoppingBag, Store } from "lucide-react";
import { Link } from "@/i18n/client";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import { PhoneCategories } from "@/components/phone-categories";
import { UserMenu } from "@/components/user-menu";
import { SiteSearch } from "@/components/site-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass, Skeleton } from "@/components/ui";
import { LogoMark } from "@/components/condition-strip";

export async function Logo() {
  const t = await getDictionary();
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink" aria-label={t.nav.homeAria}>
      <LogoMark />
      {/* The smallest phones show the mark only; the link keeps its accessible name. */}
      <span className="wide text-[1.35rem] leading-none font-extrabold tracking-[-0.03em] max-[374px]:text-lg max-[359px]:hidden">ReGear</span>
    </Link>
  );
}

export async function SiteHeader() {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const categoryLinks = (
    <>
      {CATEGORIES.map((c) => (
        <Link key={c.slug} href={`/c/${c.slug}`} className="py-1 hover:text-brand-700">
          {pick(c.name, locale)}
        </Link>
      ))}
      <Link href="/compare" className="py-1 hover:text-brand-700">
        {t.nav.compare}
      </Link>
      <Link href="/how-it-works" className="py-1 hover:text-brand-700">
        {t.nav.howItWorks}
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
        <Logo />
        <SiteSearch label={t.nav.searchLabel} placeholder={t.nav.searchPlaceholder} />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Buy shows the whole marketplace; Sell opens the seller dashboard (sign-in and shop setup come first when needed).
              On phones the icons make way for them, and the language switcher and theme toggle are in the footer instead. */}
          <nav className="flex items-center gap-1" aria-label={t.nav.mainNav}>
            <Link href="/listings" className={buttonClass("ghost", "px-2 sm:px-3")}>
              <ShoppingBag className="size-4 max-sm:hidden" aria-hidden /> {t.nav.buy}
            </Link>
            <Link href="/sell" className={buttonClass("ghost", "px-2 sm:px-3")}>
              <Store className="size-4 max-sm:hidden" aria-hidden /> {t.nav.sell}
            </Link>
          </nav>
          <div className="max-sm:hidden">
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
          </div>
          <div className="max-sm:hidden">
            <ThemeToggle />
          </div>
          <nav className="flex items-center gap-1" aria-label={t.nav.accountNav}>
            <Suspense fallback={<Skeleton className="h-9 w-16 sm:w-40" />}>
              <UserMenu />
            </Suspense>
          </nav>
        </div>
      </div>
      <nav className="container-page flex flex-wrap gap-x-6 pb-2.5 text-sm font-medium text-slate-600 max-sm:hidden" aria-label={t.nav.categoriesNav}>
        {categoryLinks}
      </nav>
      <PhoneCategories label={t.nav.categoriesNav}>{categoryLinks}</PhoneCategories>
    </header>
  );
}
