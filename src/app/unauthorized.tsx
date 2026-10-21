import { MinimalShell } from "@/components/minimal-shell";
import { ButtonLink } from "@/components/ui";

export default function Unauthorized() {
  return (
    <MinimalShell>
      <div className="container-page flex flex-col items-center py-24 text-center">
        <p className="text-sm font-semibold text-slate-500">401</p>
        <h1 className="mt-2 text-3xl font-bold">Please sign in to continue</h1>
        <ButtonLink href="/login" className="mt-6">
          Sign in
        </ButtonLink>
      </div>
    </MinimalShell>
  );
}
