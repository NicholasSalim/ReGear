import "server-only";
import { db } from "@/lib/db";
import { catalogueChanged } from "@/lib/cache";
import { DomainError } from "@/lib/errors";
import { deletePrivateDocument, deletePublicImage } from "@/lib/storage";
import { OPEN_WITHDRAWAL_STATUSES, type OrderStatus } from "@/lib/constants";
import { REFUND_NOT_SENT } from "@/lib/orders/refunds";

// Account deletion. The user row is anonymised, not removed: orders, reviews
// and dispute threads belong to the other party too and stay readable, shown
// as "Deleted user" / "Deleted shop". Everything that identifies the person
// is deleted.

/** Orders in these states still hold money, an item or a claim. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "RETURN_IN_PROGRESS", "DISPUTED"];

export type DeletionBlockers = { admin: boolean; purchases: number; sales: number; refunds: number; balance: boolean };

type Reader = Pick<typeof db, "order" | "balanceEntry" | "withdrawal">;

async function openOrderCounts(client: Reader, userId: string, sellerId: string | undefined) {
  const [purchases, sales, refunds] = await Promise.all([
    client.order.count({ where: { buyerId: userId, status: { in: OPEN_ORDER_STATUSES } } }),
    sellerId ? client.order.count({ where: { sellerId, status: { in: OPEN_ORDER_STATUSES } } }) : 0,
    // A cancelled or refunded order can still owe the buyer money; a deleted
    // account couldn't sign in to give its bank account or see it arrive.
    client.order.count({ where: { buyerId: userId, status: { notIn: OPEN_ORDER_STATUSES }, ...REFUND_NOT_SENT } }),
  ]);
  return { purchases, sales, refunds };
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
  return b.admin || b.purchases > 0 || b.sales > 0 || b.refunds > 0 || b.balance;
}

/** Address fields that identify the buyer, including the courier note and map pin; the district, city and province stay for records. */
/** Shown in place of an account number's other digits, as `maskAccount` does. */
const MASK = "•••• ";

const REDACTED_ADDRESS = { fullName: "", phone: "", line1: "", line2: "", postalCode: "", note: "", latitude: null, longitude: null };

/**
 * Deletes the account in one transaction, then refreshes the catalogue pages it showed on.
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
    if (user.deletedAt) return { publicKeys: [], privateKeys: [], sellerId: undefined, listingIds: [], reviewedSellerIds: [] };
    if (user.role === "ADMIN") throw new DomainError("adminAccount");
    const sellerId = user.sellerProfile?.id;

    // 1. Stop new activity: listings come down (waits for any checkout holding
    //    a listing row), and every session ends.
    const listings = sellerId ? await tx.listing.findMany({ where: { sellerId, status: { not: "RESERVED" } }, select: { id: true } }) : [];
    if (sellerId) await tx.listing.updateMany({ where: { sellerId, status: { not: "RESERVED" } }, data: { status: "REMOVED" } });
    await tx.session.deleteMany({ where: { userId } });

    // 2. Nothing may still be in progress.
    const open = await openOrderCounts(tx, userId, sellerId);
    if (open.purchases > 0 || open.sales > 0 || open.refunds > 0) throw new DomainError("accountBusy");
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
    // Refunds sent to their bank keep the bank, the last 4 digits and ReGear's
    // transfer reference (to match the transfer later), not the holder's name.
    await tx.$executeRaw`
      UPDATE "Order" SET "refundAccountName" = '', "refundAccountNumber" = ${MASK} || right("refundAccountNumber", 4)
      WHERE "buyerId" = ${userId} AND "refundAccountNumber" IS NOT NULL`;

    // 6. Everything else personal.
    await tx.favorite.deleteMany({ where: { userId } });
    // Offers that became orders stay linked to them, without the buyer's message.
    await tx.offer.deleteMany({ where: { buyerId: userId, status: { not: "USED" } } });
    await tx.offer.updateMany({ where: { buyerId: userId }, data: { message: "" } });
    await tx.cartItem.deleteMany({ where: { userId } });
    await tx.savedSearch.deleteMany({ where: { userId } });
    // Their own conversations as a buyer go; in sellers' threads with others, what they wrote is blanked.
    await tx.conversation.deleteMany({ where: { buyerId: userId } });
    await tx.message.updateMany({ where: { senderId: userId }, data: { body: "" } });
    await tx.address.deleteMany({ where: { userId } });
    await tx.emailToken.deleteMany({ where: { userId } });
    await tx.emailOutbox.deleteMany({ where: { userId } });
    await tx.oAuthAccount.deleteMany({ where: { userId } });
    if (sellerId) {
      // Past withdrawals likewise keep the bank and the last 4 digits only.
      await tx.$executeRaw`
        UPDATE "Withdrawal" SET "accountName" = '', "accountNumber" = ${MASK} || right("accountNumber", 4)
        WHERE "sellerId" = ${sellerId}`;
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
        mailbox: null,
        name: "",
        passwordHash: null,
        failedLoginCount: 0,
        lockedUntil: null,
        deletedAt: new Date(),
      },
    });

    // Their reviews stay, now as "Deleted user", but the sellers' pages cache the old name.
    const reviewed = await tx.review.findMany({ where: { buyerId: userId }, select: { sellerId: true }, distinct: ["sellerId"] });

    return {
      publicKeys: uploads.map((u) => u.key),
      privateKeys: verifications.map((v) => v.documentKey),
      sellerId,
      listingIds: listings.map((l) => l.id),
      reviewedSellerIds: reviewed.map((r) => r.sellerId),
    };
  });

  // Their listings came down, and their name is cached on the reviews of every seller they reviewed.
  catalogueChanged({
    listings: files.sellerId ? files.listingIds.map((id) => ({ id, sellerId: files.sellerId! })) : [],
    sellers: [...(files.sellerId ? [files.sellerId] : []), ...files.reviewedSellerIds],
  });
  // Files go only after the database commit, so a rollback never loses one.
  await Promise.all([...files.publicKeys.map(deletePublicImage), ...files.privateKeys.map(deletePrivateDocument)]);
}
