import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { SettingsForms } from "./settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.settingsTitle };
}

export default async function SettingsPage() {
  const user = await requireUser("/account/settings");
  const [row, t] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, oauthAccounts: { select: { provider: true, email: true } } },
    }),
    getDictionary(),
  ]);
  return (
    <>
      <PageHeader title={t.account.settingsTitle} />
      <SettingsForms name={user.name} email={user.email} hasPassword={!!row.passwordHash} googleEmail={row.oauthAccounts.find((a) => a.provider === "google")?.email} />
    </>
  );
}
