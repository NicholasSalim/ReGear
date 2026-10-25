import { getLocale } from "@/i18n/server";
import { MinimalShell } from "@/components/minimal-shell";
import { NotFoundContent } from "@/components/not-found-content";

// notFound() thrown at the language level. Unmatched addresses use app/global-not-found.tsx,
// and pages inside the marketplace use (site)/not-found.tsx.
export default async function NotFound() {
  return (
    <MinimalShell>
      <NotFoundContent locale={await getLocale()} />
    </MinimalShell>
  );
}
