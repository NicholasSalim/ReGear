import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, getSellerProfile } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { InvalidImageError, MAX_UPLOAD_BYTES, savePublicImage } from "@/lib/storage";
import { mediaUrl } from "@/lib/media";

// Listing photo upload. Each request carries one image (multipart field "file").
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload photos" }, { status: 401 });
  if (!(await getSellerProfile(user.id))) {
    return NextResponse.json({ error: "Create a seller profile first" }, { status: 403 });
  }

  const limited = await rateLimit(`upload:${user.id}`, 120, 3600);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Upload limit reached, try again later" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Images must be 8MB or smaller" }, { status: 413 });
  }

  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Images must be 8MB or smaller" }, { status: 413 });

  try {
    const saved = await savePublicImage(Buffer.from(await file.arrayBuffer()));
    const upload = await db.upload.create({ data: { ownerId: user.id, ...saved } });
    return NextResponse.json(
      { id: upload.id, url: mediaUrl(upload.key), width: upload.width, height: upload.height },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof InvalidImageError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
