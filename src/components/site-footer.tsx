import { Suspense } from "react";
import { Link } from "@/i18n/client";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { CATEGORIES } from "@/lib/catalog";
import { Logo } from "@/components/site-header";

export async function SiteFooter() {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-slate-600">{t.footer.tagline}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <span>{t.language.label}:</span>
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
          </div>
        </div>
        <FooterCol title={t.footer.shop}>
          {CATEGORIES.slice(0, 6).map((c) => (
            <FooterLink key={c.slug} href={`/c/${c.slug}`}>
              {pick(c.name, locale)}
            </FooterLink>
          ))}
        </FooterCol>
        <FooterCol title={t.footer.sell}>
          <FooterLink href="/sell">{t.footer.sellerDashboard}</FooterLink>
          <FooterLink href="/sell/listings/new">{t.footer.listItem}</FooterLink>
          <FooterLink href="/sell/verification">{t.footer.getVerified}</FooterLink>
        </FooterCol>
        <FooterCol title={t.footer.regear}>
          <FooterLink href="/how-it-works">{t.footer.howItWorks}</FooterLink>
          <FooterLink href="/how-it-works#grading">{t.footer.grading}</FooterLink>
          <FooterLink href="/how-it-works#protection">{t.footer.protection}</FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-500">{t.footer.copyright}</div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-slate-600 hover:text-brand-700">
        {children}
      </Link>
    </li>
  );
}
