import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/ui";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/account/settings");
  const row = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true, oauthAccounts: { select: { provider: true, email: true } } },
  });
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsForms name={user.name} email={user.email} hasPassword={!!row.passwordHash} googleEmail={row.oauthAccounts.find((a) => a.provider === "google")?.email} />
    </>
  );
}
