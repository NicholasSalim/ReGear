import { Suspense } from "react";
import { ChevronDown, Heart } from "lucide-react";
import { Link } from "@/i18n/client";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import { AccountMenu } from "@/components/account-menu";
import { PhoneCategories } from "@/components/phone-categories";
import { CartLink, Greeting, MessagesLink, MyRegearMenu, UserMenu } from "@/components/user-menu";
import { SiteSearch } from "@/components/site-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui";
import { LogoMark } from "@/components/condition-strip";

export async function Logo() {
  const t = await getDictionary();
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 text-ink" aria-label={t.nav.homeAria}>
      <LogoMark />
      {/* The smallest phones show the mark only; the link keeps its accessible name. */}
      <span className="wide text-[1.35rem] leading-none font-extrabold tracking-[-0.03em] max-[374px]:text-lg max-[359px]:hidden">ReGear</span>
    </Link>
  );
}

/**
 * Three rows, like a department store's: a thin bar of shortcuts and the
 * account, the logo with a large search, then the categories.
 */
export async function SiteHeader() {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: pick(c.name, locale) }));
  const topLink = "hover:text-brand-700 hover:underline";

  return (
    <header className="border-b border-rule bg-surface">
      <div className="border-b border-rule max-sm:hidden">
        <div className="container-page flex h-9 items-center gap-5 text-xs text-slate-700">
          <Suspense fallback={<Skeleton className="h-3 w-40" />}>
            <Greeting />
          </Suspense>
          <nav aria-label={t.nav.utilityNav} className="flex items-center gap-5">
            <Link href="/deals" className={topLink}>
              {t.nav.deals}
            </Link>
            <Link href="/how-it-works" className={`${topLink} max-md:hidden`}>
              {t.nav.help}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-5">
            <Link href="/sell" className={topLink}>
              {t.nav.sell}
            </Link>
            <Suspense fallback={null}>
              <MessagesLink />
            </Suspense>
            <Link href="/account/favorites" className={`${topLink} inline-flex items-center gap-1`}>
              <Heart className="size-3.5" aria-hidden /> {t.nav.watchlist}
            </Link>
            <nav aria-label={t.nav.accountNav}>
              <Suspense fallback={<Skeleton className="h-3 w-16" />}>
                <MyRegearMenu />
              </Suspense>
            </nav>
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
            <ThemeToggle className="-m-1.5 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-ink" />
            <Suspense fallback={null}>
              <CartLink className="-my-1.5" />
            </Suspense>
          </div>
        </div>
      </div>

      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-3 py-3 lg:gap-x-6 lg:py-4">
        <Logo />
        <div className="max-lg:hidden">
          <AccountMenu
            summaryClassName="gap-1 rounded-lg px-1 py-1 text-xs leading-tight text-slate-600 hover:text-ink"
            panelClassName="left-0 w-60 origin-top-left"
            summary={
              <>
                <span>
                  {t.nav.shopByCategoryShort[0]}
                  <br />
                  {t.nav.shopByCategoryShort[1]}
                </span>
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
              </>
            }
          >
            <p className="px-3 pt-1.5 pb-1 text-xs font-semibold text-slate-500">{t.nav.shopByCategory}</p>
            {categories.map((c) => (
              <Link key={c.slug} href={`/c/${c.slug}`} className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
                {c.name}
              </Link>
            ))}
          </AccountMenu>
        </div>
        {/* On phones the search takes a row of its own under the logo. */}
        <div className="order-last w-full md:order-none md:w-auto md:flex-1">
          <SiteSearch
            label={t.nav.searchLabel}
            placeholder={t.nav.searchPlaceholder}
            submit={t.nav.search}
            categoryLabel={t.nav.searchIn}
            allCategories={t.nav.allCategories}
            categories={categories}
          />
        </div>
        <nav className="ml-auto flex items-center gap-1 sm:hidden" aria-label={t.nav.accountNav}>
          <Link href="/sell" className="rounded-lg px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            {t.nav.sell}
          </Link>
          <Suspense fallback={null}>
            <CartLink />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-9 w-16" />}>
            <UserMenu />
          </Suspense>
        </nav>
      </div>

      <nav className="container-page flex flex-wrap justify-center gap-x-7 gap-y-1 pb-3 text-[13px] text-slate-600 max-sm:hidden" aria-label={t.nav.categoriesNav}>
        <CategoryLinks categories={categories} t={t} />
      </nav>
      <PhoneCategories label={t.nav.categoriesNav}>
        <CategoryLinks categories={categories} t={t} />
      </PhoneCategories>
    </header>
  );
}

function CategoryLinks({ categories, t }: { categories: { slug: string; name: string }[]; t: Awaited<ReturnType<typeof getDictionary>> }) {
  const link = "py-1 hover:text-brand-700 hover:underline";
  return (
    <>
      {categories.map((c) => (
        <Link key={c.slug} href={`/c/${c.slug}`} className={link}>
          {c.name}
        </Link>
      ))}
      <Link href="/deals" className={link}>
        {t.nav.deals}
      </Link>
      <Link href="/compare" className={link}>
        {t.nav.compare}
      </Link>
      <Link href="/how-it-works" className={link}>
        {t.nav.howItWorks}
      </Link>
    </>
  );
}
