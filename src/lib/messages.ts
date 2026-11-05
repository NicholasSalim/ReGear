import "server-only";
import { isLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { enqueueEmail } from "@/lib/email/outbox";
import { DomainError } from "@/lib/errors";

// Buyer–seller messages, one conversation per buyer and listing. Only the two
// people in a conversation can read or write in it. An email goes out when a
// conversation turns unread for its recipient, not for every message, so a
// quick back-and-forth doesn't flood their inbox.

export const MESSAGE_MAX = 2000;
const localeOf = (value: string) => (isLocale(value) ? value : "id");

type Side = "buyer" | "seller";
type ConversationAccess = { buyerId: string; seller: { userId: string } };

/** Which side of the conversation this user is on, or null when it isn't theirs. */
export function sideOf(c: ConversationAccess, userId: string): Side | null {
  if (c.buyerId === userId) return "buyer";
  if (c.seller.userId === userId) return "seller";
  return null;
}

/** Whether a conversation has messages this side hasn't seen. */
export function isUnread(c: { lastSenderId: string | null; lastMessageAt: Date; buyerReadAt: Date | null; sellerReadAt: Date | null }, side: Side, userId: string) {
  if (!c.lastSenderId || c.lastSenderId === userId) return false;
  const readAt = side === "buyer" ? c.buyerReadAt : c.sellerReadAt;
  return !readAt || readAt < c.lastMessageAt;
}

async function append(conversationId: string, senderId: string, body: string, side: Side) {
  return db.$transaction(async (tx) => {
    const before = await tx.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: {
        lastSenderId: true,
        lastMessageAt: true,
        buyerReadAt: true,
        sellerReadAt: true,
        buyerId: true,
        buyer: { select: { locale: true } },
        listing: { select: { title: true } },
        seller: { select: { userId: true, user: { select: { locale: true } } } },
      },
    });
    const now = new Date();
    await tx.message.create({ data: { conversationId, senderId, body } });
    await tx.conversation.update({
      where: { id: conversationId },
      // Writing counts as having read everything so far.
      data: { lastMessageAt: now, lastSenderId: senderId, ...(side === "buyer" ? { buyerReadAt: now } : { sellerReadAt: now }) },
    });

    const other: Side = side === "buyer" ? "seller" : "buyer";
    const otherId = other === "buyer" ? before.buyerId : before.seller.userId;
    // Email only when this message turns the thread unread for them.
    if (!isUnread(before, other, otherId)) {
      await enqueueEmail(
        tx,
        { userId: otherId, locale: localeOf(other === "buyer" ? before.buyer.locale : before.seller.user.locale) },
        { template: "message-received", params: { conversationId, title: before.listing.title, from: side } },
      );
    }
  });
}

/** The buyer's first message about a listing; reuses their conversation about it if there is one. */
export async function startConversation(buyerId: string, listingId: string, body: string) {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { status: true, sellerId: true, seller: { select: { userId: true } } } });
  if (!listing || !["ACTIVE", "RESERVED", "SOLD"].includes(listing.status)) throw new DomainError("itemUnavailable");
  if (listing.seller.userId === buyerId) throw new DomainError("messageOwnListing");
  const conversation = await db.conversation.upsert({
    where: { listingId_buyerId: { listingId, buyerId } },
    create: { listingId, buyerId, sellerId: listing.sellerId, lastSenderId: null },
    update: {},
    select: { id: true },
  });
  await append(conversation.id, buyerId, body, "buyer");
  return { conversationId: conversation.id };
}

export async function reply(userId: string, conversationId: string, body: string) {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, select: { buyerId: true, seller: { select: { userId: true } } } });
  const side = c && sideOf(c, userId);
  if (!side) throw new DomainError("conversationNotFound");
  await append(conversationId, userId, body, side);
}

export async function markRead(userId: string, conversationId: string) {
  const c = await db.conversation.findUnique({ where: { id: conversationId }, select: { buyerId: true, seller: { select: { userId: true } } } });
  const side = c && sideOf(c, userId);
  if (!side) return;
  await db.conversation.update({ where: { id: conversationId }, data: side === "buyer" ? { buyerReadAt: new Date() } : { sellerReadAt: new Date() } });
}

const listSelect = {
  id: true,
  buyerId: true,
  lastMessageAt: true,
  lastSenderId: true,
  buyerReadAt: true,
  sellerReadAt: true,
  buyer: { select: { name: true } },
  seller: { select: { userId: true, displayName: true } },
  listing: { select: { slug: true, title: true, images: { select: { key: true }, orderBy: { position: "asc" as const }, take: 1 } } },
  messages: { select: { body: true, senderId: true }, orderBy: { createdAt: "desc" as const }, take: 1 },
};

/** Every conversation this user is in, as buyer or as seller, most recent first. */
export async function getInbox(userId: string) {
  return db.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { seller: { userId } }], lastSenderId: { not: null } },
    select: listSelect,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
}

/** One conversation with its messages, or null when it isn't this user's. */
export async function getConversation(userId: string, conversationId: string) {
  const c = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      ...listSelect,
      listing: { select: { id: true, slug: true, title: true, priceIdr: true, status: true, images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 } } },
      seller: { select: { userId: true, displayName: true, slug: true } },
      messages: { select: { id: true, body: true, senderId: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 500 },
    },
  });
  if (!c || !sideOf(c, userId)) return null;
  return c;
}

/** The buyer's existing conversation about a listing, if any. */
export async function findConversation(buyerId: string, listingId: string) {
  return db.conversation.findUnique({ where: { listingId_buyerId: { listingId, buyerId } }, select: { id: true, lastSenderId: true } });
}

export async function unreadCount(userId: string) {
  const rows = await db.conversation.findMany({
    // Threads whose last message came from the other side (a null sender means no messages yet).
    where: { OR: [{ buyerId: userId }, { seller: { userId } }], lastSenderId: { not: userId } },
    select: { buyerId: true, lastSenderId: true, lastMessageAt: true, buyerReadAt: true, sellerReadAt: true, seller: { select: { userId: true } } },
    take: 200,
  });
  return rows.filter((c) => {
    const side = sideOf(c, userId);
    return side !== null && isUnread(c, side, userId);
  }).length;
}
