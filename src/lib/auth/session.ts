import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { isHttps } from "@/lib/env";
import { isBanned } from "@/lib/account/ban-state";

// Opaque, server-side sessions. The cookie carries a 256-bit random token;
// the database stores only its SHA-256 so a DB leak cannot hijack sessions.
// Sessions are revocable (logout, password change) unlike stateless JWTs.

// The __Host- prefix pins the cookie to this exact origin over HTTPS (no Domain, Path=/, Secure).
export const SESSION_COOKIE = isHttps ? "__Host-regear_session" : "regear_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_RENEW_MS = 1000 * 60 * 60 * 24 * 15; // renew when < 15 days left

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  await setSessionCookie(token, expiresAt);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  // Reject anything that is not shaped like our token before touching the DB.
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

/** Looks up a live session. Never writes; safe to call from Server Components. */
export async function validateSessionToken(token: string) {
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true, role: true, passwordChangedAt: true, emailVerifiedAt: true, bannedAt: true, bannedUntil: true } },
    },
  });
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  // Sessions issued before the latest password change are invalid.
  if (session.createdAt < session.user.passwordChangedAt) return null;
  // Only accounts whose owner has proved the email address can be signed in.
  if (!session.user.emailVerifiedAt) return null;
  // Banning deletes the sessions too; this also covers one made in the same moment.
  if (isBanned(session.user)) return null;
  return session;
}

/** Sliding renewal; only call from Server Actions / Route Handlers (cookie writes). */
export async function renewSessionIfNeeded(token: string, expiresAt: Date) {
  if (expiresAt.getTime() - Date.now() > SESSION_RENEW_MS) return;
  const next = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.update({ where: { id: hashToken(token) }, data: { expiresAt: next } });
  await setSessionCookie(token, next);
}

export async function destroyCurrentSession() {
  const token = await readSessionToken();
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await db.session.deleteMany({ where: { userId } });
}
