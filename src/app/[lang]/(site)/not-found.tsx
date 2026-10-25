import { getLocale } from "@/i18n/server";
import { NotFoundContent } from "@/components/not-found-content";

// A page inside the marketplace that called notFound(), such as a removed listing.
export default async function NotFound() {
  return <NotFoundContent locale={await getLocale()} />;
}
