import { BadgeCheck, Clock, XCircle } from "lucide-react";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { submitVerificationAction } from "@/actions/seller";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { VerificationForm } from "./seller-forms";

type Seller = { id: string; verificationStatus: string; verifiedAt: Date | null };

/** Where the shop stands with ID verification, and the form to apply. Part of the shop profile page. */
export async function VerificationSection({ seller }: { seller: Seller }) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.sell;
  const latest = await db.verificationRequest.findFirst({
    where: { sellerId: seller.id },
    orderBy: { createdAt: "desc" },
    select: { status: true, reviewNote: true, createdAt: true, reviewedAt: true },
  });

  return (
    // Emails and older links point here: /sell/verification redirects to this anchor.
    <section id="verification" aria-labelledby="verification-heading" className="scroll-mt-6 space-y-4">
      <ScrollToHash id="verification" />
      <div>
        <h2 id="verification-heading" className="text-xl font-extrabold text-ink">
          {t.verificationHeading}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t.verificationIntro}</p>
      </div>

      {seller.verificationStatus === "VERIFIED" && (
        <Status icon={<BadgeCheck className="size-6 text-brand-700" />} title={t.verifiedTitle}>
          {t.verifiedBody(seller.verifiedAt ? formatDate(seller.verifiedAt, locale) : "—")}
        </Status>
      )}
      {seller.verificationStatus === "PENDING" && (
        <Status icon={<Clock className="size-6 text-amber-500" />} title={t.reviewTitle}>
          {t.reviewBody(latest ? formatDate(latest.createdAt, locale) : null)}
        </Status>
      )}
      {seller.verificationStatus === "REJECTED" && latest?.reviewNote && (
        <Status icon={<XCircle className="size-6 text-rose-600" />} title={t.rejectedTitle}>
          {t.rejectedBody(latest.reviewNote)}
        </Status>
      )}
      {(seller.verificationStatus === "UNVERIFIED" || seller.verificationStatus === "REJECTED") && (
        <VerificationForm action={submitVerificationAction} />
      )}
    </section>
  );
}

function Status({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex gap-4 p-5">
      {icon}
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-slate-600">{children}</p>
      </div>
    </div>
  );
}
