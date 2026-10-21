import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { BadgeCheck, Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";
import { submitVerificationAction } from "@/actions/seller";
import { PageHeader } from "@/components/ui";
import { VerificationForm } from "../seller-forms";

export const metadata: Metadata = { title: "Verification" };

export default async function VerificationPage() {
  const locale = await getLocale();
  const { seller } = await requireSeller("/sell/verification");
  const latest = await db.verificationRequest.findFirst({
    where: { sellerId: seller.id },
    orderBy: { createdAt: "desc" },
    select: { status: true, reviewNote: true, createdAt: true, reviewedAt: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Seller verification" description="Verified sellers display a trust badge, can be filtered for by buyers and have no active-listing limit." />

      {seller.verificationStatus === "VERIFIED" && (
        <Status icon={<BadgeCheck className="size-6 text-brand-600" />} title="You're verified">
          Verified on {seller.verifiedAt ? formatDate(seller.verifiedAt, locale) : "—"}. Your badge is visible on all listings.
        </Status>
      )}
      {seller.verificationStatus === "PENDING" && (
        <Status icon={<Clock className="size-6 text-amber-500" />} title="Under review">
          Submitted {latest ? formatDate(latest.createdAt, locale) : ""}. We usually respond within 1–2 business days.
        </Status>
      )}
      {seller.verificationStatus === "REJECTED" && latest?.reviewNote && (
        <Status icon={<XCircle className="size-6 text-rose-600" />} title="Verification was not approved">
          Reviewer note: {latest.reviewNote}. You can submit again below.
        </Status>
      )}
      {(seller.verificationStatus === "UNVERIFIED" || seller.verificationStatus === "REJECTED") && (
        <VerificationForm action={submitVerificationAction} />
      )}
    </div>
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
