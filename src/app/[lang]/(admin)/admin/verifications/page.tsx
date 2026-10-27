import type { Metadata } from "next";
import { pick } from "@/i18n/locales";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, like, readSearch } from "@/lib/admin/search";
import { ID_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { reviewVerificationAction } from "@/actions/admin";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { VerificationDecisionForm } from "../admin-forms";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.verificationsMetaTitle };
}

const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export default async function AdminVerificationsPage({ searchParams }: PageProps<"/[lang]/admin/verifications">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const search = readSearch(await searchParams, REQUEST_STATUSES);
  const where: Prisma.VerificationRequestWhereInput = {
    ...(search.status ? { status: search.status } : {}),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    ...(search.q
      ? {
          OR: [
            { id: search.q },
            { legalName: like(search.q) },
            { seller: { displayName: like(search.q) } },
            { seller: { user: { email: like(search.q) } } },
          ],
        }
      : {}),
  };
  const sellerSelect = { select: { displayName: true, slug: true, userId: true, createdAt: true, user: { select: { email: true } } } };
  const [pending, history, total] = await Promise.all([
    db.verificationRequest.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { seller: sellerSelect }, take: 50 }),
    db.verificationRequest.findMany({ where, orderBy: { createdAt: "desc" }, include: { seller: sellerSelect }, skip: search.skip, take: search.take }),
    db.verificationRequest.count({ where }),
  ]);
  // Reviewers are stored by id only; look their emails up in one query.
  const reviewerIds = [...new Set(history.map((r) => r.reviewerId).filter((id): id is string => !!id))];
  const reviewers = new Map((await db.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  const tone: Record<string, string> = {
    PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
    APPROVED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    REJECTED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  };

  return (
    <>
      <PageHeader title={t.verificationsTitle} description={t.verificationsIntro} />
      {pending.length === 0 ? (
        <EmptyState title={t.queueEmpty} />
      ) : (
        <ul className="space-y-4">
          {pending.map((r) => (
            <li key={r.id} className="card grid gap-5 p-5 md:grid-cols-[1fr_16rem]">
              <div className="space-y-2 text-sm">
                <p className="text-base font-semibold">
                  <Link href={`/admin/users/${r.seller.userId}`} className="hover:text-brand-700">{r.seller.displayName}</Link>
                  <span className="ml-2 text-xs font-normal text-slate-500">{r.seller.user.email}</span>
                </p>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div><dt className="text-slate-500">{t.legalName}</dt><dd>{r.legalName}</dd></div>
                  <div><dt className="text-slate-500">{t.phone}</dt><dd>{r.phone}</dd></div>
                  <div><dt className="text-slate-500">{t.document}</dt><dd>{pick(ID_TYPE_LABELS[r.idType as keyof typeof ID_TYPE_LABELS], locale)} ···{r.idNumberLast4}</dd></div>
                  <div><dt className="text-slate-500">{t.submitted}</dt><dd>{formatDateTime(r.createdAt, locale)}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-slate-500">{t.address}</dt><dd>{r.address}</dd></div>
                </dl>
                <a href={`/api/admin/verifications/${r.id}/document`} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-brand-700 hover:underline">
                  {t.viewDocument}
                </a>
              </div>
              <VerificationDecisionForm action={reviewVerificationAction.bind(null, r.id)} id={r.id} />
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8" aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-bold">{t.historyTitle}</h2>
        <SearchBar
          search={search}
          path="/admin/verifications"
          placeholder={t.placeholders.verifications}
          statuses={REQUEST_STATUSES.map((s) => ({ value: s, label: t.requestStatus[s] }))}
        />
        {history.length === 0 ? (
          <EmptyState title={t.searchBar.none} />
        ) : (
          <ul className="card divide-y divide-slate-100">
            {history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p>
                    <Link href={`/admin/users/${r.seller.userId}`} className="font-semibold hover:text-brand-700">{r.seller.displayName || dict.common.deletedShop}</Link>
                    <span className="ml-2 text-xs text-slate-500">{r.seller.user.email}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.legalName} · {pick(ID_TYPE_LABELS[r.idType as keyof typeof ID_TYPE_LABELS], locale)} ···{r.idNumberLast4} · {t.submitted} {formatDateTime(r.createdAt, locale)}
                  </p>
                  {r.reviewedAt && (
                    <p className="text-xs text-slate-500">{t.reviewedBy(reviewers.get(r.reviewerId ?? "") ?? t.system, formatDateTime(r.reviewedAt, locale))}</p>
                  )}
                  {r.reviewNote && <p className="text-xs text-slate-700">“{r.reviewNote}”</p>}
                  <a href={`/api/admin/verifications/${r.id}/document`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-700 hover:underline">
                    {t.viewDocument}
                  </a>
                </div>
                <Badge className={tone[r.status]}>{t.requestStatus[r.status as keyof typeof t.requestStatus] ?? r.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Pager search={search} total={total} path="/admin/verifications" />
      </section>
    </>
  );
}
