import { Suspense } from "react";
import { Link } from "@/i18n/client";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import { Logo } from "@/components/site-header";
import { ThemeToggle } from "@/components/theme-toggle";

export async function SiteFooter() {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <footer className="mt-16 border-t border-rule bg-plate/60">
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-12 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
        <div className="col-span-2 md:col-span-3 lg:col-span-1">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-slate-600">{t.footer.tagline}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <span>{t.language.label}:</span>
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
            <ThemeToggle />
          </div>
        </div>
        <FooterCol title={t.footer.buy}>
          <FooterLink href="/register">{t.footer.registration}</FooterLink>
          <FooterLink href="/deals">{t.footer.deals}</FooterLink>
          <FooterLink href="/compare">{t.footer.compare}</FooterLink>
          <FooterLink href="/account/favorites">{t.footer.watchlist}</FooterLink>
        </FooterCol>
        <FooterCol title={t.footer.shop}>
          {CATEGORIES.map((c) => (
            <FooterLink key={c.slug} href={`/c/${c.slug}`}>
              {pick(c.name, locale)}
            </FooterLink>
          ))}
        </FooterCol>
        <FooterCol title={t.footer.sell}>
          <FooterLink href="/sell/listings/new">{t.footer.startSelling}</FooterLink>
          <FooterLink href="/sell">{t.footer.sellerDashboard}</FooterLink>
          <FooterLink href="/sell/verification">{t.footer.getVerified}</FooterLink>
          <FooterLink href="/sell/payouts">{t.footer.payouts}</FooterLink>
        </FooterCol>
        <FooterCol title={t.footer.help}>
          <FooterLink href="/how-it-works">{t.footer.howItWorks}</FooterLink>
          <FooterLink href="/how-it-works#grading">{t.footer.grading}</FooterLink>
          <FooterLink href="/how-it-works#protection">{t.footer.protection}</FooterLink>
        </FooterCol>
        <FooterCol title={t.footer.legal}>
          <FooterLink href="/privacy">{t.footer.privacy}</FooterLink>
          <FooterLink href="/terms">{t.footer.terms}</FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-rule py-5 text-center text-xs text-slate-500">{t.footer.copyright}</div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-[13px]">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-slate-600 hover:text-brand-700 hover:underline">
        {children}
      </Link>
    </li>
  );
}
