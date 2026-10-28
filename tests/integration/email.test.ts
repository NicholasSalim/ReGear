import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const { deliverPendingEmails, enqueueEmail } = await import("@/lib/email/outbox");
const { DEV_MAIL_DIR } = await import("@/lib/email/transport");
const { issueEmailToken, isEmailTokenValid, resetPasswordWithToken } = await import("@/lib/auth/email-tokens");
const { hashPassword, verifyPassword } = await import("@/lib/auth/password");

const address = { fullName: "Test Buyer", phone: "+62 000 0000 000", line1: "Jl. Test 1", line2: "", city: "Jakarta", region: "", postalCode: "10110", country: "Indonesia" };

async function fixture() {
  await db.$transaction([
    db.emailOutbox.deleteMany(),
    db.emailToken.deleteMany(),
    db.disputeMessage.deleteMany(),
    db.dispute.deleteMany(),
    db.review.deleteMany(),
    db.returnRequest.deleteMany(),
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.withdrawal.deleteMany(),
    db.order.deleteMany(),
    db.favorite.deleteMany(),
    db.upload.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.verificationRequest.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.oAuthAccount.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
  ]);
  await rm(DEV_MAIL_DIR, { recursive: true, force: true });
  const verified = new Date();
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Sam Seller", passwordHash: "x", emailVerifiedAt: verified, locale: "en" } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Bea Buyer", passwordHash: "x", emailVerifiedAt: verified, locale: "id" } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "sam", displayName: "Sam's Shop" } });
  const listing = await db.listing.create({
    data: { slug: "item", sellerId: seller.id, title: "Pixel <7>", category: "phones", brand: "Google", model: "Pixel 7", description: "d", priceIdr: 10_000, conditionGrade: "GOOD", returnWindowDays: 7, status: "ACTIVE" },
  });
  return { sellerUser, buyer, seller, listing };
}

const outbox = () => db.emailOutbox.findMany({ orderBy: { createdAt: "asc" } });
async function sentFiles() {
  const files = (await readdir(DEV_MAIL_DIR).catch(() => [] as string[])).sort();
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(DEV_MAIL_DIR, f), "utf8")) as { to: string; subject: string; html: string; text: string }));
}

describe("order emails", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("tells buyer and seller when an order is paid, in each one's language", async () => {
    const { orderId } = await orders.createOrder(f.buyer.id, f.listing.id, address);
    expect(await outbox()).toHaveLength(0); // an unpaid order reaches nobody yet
    await orders.payOrder(orderId, f.buyer.id);

    const rows = await outbox();
    expect(rows.map((r) => [r.userId, r.locale, JSON.parse(r.params).role])).toEqual([
      [f.buyer.id, "id", "buyer"],
      [f.sellerUser.id, "en", "seller"],
    ]);

    expect(await deliverPendingEmails()).toEqual({ sent: 2, considered: 2 });
    const mails = await sentFiles();
    const toSeller = mails.find((m) => m.to === "s@test.dev")!;
    const toBuyer = mails.find((m) => m.to === "b@test.dev")!;
    expect(toSeller.subject).toMatch(/^New order RG-.+: please ship it$/);
    expect(toBuyer.subject).toMatch(/^Pembayaran diterima untuk pesanan RG-/);
    expect(toSeller.text).toContain(`/en/sell/orders/${orderId}`);
    expect(toBuyer.text).toContain(`/account/orders/${orderId}`);
    // Listing titles are escaped in HTML.
    expect(toSeller.html).toContain("Pixel &lt;7&gt;");
    expect(toSeller.html).not.toContain("Pixel <7>");
    expect((await outbox()).every((r) => r.status === "SENT")).toBe(true);
  });

  it("sends nothing for a change that was rolled back", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await enqueueEmail(tx, { userId: f.buyer.id, locale: "id" }, { template: "verification-approved", params: {} });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await outbox()).toHaveLength(0);
  });

  it("sends each email once when two deliveries run at the same time", async () => {
    for (let i = 0; i < 6; i++) await enqueueEmail(db, { userId: f.buyer.id, locale: "id" }, { template: "verification-approved", params: {} });
    const [a, b] = await Promise.all([deliverPendingEmails(), deliverPendingEmails()]);
    expect(a.sent + b.sent).toBe(6);
    expect(await sentFiles()).toHaveLength(6);
    expect((await outbox()).every((r) => r.status === "SENT")).toBe(true);
  });

  it("skips unverified or deleted recipients", async () => {
    await db.user.update({ where: { id: f.buyer.id }, data: { emailVerifiedAt: null } });
    await db.user.update({ where: { id: f.sellerUser.id }, data: { deletedAt: new Date() } });
    await enqueueEmail(db, { userId: f.buyer.id, locale: "id" }, { template: "verification-approved", params: {} });
    await enqueueEmail(db, { userId: f.sellerUser.id, locale: "en" }, { template: "verification-approved", params: {} });
    expect(await deliverPendingEmails()).toEqual({ sent: 0, considered: 2 });
    expect((await outbox()).map((r) => r.status)).toEqual(["SKIPPED", "SKIPPED"]);
    expect(await sentFiles()).toHaveLength(0);
  });
});

describe("email links", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("resets a password once, ends every session and clears a lockout", async () => {
    await db.user.update({ where: { id: f.buyer.id }, data: { passwordHash: await hashPassword("old-Pass-1!"), failedLoginCount: 3, lockedUntil: new Date(Date.now() + 600_000) } });
    await db.session.create({ data: { id: "s1", userId: f.buyer.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const older = await issueEmailToken(db, f.buyer.id, "RESET_PASSWORD");
    const token = await issueEmailToken(db, f.buyer.id, "RESET_PASSWORD");
    expect(await isEmailTokenValid(older, "RESET_PASSWORD")).toBe(false); // a new link retires the old one
    expect(await isEmailTokenValid(token, "RESET_PASSWORD")).toBe(true);

    expect(await resetPasswordWithToken(token, "new-Pass-2!")).toBe(f.buyer.id);
    const user = await db.user.findUniqueOrThrow({ where: { id: f.buyer.id } });
    expect((await verifyPassword("new-Pass-2!", user.passwordHash!)).ok).toBe(true);
    expect(user).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
    expect(await db.session.count({ where: { userId: f.buyer.id } })).toBe(0);
    expect(await resetPasswordWithToken(token, "other-Pass-3!")).toBeNull();
  });

  it("refuses expired links", async () => {
    const token = await issueEmailToken(db, f.buyer.id, "RESET_PASSWORD");
    await db.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await isEmailTokenValid(token, "RESET_PASSWORD")).toBe(false);
    expect(await resetPasswordWithToken(token, "new-Pass-2!")).toBeNull();
  });

  it("wipes the link from the queue once the email is sent", async () => {
    await enqueueEmail(db, { userId: f.buyer.id, to: "b@test.dev", locale: "id" }, { template: "reset-password", params: { url: "http://localhost:3000/reset-password?token=abc", name: "Bea" } });
    await deliverPendingEmails();
    const [row] = await outbox();
    expect(row.status).toBe("SENT");
    expect(row.params).toBe("{}");
    const [mail] = await sentFiles();
    expect(mail.text).toContain("token=abc");
  });
});
