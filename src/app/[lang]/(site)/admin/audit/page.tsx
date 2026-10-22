import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.auditTitle };
}

export default async function AuditPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin;
  await requireAdmin();
  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true } } },
  });
  return (
    <>
      <PageHeader title={t.auditTitle} description={t.auditIntro} />
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
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="p-3 whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt, locale)}</td>
                <td className="p-3">{e.actor?.email ?? t.system}</td>
                <td className="p-3">
                  {t.auditActions[e.action] ?? e.action}
                  <span className="num block text-xs text-slate-400">{e.action}</span>
                </td>
                <td className="p-3 num text-xs">{e.entity}:{e.entityId.slice(0, 10)}</td>
                <td className="p-3 text-slate-500">{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
