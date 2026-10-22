import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/server";
import { BadgeCheck, Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/auth/dal";
import { formatDate } from "@/lib/format";
import { submitVerificationAction } from "@/actions/seller";
import { PageHeader } from "@/components/ui";
import { VerificationForm } from "../seller-forms";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.verificationMetaTitle };
}

export default async function VerificationPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.sell;
  const { seller } = await requireSeller("/sell/verification");
  const latest = await db.verificationRequest.findFirst({
    where: { sellerId: seller.id },
    orderBy: { createdAt: "desc" },
    select: { status: true, reviewNote: true, createdAt: true, reviewedAt: true },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t.verificationHeading} description={t.verificationIntro} />

      {seller.verificationStatus === "VERIFIED" && (
        <Status icon={<BadgeCheck className="size-6 text-brand-600" />} title={t.verifiedTitle}>
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
