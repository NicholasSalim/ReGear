import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { localePath, pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireSeller } from "@/lib/auth/dal";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { getBrands } from "@/lib/data/catalog";
import { CategoryIcon } from "@/components/category-icon";
import { PageHeader } from "@/components/ui";
import { ListingForm } from "../listing-form";
import { EMPTY_LISTING } from "../listing-form-values";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.newListing };
}

/**
 * Listing starts with "what are you selling?": the item's name and category.
 * The category decides which specs and condition checks the form asks for, so
 * it comes first, and the form opens with the title (and a known brand) filled in.
 */
export default async function NewListingPage({ searchParams }: PageProps<"/[lang]/sell/listings/new">) {
  const { seller } = await requireSeller("/sell/listings/new");
  const [query, t, locale] = await Promise.all([searchParams, getDictionary(), getLocale()]);
  const title = typeof query.title === "string" ? query.title.trim().slice(0, 120) : "";
  const category = typeof query.category === "string" ? getCategory(query.category) : undefined;

  if (!category) return <SellStart title={title} />;

  const brands = await getBrands();
  const lower = title.toLowerCase();
  const brand = brands.find((b) => lower.split(/\s+/).includes(b.brand.toLowerCase()))?.brand ?? "";
  return (
    <>
      <PageHeader
        title={t.sell.newListing}
        description={t.sell.newListingIntro}
        actions={
          <Link
            href={`/sell/listings/new${title ? `?title=${encodeURIComponent(title)}` : ""}`}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t.sell.startAgain}
          </Link>
        }
      />
      <p className="mb-6 -mt-3 text-sm text-slate-600">
        {t.sell.startCategory}: <strong className="text-ink">{pick(category.name, locale)}</strong>
      </p>
      <ListingForm listingId={null} initial={{ ...EMPTY_LISTING, location: seller.location, title, category: category.slug, brand }} />
    </>
  );
}

async function SellStart({ title }: { title: string }) {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  return (
    <div className="mx-auto max-w-3xl py-4">
      <h1 className="wide text-3xl font-extrabold sm:text-4xl">{t.sell.startTitle}</h1>
      <p className="mt-2 text-slate-600">{t.sell.startIntro}</p>
      <form method="get" action={localePath("/sell/listings/new", locale)} className="mt-8 space-y-8">
        <div>
          <label htmlFor="start-title" className="label">
            {t.sell.startLabel}
          </label>
          <input
            id="start-title"
            name="title"
            defaultValue={title}
            maxLength={120}
            required
            autoFocus
            placeholder={t.sell.startPlaceholder}
            className="block h-14 w-full rounded-full border-2 border-ink bg-surface px-6 text-base text-ink placeholder:text-slate-400 focus:border-brand-600 focus:ring-3 focus:ring-brand-600/15 focus:outline-none"
          />
        </div>
        <fieldset>
          <legend className="label">{t.sell.startCategory}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORIES.map((c, i) => (
              <label key={c.slug} className="cursor-pointer">
                <input type="radio" name="category" value={c.slug} required={i === 0} className="peer sr-only" />
                <span className="press flex h-full flex-col items-center gap-2 rounded-2xl border border-rule bg-surface px-3 py-5 text-center text-sm font-medium text-ink hover:border-slate-400 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:ring-1 peer-checked:ring-brand-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700">
                  <CategoryIcon slug={c.slug} className="size-8 text-slate-600" />
                  {pick(c.name, locale)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="press inline-flex h-12 items-center rounded-full bg-brand-600 px-10 text-base font-semibold text-white hover:bg-action-hover"
        >
          {t.sell.startContinue}
        </button>
      </form>
    </div>
  );
}
