import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireTrader } from "@/lib/auth/dal";
import { getDeletionBlockers } from "@/lib/account/delete";
import { PageHeader } from "@/components/ui";
import { DeleteAccountForm, SettingsForms } from "./settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.settingsTitle };
}

export default async function SettingsPage() {
  // Admins have their own settings page in the admin console.
  const user = await requireTrader("/account/settings");
  const [row, t, blockers] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true, oauthAccounts: { select: { provider: true, email: true } } },
    }),
    getDictionary(),
    getDeletionBlockers(user.id),
  ]);
  return (
    <>
      <PageHeader title={t.account.settingsTitle} />
      <SettingsForms name={user.name} email={user.email} hasPassword={!!row.passwordHash} googleEmail={row.oauthAccounts.find((a) => a.provider === "google")?.email} />
      <DeleteAccountForm email={user.email} hasPassword={!!row.passwordHash} blockers={blockers} />
    </>
  );
}
