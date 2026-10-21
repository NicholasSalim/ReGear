import { MinimalShell } from "@/components/minimal-shell";
import { ButtonLink } from "@/components/ui";

export default function Forbidden() {
  return (
    <MinimalShell>
      <div className="container-page flex flex-col items-center py-24 text-center">
        <p className="text-sm font-semibold text-rose-600">403</p>
        <h1 className="mt-2 text-3xl font-bold">You don&apos;t have access to this page</h1>
        <ButtonLink href="/" className="mt-6">
          Go home
        </ButtonLink>
      </div>
    </MinimalShell>
  );
}
