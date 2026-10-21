import { beforeEach, describe, expect, it } from "vitest";

const { db } = await import("@/lib/db");
const { findOrCreateGoogleUser, parseGoogleClaims, GoogleSignInError } = await import("@/lib/auth/google");

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const future = Math.floor(Date.now() / 1000) + 600;
const claims = (over: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  exp: future,
  sub: "google-sub-1",
  email: "Person@Example.com",
  email_verified: true,
  name: "Pat Person",
  ...over,
});

describe("Google ID token claims", () => {
  it("accepts valid claims and normalises the email", () => {
    expect(parseGoogleClaims(claims(), CLIENT_ID)).toEqual({ sub: "google-sub-1", email: "person@example.com", email_verified: true, name: "Pat Person" });
  });

  it("rejects tokens for another app, another issuer, or already expired", () => {
    expect(() => parseGoogleClaims(claims({ aud: "someone-else" }), CLIENT_ID)).toThrow(GoogleSignInError);
    expect(() => parseGoogleClaims(claims({ iss: "https://evil.example" }), CLIENT_ID)).toThrow(GoogleSignInError);
    expect(() => parseGoogleClaims(claims({ exp: 1 }), CLIENT_ID)).toThrow(GoogleSignInError);
    expect(() => parseGoogleClaims(claims({ sub: undefined }), CLIENT_ID)).toThrow(GoogleSignInError);
  });
});

describe("Google account linking", () => {
  beforeEach(async () => {
    await db.oAuthAccount.deleteMany();
    await db.session.deleteMany();
    await db.user.deleteMany({ where: { email: { in: ["person@example.com", "owner@example.com"] } } });
  });

  it("creates a password-less user on first sign-in, then reuses it", async () => {
    const first = await findOrCreateGoogleUser(parseGoogleClaims(claims(), CLIENT_ID));
    expect(first.created).toBe(true);
    expect(first.user.passwordHash).toBeNull();
    expect(first.user.name).toBe("Pat Person");

    const again = await findOrCreateGoogleUser(parseGoogleClaims(claims({ email: "changed@example.com" }), CLIENT_ID));
    expect(again.user.id).toBe(first.user.id); // matched by Google's stable id, not email
    expect(again.created).toBe(false);
  });

  it("links to an existing email/password account only when Google verified the email", async () => {
    const owner = await db.user.create({ data: { email: "owner@example.com", name: "Owner", passwordHash: "x" } });
    await expect(
      findOrCreateGoogleUser(parseGoogleClaims(claims({ sub: "attacker", email: "owner@example.com", email_verified: false }), CLIENT_ID)),
    ).rejects.toThrow(/not verified/);
    expect(await db.oAuthAccount.count({ where: { userId: owner.id } })).toBe(0);

    const res = await findOrCreateGoogleUser(parseGoogleClaims(claims({ sub: "owner-google", email: "owner@example.com" }), CLIENT_ID));
    expect(res.linked).toBe(true);
    expect(res.user.id).toBe(owner.id);
  });
});
