import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { readPrivateDocument } from "@/lib/storage";

// Identity documents are never publicly addressable; only admins can stream
// them, every access is audited, and responses are never cached.
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/verifications/[id]/document">) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new Response("Not found", { status: 404 });

  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,32}$/i.test(id)) return new Response("Not found", { status: 404 });
  const request = await db.verificationRequest.findUnique({ where: { id }, select: { documentKey: true } });
  if (!request) return new Response("Not found", { status: 404 });

  const data = await readPrivateDocument(request.documentKey);
  if (!data) return new Response("Not found", { status: 404 });
  await audit(user.id, "verification.document_view", "VerificationRequest", id);

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
