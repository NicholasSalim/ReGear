import { Suspense } from "react";
import { MinimalShell } from "@/components/minimal-shell";
import { Skeleton } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <MinimalShell>
      <div className="container-page flex flex-1 items-start justify-center pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <Suspense fallback={<Skeleton className="h-80" />}>{children}</Suspense>
        </div>
      </div>
    </MinimalShell>
  );
}
