import type { Metadata } from "next";
import { Suspense } from "react";
import { BrowseView } from "@/components/browse";
import { PageSkeleton } from "@/components/ui";

export const metadata: Metadata = {
  title: "Browse used electronics",
  description: "Search pre-owned phones, laptops, cameras, PC components and more — filter by condition grade, price, brand and warranty.",
  alternates: { canonical: "/listings" },
};

export default function ListingsPage({ searchParams }: PageProps<"/listings">) {
  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Browse used electronics</h1>
      <Suspense fallback={<PageSkeleton />}>
        <BrowseView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
