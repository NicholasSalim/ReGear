import { getDictionary } from "@/i18n/server";
import { MinimalShell } from "@/components/minimal-shell";
import { ButtonLink } from "@/components/ui";

export default async function Unauthorized() {
  const t = await getDictionary();
  return (
    <MinimalShell>
      <div className="container-page flex flex-col items-center py-24 text-center">
        <p className="text-sm font-semibold text-slate-500">401</p>
        <h1 className="mt-2 text-3xl font-bold">{t.errors.unauthorizedTitle}</h1>
        <ButtonLink href="/login" className="mt-6">
          {t.errors.signIn}
        </ButtonLink>
      </div>
    </MinimalShell>
  );
}
