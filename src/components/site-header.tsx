import { Suspense } from "react";
import { Search, ShoppingBag, Store } from "lucide-react";
import { Link } from "@/i18n/client";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { localePath, pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import { UserMenu } from "@/components/user-menu";
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
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
        <Logo />
        <form action={localePath("/listings", locale)} method="get" role="search" className="relative hidden flex-1 md:block md:max-w-xl">
          <label htmlFor="site-search" className="sr-only">
            {t.nav.searchLabel}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="site-search"
            name="q"
            type="search"
            maxLength={100}
            placeholder={t.nav.searchPlaceholder}
            className="input h-10 bg-paper pl-9"
          />
        </form>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Buy shows the whole marketplace; Sell opens the seller dashboard (sign-in and shop setup come first when needed).
              On phones the icons and the language switcher (also in the footer) make way for them. */}
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
          <nav className="flex items-center gap-1" aria-label={t.nav.accountNav}>
            <Suspense fallback={<Skeleton className="h-9 w-16 sm:w-40" />}>
              <UserMenu />
            </Suspense>
          </nav>
        </div>
      </div>
      <nav className="container-page flex gap-6 overflow-x-auto pb-2.5 text-sm font-medium text-slate-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t.nav.categoriesNav}>
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/c/${c.slug}`} className="shrink-0 py-1 hover:text-brand-700">
            {pick(c.name, locale)}
          </Link>
        ))}
        <Link href="/compare" className="shrink-0 py-1 hover:text-brand-700">
          {t.nav.compare}
        </Link>
        <Link href="/how-it-works" className="shrink-0 py-1 hover:text-brand-700">
          {t.nav.howItWorks}
        </Link>
      </nav>
    </header>
  );
}
