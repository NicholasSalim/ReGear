import "server-only";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/orders/service";
import { deletePrivateDocument, deletePublicImage } from "@/lib/storage";
import { OPEN_WITHDRAWAL_STATUSES, type OrderStatus } from "@/lib/constants";

// Account deletion. The user row is anonymised, not removed: orders, reviews
// and dispute threads belong to the other party too and stay readable, shown
// as "Deleted user" / "Deleted shop". Everything that identifies the person
// is deleted.

/** Orders in these states still hold money, an item or a claim. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "RETURN_IN_PROGRESS", "DISPUTED"];

export type DeletionBlockers = { admin: boolean; purchases: number; sales: number; balance: boolean };

type Reader = Pick<typeof db, "order" | "balanceEntry" | "withdrawal">;

async function openOrderCounts(client: Reader, userId: string, sellerId: string | undefined) {
  const [purchases, sales] = await Promise.all([
    client.order.count({ where: { buyerId: userId, status: { in: OPEN_ORDER_STATUSES } } }),
    sellerId ? client.order.count({ where: { sellerId, status: { in: OPEN_ORDER_STATUSES } } }) : 0,
  ]);
  return { purchases, sales };
}

/** Money the seller hasn't withdrawn yet would be lost with the account. */
async function hasMoney(client: Reader, sellerId: string | undefined) {
  if (!sellerId) return false;
  const [sum, open] = await Promise.all([
    client.balanceEntry.aggregate({ where: { sellerId }, _sum: { amountIdr: true } }),
    client.withdrawal.count({ where: { sellerId, status: { in: OPEN_WITHDRAWAL_STATUSES } } }),
  ]);
  return (sum._sum.amountIdr ?? 0) > 0 || open > 0;
}

/** What stops this account from being deleted right now (all zero/false means it can be). */
export async function getDeletionBlockers(userId: string): Promise<DeletionBlockers> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, sellerProfile: { select: { id: true } } } });
  const [counts, balance] = await Promise.all([openOrderCounts(db, userId, user.sellerProfile?.id), hasMoney(db, user.sellerProfile?.id)]);
  return { admin: user.role === "ADMIN", ...counts, balance };
}

export function isBlocked(b: DeletionBlockers) {
  return b.admin || b.purchases > 0 || b.sales > 0 || b.balance;
}

/** Address fields that identify the buyer; the city and country stay for records. */
const REDACTED_ADDRESS = { fullName: "", phone: "", line1: "", line2: "", postalCode: "" };

/**
 * Deletes the account in one transaction and returns what to invalidate.
 * Throws DomainError("accountBusy") if an order is still open, re-checked
 * inside the transaction after listings are taken down and sessions ended,
 * so a checkout racing the deletion either finishes first (and blocks it) or
 * finds the listing gone.
 */
export async function deleteAccount(userId: string) {
  const files = await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true, deletedAt: true, sellerProfile: { select: { id: true } } },
    });
    if (user.deletedAt) return { publicKeys: [], privateKeys: [], sellerId: undefined, listingIds: [] };
    if (user.role === "ADMIN") throw new DomainError("adminAccount");
    const sellerId = user.sellerProfile?.id;

    // 1. Stop new activity: listings come down (waits for any checkout holding
    //    a listing row), and every session ends.
    const listings = sellerId ? await tx.listing.findMany({ where: { sellerId, status: { not: "RESERVED" } }, select: { id: true } }) : [];
    if (sellerId) await tx.listing.updateMany({ where: { sellerId, status: { not: "RESERVED" } }, data: { status: "REMOVED" } });
    await tx.session.deleteMany({ where: { userId } });

    // 2. Nothing may still be in progress.
    const open = await openOrderCounts(tx, userId, sellerId);
    if (open.purchases > 0 || open.sales > 0) throw new DomainError("accountBusy");
    if (sellerId && (await tx.listing.count({ where: { sellerId, status: "RESERVED" } })) > 0) throw new DomainError("accountBusy");
    if (await hasMoney(tx, sellerId)) throw new DomainError("accountHasBalance");

    // 3. Photos: keep the ones past orders show (their snapshot points at the
    //    listing's photos); delete unattached photos and those of listings that never sold.
    const uploads = await tx.upload.findMany({
      where: { ownerId: userId, OR: [{ listingId: null }, { listing: { orders: { none: {} } } }] },
      select: { id: true, key: true },
    });
    await tx.upload.deleteMany({ where: { id: { in: uploads.map((u) => u.id) } } });

    // 4. Verification records hold the legal name, address, phone and ID photo.
    const verifications = sellerId ? await tx.verificationRequest.findMany({ where: { sellerId }, select: { documentKey: true } }) : [];
    if (sellerId) await tx.verificationRequest.deleteMany({ where: { sellerId } });

    // 5. The buyer's shipping details on past orders, in one statement however
    //    many orders there are. Addresses are always written as JSON objects
    //    (checkout stores the validated form), so the cast is safe.
    await tx.$executeRaw`
      UPDATE "Order" SET "shippingAddress" = ("shippingAddress"::jsonb || ${JSON.stringify(REDACTED_ADDRESS)}::jsonb)::text
      WHERE "buyerId" = ${userId}`;

    // 6. Everything else personal.
    await tx.favorite.deleteMany({ where: { userId } });
    await tx.emailToken.deleteMany({ where: { userId } });
    await tx.emailOutbox.deleteMany({ where: { userId } });
    await tx.oAuthAccount.deleteMany({ where: { userId } });
    if (sellerId) {
      await tx.sellerProfile.update({
        where: { id: sellerId },
        data: {
          displayName: "",
          bio: "",
          location: "",
          verificationStatus: "UNVERIFIED",
          verifiedAt: null,
          payoutBank: null,
          payoutAccountNumber: null,
          payoutAccountName: null,
          payoutAccountSetAt: null,
        },
      });
    }
    // The email is freed so the person can sign up again later.
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        name: "",
        passwordHash: null,
        failedLoginCount: 0,
        lockedUntil: null,
        deletedAt: new Date(),
      },
    });

    return {
      publicKeys: uploads.map((u) => u.key),
      privateKeys: verifications.map((v) => v.documentKey),
      sellerId,
      listingIds: listings.map((l) => l.id),
    };
  });

  // Files go only after the database commit, so a rollback never loses one.
  await Promise.all([...files.publicKeys.map(deletePublicImage), ...files.privateKeys.map(deletePrivateDocument)]);
  return { sellerId: files.sellerId, listingIds: files.listingIds };
}
