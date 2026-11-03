import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";

// Verification now lives on the shop profile page. Emails already sent link here.
export default async function VerificationPage() {
  redirect(`${localePath("/sell/profile", await getLocale())}#verification`);
}
