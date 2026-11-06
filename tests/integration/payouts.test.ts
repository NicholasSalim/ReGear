import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const orders = await import("@/lib/orders/service");
const service = await import("@/lib/payouts/service");
const { payouts, PayoutError } = await import("@/lib/payouts/provider");
const { getDeletionBlockers } = await import("@/lib/account/delete");

const address = { fullName: "Test Buyer", phone: "+62 000 0000 000", line1: "Jl. Test 1", line2: "", city: "Jakarta", region: "", postalCode: "10110", country: "Indonesia" };

async function fixture() {
  await db.$transaction([
    db.emailOutbox.deleteMany(),
    db.disputeMessage.deleteMany(),
    db.dispute.deleteMany(),
    db.review.deleteMany(),
    db.returnRequest.deleteMany(),
    db.orderEvent.deleteMany(),
    db.balanceEntry.deleteMany(),
    db.withdrawal.deleteMany(),
    db.order.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.verificationRequest.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.user.deleteMany(),
  ]);
  const sellerUser = await db.user.create({ data: { email: "s@test.dev", name: "Seller", passwordHash: "x", emailVerifiedAt: new Date() } });
  const buyer = await db.user.create({ data: { email: "b@test.dev", name: "Buyer", passwordHash: "x", emailVerifiedAt: new Date() } });
  const seller = await db.sellerProfile.create({ data: { userId: sellerUser.id, slug: "s", displayName: "S", verificationStatus: "VERIFIED", verifiedAt: new Date() } });
  await db.verificationRequest.create({
    data: { sellerId: seller.id, legalName: "Budi Santoso", phone: "+62 811", address: "Jakarta", idType: "NATIONAL_ID", idNumberLast4: "1234", documentKey: "k", status: "APPROVED", reviewedAt: new Date() },
  });
  return { sellerUser, buyer, seller };
}

let n = 0;
/** List an item, sell it and let the buyer accept it: the seller's balance grows by its share. */
async function sale(f: Awaited<ReturnType<typeof fixture>>, priceIdr = 1_000_000) {
  const listing = await db.listing.create({
    data: { slug: `item-${++n}`, sellerId: f.seller.id, title: "Item", category: "phones", brand: "B", model: "M", description: "d", priceIdr, shippingIdr: 0, conditionGrade: "GOOD", returnWindowDays: 7, status: "ACTIVE" },
  });
  const { orderId } = await orders.createOrder(f.buyer.id, listing.id, address);
  await orders.payOrder(orderId, f.buyer.id);
  await orders.shipOrder(orderId, f.sellerUser.id, "JNE", `JNE${n}0000`);
  await orders.confirmDelivery(orderId, f.buyer.id);
  await orders.acceptOrder(orderId, f.buyer.id);
  return db.order.findUniqueOrThrow({ where: { id: orderId } });
}

/** A saved account the bank says belongs to the verified seller, set long enough ago not to count as new. */
async function trustedAccount(f: Awaited<ReturnType<typeof fixture>>) {
  await db.sellerProfile.update({
    where: { id: f.seller.id },
    data: { payoutBank: "bca", payoutAccountNumber: "1234567890", payoutAccountName: "BUDI SANTOSO", payoutAccountSetAt: new Date(Date.now() - 7 * 86_400_000) },
  });
}

/** A past completed withdrawal, so the next one isn't the seller's first. */
async function pastWithdrawal(f: Awaited<ReturnType<typeof fixture>>) {
  await db.withdrawal.create({ data: { sellerId: f.seller.id, amountIdr: 1, status: "COMPLETED", bank: "bca", accountNumber: "1234567890", accountName: "BUDI SANTOSO" } });
}

const emailsOf = async (template: string) => db.emailOutbox.findMany({ where: { template } });
const balance = (f: Awaited<ReturnType<typeof fixture>>) => service.sellerBalance(f.seller.id);

describe("seller balance", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("credits the seller's share once when an order completes", async () => {
    const order = await sale(f);
    expect(await balance(f)).toBe(order.totalIdr - order.platformFeeIdr);
    expect(await db.balanceEntry.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("keeps an account with money in it from being deleted", async () => {
    await sale(f);
    expect((await getDeletionBlockers(f.sellerUser.id)).balance).toBe(true);
  });
});

describe("payout account", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
  });

  it("saves the account and emails the seller about the change", async () => {
    const res = await service.setPayoutAccount(f.sellerUser.id, { bank: "bca", accountNumber: "1234567890", accountName: "Budi Santoso" });
    expect(res.accountName).toBe("Budi Santoso");
    expect(await db.sellerProfile.findUniqueOrThrow({ where: { id: f.seller.id } })).toMatchObject({ payoutBank: "bca", payoutAccountName: "Budi Santoso" });
    const [email] = await emailsOf("payout-account-changed");
    expect(JSON.parse(email.params)).toMatchObject({ bank: "BCA", account: "•••• 7890", name: "Budi Santoso" });
  });

  it("refuses a bank that isn't offered", async () => {
    await expect(service.setPayoutAccount(f.sellerUser.id, { bank: "nobank", accountNumber: "1234567", accountName: "Budi" })).rejects.toMatchObject({ code: "bankNotSupported" });
  });

  it("refuses an account in someone else's name once the seller is verified", async () => {
    await expect(service.setPayoutAccount(f.sellerUser.id, { bank: "bca", accountNumber: "1234567890", accountName: "Someone Else" })).rejects.toMatchObject({ code: "accountNameMismatch" });
    expect(await db.sellerProfile.findUniqueOrThrow({ where: { id: f.seller.id } })).toMatchObject({ payoutAccountName: null });
    expect(await emailsOf("payout-account-changed")).toHaveLength(0);
  });

  it("accepts the shortened names banks use", async () => {
    await expect(service.setPayoutAccount(f.sellerUser.id, { bank: "bca", accountNumber: "1234567890", accountName: "BUDI S" })).resolves.toMatchObject({ accountName: "BUDI S" });
  });

  it("still lets an unverified seller save an account", async () => {
    await db.verificationRequest.deleteMany({ where: { sellerId: f.seller.id } });
    await expect(service.setPayoutAccount(f.sellerUser.id, { bank: "bca", accountNumber: "1234567890", accountName: "Someone Else" })).resolves.toMatchObject({ accountName: "Someone Else" });
  });
});

describe("withdrawals", () => {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => {
    f = await fixture();
    await sale(f);
  });
  afterEach(() => vi.restoreAllMocks());

  it("holds a first withdrawal to a new account for review, taking the money out at once", async () => {
    await service.setPayoutAccount(f.sellerUser.id, { bank: "bca", accountNumber: "1234567890", accountName: "Budi Santoso" });
    const before = await balance(f);

    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000);
    expect(w.status).toBe("PENDING_REVIEW");
    expect(JSON.parse(w.reviewReasons)).toEqual(["first", "newAccount"]);
    expect(await balance(f)).toBe(before - 500_000);
    await expect(service.requestWithdrawal(f.sellerUser.id, 10_000)).rejects.toMatchObject({ code: "withdrawalOpen" });
  });

  it("returns a rejected withdrawal to the balance and tells the seller why", async () => {
    await trustedAccount(f);
    const before = await balance(f);
    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000); // first withdrawal: reviewed
    await service.rejectWithdrawal(w.id, f.sellerUser.id, "Please use an account in your own name.");
    expect(await db.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "REJECTED" });
    expect(await balance(f)).toBe(before);
    const [email] = await emailsOf("withdrawal-failed");
    expect(JSON.parse(email.params)).toMatchObject({ amountIdr: 500_000, rejected: true });
  });

  it("sends an approved withdrawal and follows it to completion", async () => {
    await trustedAccount(f);
    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000);
    await service.approveWithdrawal(w.id, f.sellerUser.id);
    expect(await db.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "COMPLETED", providerRef: expect.stringMatching(/^sim_po_/) });
    expect(await emailsOf("withdrawal-completed")).toHaveLength(1);
  });

  it("sends straight to the bank when no rule applies", async () => {
    await trustedAccount(f);
    await pastWithdrawal(f);
    const send = vi.spyOn(payouts, "send");
    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000);
    expect(w.status).toBe("COMPLETED");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ withdrawalId: w.id, bank: "bca", account: "1234567890", name: "BUDI SANTOSO", amountIdr: 500_000 }));
  });

  it("reviews withdrawals whose account holder isn't the verified seller, large amounts and open disputes", async () => {
    await trustedAccount(f);
    await pastWithdrawal(f);
    await db.sellerProfile.update({ where: { id: f.seller.id }, data: { payoutAccountName: "ANDI WIJAYA" } });
    await db.balanceEntry.create({ data: { sellerId: f.seller.id, type: "SALE", amountIdr: 20_000_000 } });
    const w = await service.requestWithdrawal(f.sellerUser.id, 15_000_000);
    expect(JSON.parse(w.reviewReasons)).toEqual(["large", "nameMismatch"]);
  });

  it("refuses what the seller can't withdraw", async () => {
    await trustedAccount(f);
    const all = await balance(f);
    await expect(service.requestWithdrawal(f.sellerUser.id, all + 1)).rejects.toMatchObject({ code: "insufficientBalance" });
    await expect(service.requestWithdrawal(f.sellerUser.id, 9_999)).rejects.toMatchObject({ code: "withdrawalMinimum" });
    await db.sellerProfile.update({ where: { id: f.seller.id }, data: { verificationStatus: "REJECTED" } });
    await expect(service.requestWithdrawal(f.sellerUser.id, 10_000)).rejects.toMatchObject({ code: "withdrawNeedsVerification" });
    await db.sellerProfile.update({ where: { id: f.seller.id }, data: { verificationStatus: "VERIFIED", payoutAccountNumber: null } });
    await expect(service.requestWithdrawal(f.sellerUser.id, 10_000)).rejects.toMatchObject({ code: "withdrawNeedsAccount" });
  });

  it("lets only one of two simultaneous requests for the whole balance through", async () => {
    await trustedAccount(f);
    const all = await balance(f);
    const results = await Promise.allSettled([service.requestWithdrawal(f.sellerUser.id, all), service.requestWithdrawal(f.sellerUser.id, all)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(f)).toBe(0);
  });

  it("waits for the admin to pay by hand, then records it paid", async () => {
    await trustedAccount(f);
    await pastWithdrawal(f);
    const before = await balance(f);
    const provider = payouts as { mode: string };
    provider.mode = "manual"; // as in production
    const send = vi.spyOn(payouts, "send");
    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000).finally(() => (provider.mode = "simulated"));
    expect(w).toMatchObject({ status: "NEEDS_ATTENTION", note: null });
    expect(send).not.toHaveBeenCalled();
    expect(await balance(f)).toBe(before - 500_000);

    await service.markWithdrawalPaid(w.id, "BCA transfer 123456");
    expect(await db.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "COMPLETED", note: "BCA transfer 123456" });
    expect(await emailsOf("withdrawal-completed")).toHaveLength(1);
    await expect(service.markWithdrawalFailed(w.id, "too late")).rejects.toMatchObject({ code: "withdrawalChanged" });
  });

  it("gives the money back when the transfer couldn't be made", async () => {
    await trustedAccount(f);
    await pastWithdrawal(f);
    const before = await balance(f);
    vi.spyOn(payouts, "send").mockRejectedValueOnce(new PayoutError("refused"));
    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000);
    expect(w).toMatchObject({ status: "NEEDS_ATTENTION", note: "refused" });
    await service.markWithdrawalFailed(w.id, "Account closed at the bank");
    expect(await balance(f)).toBe(before);
    await expect(service.markWithdrawalFailed(w.id, "again")).rejects.toMatchObject({ code: "withdrawalChanged" });
  });

  it("returns the money when the bank transfer fails later", async () => {
    await trustedAccount(f);
    await pastWithdrawal(f);
    const before = await balance(f);
    const status = vi.spyOn(payouts, "status").mockResolvedValue("processing");
    const w = await service.requestWithdrawal(f.sellerUser.id, 500_000);
    expect(w.status).toBe("PROCESSING");

    status.mockResolvedValue("failed");
    await service.runPayoutMaintenance();
    await service.runPayoutMaintenance(); // a second pass changes nothing
    expect(await db.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "FAILED" });
    expect(await balance(f)).toBe(before);
  });

  it("flags a send that was interrupted instead of sending it again", async () => {
    await trustedAccount(f);
    const w = await db.withdrawal.create({
      data: { sellerId: f.seller.id, amountIdr: 1_000, status: "SENDING", bank: "bca", accountNumber: "1234567890", accountName: "BUDI SANTOSO" },
    });
    await db.$executeRaw`UPDATE "Withdrawal" SET "updatedAt" = ${new Date(Date.now() - 3_600_000)} WHERE "id" = ${w.id}`;
    const send = vi.spyOn(payouts, "send");
    expect((await service.runPayoutMaintenance()).withdrawalsStuck).toBe(1);
    expect(send).not.toHaveBeenCalled();
    expect(await db.withdrawal.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ status: "NEEDS_ATTENTION" });
  });
});

describe("account holder names", () => {
  it("match despite case, punctuation, initials and titles", () => {
    expect(service.namesMatch("Budi Santoso", "BUDI SANTOSO")).toBe(true);
    expect(service.namesMatch("Budi S.", "BUDI SANTOSO")).toBe(true);
    expect(service.namesMatch("BUDI SANTOSO", "Budi S.")).toBe(true);
    expect(service.namesMatch("Ir. Budi Santoso", "BUDI SANTOSO")).toBe(true);
    expect(service.namesMatch("Budi Hartono", "BUDI SANTOSO")).toBe(false);
    expect(service.namesMatch("Andi Wijaya", "BUDI SANTOSO")).toBe(false);
    expect(service.namesMatch("", "BUDI SANTOSO")).toBe(false);
  });
});
