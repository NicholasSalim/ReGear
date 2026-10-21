import type { Metadata } from "next";
import { pick } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { ID_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { reviewVerificationAction } from "@/actions/admin";
import { EmptyState, PageHeader } from "@/components/ui";
import { VerificationDecisionForm } from "../admin-forms";

export const metadata: Metadata = { title: "Verifications" };

export default async function AdminVerificationsPage() {
  const locale = await getLocale();
  await requireAdmin();
  const pending = await db.verificationRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: { seller: { select: { displayName: true, slug: true, createdAt: true, user: { select: { email: true } } } } },
    take: 50,
  });

  return (
    <>
      <PageHeader title="Seller verification queue" description="Oldest first. Every document view is recorded in the audit log." />
      {pending.length === 0 ? (
        <EmptyState title="Queue is empty" />
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => (
            <li key={r.id} className="card grid gap-5 p-5 md:grid-cols-[1fr_16rem]">
              <div className="space-y-2 text-sm">
                <p className="text-base font-semibold">
                  <Link href={`/sellers/${r.seller.slug}`} className="hover:text-brand-700">{r.seller.displayName}</Link>
                  <span className="ml-2 text-xs font-normal text-slate-500">{r.seller.user.email}</span>
                </p>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-slate-500">Legal name</dt><dd>{r.legalName}</dd></div>
                  <div><dt className="text-slate-500">Phone</dt><dd>{r.phone}</dd></div>
                  <div><dt className="text-slate-500">Document</dt><dd>{pick(ID_TYPE_LABELS[r.idType as keyof typeof ID_TYPE_LABELS], locale)} ···{r.idNumberLast4}</dd></div>
                  <div><dt className="text-slate-500">Submitted</dt><dd>{formatDateTime(r.createdAt, locale)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-slate-500">Address</dt><dd>{r.address}</dd></div>
                </dl>
                <a href={`/api/admin/verifications/${r.id}/document`} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-brand-700 hover:underline">
                  View document ↗
                </a>
              </div>
              <VerificationDecisionForm action={reviewVerificationAction.bind(null, r.id)} id={r.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
