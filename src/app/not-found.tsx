import { MinimalShell } from "@/components/minimal-shell";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <MinimalShell>
      <div className="container-page flex flex-col items-center py-24 text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-3xl font-bold">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-slate-600">The listing may have been sold or removed.</p>
        <ButtonLink href="/listings" className="mt-6">
          Browse listings
        </ButtonLink>
      </div>
    </MinimalShell>
  );
}
