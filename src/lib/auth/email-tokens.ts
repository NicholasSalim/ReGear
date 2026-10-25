import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { hashToken } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

// One-time links sent by email. The raw token only ever exists in the email;
// the database keeps its SHA-256. Issuing a new link retires older unused
// ones of the same kind, and a link works once until it expires.

export type TokenPurpose = "VERIFY_EMAIL" | "RESET_PASSWORD";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 60 * 60_000,
  RESET_PASSWORD: 60 * 60_000,
};

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
type Client = Pick<Prisma.TransactionClient, "emailToken">;

export async function issueEmailToken(client: Client, userId: string, purpose: TokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  await client.emailToken.deleteMany({ where: { userId, purpose, usedAt: null } });
  await client.emailToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]) } });
  return token;
}

/** Whether a link is still usable, without using it up (to decide what the page shows). */
export async function isEmailTokenValid(token: unknown, purpose: TokenPurpose) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return false;
  const row = await db.emailToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { purpose: true, usedAt: true, expiresAt: true } });
  return !!row && row.purpose === purpose && !row.usedAt && row.expiresAt > new Date();
}

/** Uses up a link and returns its user, or null if it's invalid, used or expired. */
async function consumeEmailToken(tx: Prisma.TransactionClient, token: unknown, purpose: TokenPurpose) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const tokenHash = hashToken(token);
  const used = await tx.emailToken.updateMany({ where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (used.count !== 1) return null;
  const { userId } = await tx.emailToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
  return user && !user.deletedAt ? user.id : null;
}

/** Marks the email verified. Returns the user id, or null for a bad link. */
export async function verifyEmailWithToken(token: unknown) {
  return db.$transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, token, "VERIFY_EMAIL");
    if (!userId) return null;
    await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    return userId;
  });
}

/**
 * Sets a new password from a reset link. Clears any sign-in lockout, ends
 * every session (sessions older than passwordChangedAt stop working) and
 * confirms the email, since the link arrived there. Returns the user id, or
 * null for a bad link.
 */
export async function resetPasswordWithToken(token: unknown, newPassword: string) {
  const passwordHash = await hashPassword(newPassword);
  return db.$transaction(async (tx) => {
    const userId = await consumeEmailToken(tx, token, "RESET_PASSWORD");
    if (!userId) return null;
    const now = new Date();
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true } });
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null, ...(user.emailVerifiedAt ? {} : { emailVerifiedAt: now }) },
    });
    await tx.session.deleteMany({ where: { userId } });
    await tx.emailToken.deleteMany({ where: { userId, purpose: "RESET_PASSWORD", usedAt: null } });
    return userId;
  });
}
