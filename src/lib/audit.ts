import "server-only";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/security/request";

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown> = {},
) {
  try {
    await db.auditLog.create({
      data: { actorId, action, entity, entityId, meta: JSON.stringify(meta), ip: await getClientIp() },
    });
  } catch (err) {
    // Auditing must never break the user-facing operation.
    console.error("audit log failed", err);
  }
}
