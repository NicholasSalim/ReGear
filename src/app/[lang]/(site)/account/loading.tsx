import { PageSkeleton } from "@/components/ui";

// Shown at once on every click between this section's pages: a Suspense
// boundary in the shared layout only covers full page loads.
export default function Loading() {
  return <PageSkeleton />;
}
