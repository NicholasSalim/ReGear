import { MailWarning } from "lucide-react";
import { getDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { resendVerificationAction } from "@/actions/auth";
import { ActionButton } from "@/components/forms";

/** Reminds a signed-in user to confirm their email; streams in behind Suspense. */
export async function VerifyEmailBanner() {
  const user = await getCurrentUser();
  if (!user || user.emailVerified) return null;
  const t = (await getDictionary()).auth;
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm text-amber-900">
        <p className="flex flex-1 items-start gap-2">
          <MailWarning className="mt-0.5 size-4 shrink-0" aria-hidden /> {t.verifyBanner(user.email)}
        </p>
        <ActionButton action={resendVerificationAction} variant="secondary" className="px-3 py-1.5">
          {t.resendVerification}
        </ActionButton>
      </div>
    </div>
  );
}
