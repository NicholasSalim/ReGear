import { getDictionary } from "@/i18n/server";
import { MinimalShell } from "@/components/minimal-shell";
import { ButtonLink } from "@/components/ui";

export default async function NotFound() {
  const t = await getDictionary();
  return (
    <MinimalShell>
      <div className="container-page flex flex-col items-center py-24 text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-3xl font-bold">{t.errors.notFoundTitle}</h1>
        <p className="mt-2 text-slate-600">{t.errors.notFoundBody}</p>
        <ButtonLink href="/listings" className="mt-6">
          {t.common.browseListings}
        </ButtonLink>
      </div>
    </MinimalShell>
  );
}
