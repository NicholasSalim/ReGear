import type { Metadata } from "next";
import { getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  const locale = await getLocale();
  await requireAdmin();
  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { email: true } } },
  });
  return (
    <>
      <PageHeader title="Audit log" description="Security-relevant events, most recent first." />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Actor</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Entity</th>
              <th className="p-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="p-3 whitespace-nowrap text-slate-500">{formatDateTime(e.createdAt, locale)}</td>
                <td className="p-3">{e.actor?.email ?? "system"}</td>
                <td className="p-3 num text-xs">{e.action}</td>
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
