import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="container-page grid grid-cols-1 gap-8 py-6 lg:grid-cols-[1fr_24rem]" aria-busy="true">
      <Skeleton className="aspect-[4/3]" />
      <Skeleton className="h-96" />
    </div>
  );
}
