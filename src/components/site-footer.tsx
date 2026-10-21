import Link from "next/link";
import { CATEGORIES } from "@/lib/catalog";
import { Logo } from "@/components/site-header";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 text-sm text-slate-600">
            The marketplace for pre-owned electronics with structured condition reports, verified sellers and buyer protection.
          </p>
        </div>
        <FooterCol title="Shop">
          {CATEGORIES.slice(0, 6).map((c) => (
            <FooterLink key={c.slug} href={`/c/${c.slug}`}>
              {c.name}
            </FooterLink>
          ))}
        </FooterCol>
        <FooterCol title="Sell">
          <FooterLink href="/sell">Seller dashboard</FooterLink>
          <FooterLink href="/sell/listings/new">List an item</FooterLink>
          <FooterLink href="/sell/verification">Get verified</FooterLink>
        </FooterCol>
        <FooterCol title="ReGear">
          <FooterLink href="/how-it-works">How it works</FooterLink>
          <FooterLink href="/how-it-works#grading">Condition grading</FooterLink>
          <FooterLink href="/how-it-works#protection">Buyer protection</FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-slate-100 py-5 text-center text-xs text-slate-500">
        © ReGear. Pre-owned electronics, honestly graded.
      </div>
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
