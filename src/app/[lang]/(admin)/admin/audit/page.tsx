import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, like, readSearch } from "@/lib/admin/search";
import { formatDateTime } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { EmptyState, PageHeader } from "@/components/ui";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.auditTitle };
}

/** Where an audited record can be looked at, if anywhere. */
function entityHref(entity: string, id: string) {
  if (entity === "Order") return `/admin/orders/${id}`;
  if (entity === "User") return `/admin/users/${id}`;
  if (entity === "Dispute") return `/disputes/${id}`;
  if (entity === "Withdrawal") return `/admin/payouts?q=${id}#history`;
  if (entity === "VerificationRequest") return `/admin/verifications?q=${id}#history`;
  return null;
}

export default async function AuditPage({ searchParams }: PageProps<"/[lang]/admin/audit">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const actions = Object.keys(t.auditActions).sort();
  // The status filter here is the action.
  const search = readSearch(await searchParams, actions);
  const where: Prisma.AuditLogWhereInput = {
    ...(search.status ? { action: search.status } : {}),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    ...(search.q ? { OR: [{ entityId: search.q }, { actorId: search.q }, { ip: search.q }, { actor: { email: like(search.q) } }] } : {}),
  };
  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: search.skip,
      take: search.take,
      include: { actor: { select: { id: true, email: true } } },
    }),
    db.auditLog.count({ where }),
  ]);
  return (
    <>
      <PageHeader title={t.auditTitle} description={t.auditIntro} />
      <SearchBar
        search={search}
        path="/admin/audit"
        placeholder={t.placeholders.audit}
        statusLabel={t.action}
        statuses={actions.map((a) => ({ value: a, label: t.auditActions[a] ?? a }))}
      />
      {entries.length === 0 ? (
        <EmptyState title={t.searchBar.none} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="p-3 font-medium">{t.when}</th>
                <th className="p-3 font-medium">{t.actor}</th>
                <th className="p-3 font-medium">{t.action}</th>
                <th className="p-3 font-medium">{t.entity}</th>
                <th className="p-3 font-medium">{t.ip}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => {
                const href = entityHref(e.entity, e.entityId);
                return (
                  <tr key={e.id}>
                    <td className="p-3 whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt, locale)}</td>
                    <td className="p-3">
                      {e.actor ? (
                        <Link href={`/admin/users/${e.actor.id}`} className="hover:text-brand-700">{e.actor.email}</Link>
                      ) : (
                        t.system
                      )}
                    </td>
                    <td className="p-3">
                      {t.auditActions[e.action] ?? e.action}
                      <span className="num block text-xs text-slate-400">{e.action}</span>
                    </td>
                    <td className="p-3 num text-xs">
                      {href ? (
                        <Link href={href} className="text-brand-700 hover:underline">{e.entity}:{e.entityId.slice(0, 10)}</Link>
                      ) : (
                        `${e.entity}:${e.entityId.slice(0, 10)}`
                      )}
                    </td>
                    <td className="p-3 text-slate-500">{e.ip ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager search={search} total={total} path="/admin/audit" />
    </>
  );
}
