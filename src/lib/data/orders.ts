import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/dal";
import type { Address } from "@/lib/validation";

// Private, per-user reads. Every function takes the authenticated user and
// scopes the query to rows they are allowed to see (no IDOR by id guessing).

export type OrderSnapshot = {
  title: string;
  slug: string;
  conditionGrade: string;
  imageKey: string | null;
  warrantyType: string;
  warrantyMonths: number;
  warrantyTerms: string;
};

function parse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const listSelect = {
  id: true,
  number: true,
  status: true,
  totalCents: true,
  createdAt: true,
  listingSnapshot: true,
  trackingNumber: true,
  carrier: true,
} as const;

export async function getBuyerOrders(userId: string) {
  const rows = await db.order.findMany({
    where: { buyerId: userId },
    select: { ...listSelect, seller: { select: { displayName: true, slug: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ ...r, snapshot: parse<OrderSnapshot>(r.listingSnapshot, {} as OrderSnapshot) }));
}

export async function getSellerOrders(sellerId: string, status?: string) {
  const rows = await db.order.findMany({
    where: { sellerId, ...(status ? { status } : {}) },
    select: { ...listSelect, platformFeeCents: true, buyer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({ ...r, snapshot: parse<OrderSnapshot>(r.listingSnapshot, {} as OrderSnapshot) }));
}

export type OrderRole = "BUYER" | "SELLER" | "ADMIN";

export async function getOrderForUser(orderId: string, user: CurrentUser) {
  if (!/^[a-z0-9]{20,32}$/i.test(orderId)) return null;
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      events: { orderBy: { createdAt: "asc" } },
      returnRequest: true,
      dispute: { select: { id: true, status: true, reason: true, resolution: true } },
      review: true,
      buyer: { select: { id: true, name: true } },
      seller: { select: { id: true, userId: true, displayName: true, slug: true, verificationStatus: true } },
    },
  });
  if (!order) return null;
  const role: OrderRole | null =
    order.buyerId === user.id ? "BUYER" : order.seller.userId === user.id ? "SELLER" : user.role === "ADMIN" ? "ADMIN" : null;
  if (!role) return null;

  const address = parse<Address>(order.shippingAddress, {} as Address);
  return {
    ...order,
    role,
    snapshot: parse<OrderSnapshot>(order.listingSnapshot, {} as OrderSnapshot),
    // Sellers need the shipping address only once the order is paid.
    address: role === "SELLER" && order.status === "PENDING_PAYMENT" ? null : address,
  };
}
export type OrderForUser = NonNullable<Awaited<ReturnType<typeof getOrderForUser>>>;

export async function getDisputeForUser(disputeId: string, user: CurrentUser) {
  if (!/^[a-z0-9]{20,32}$/i.test(disputeId)) return null;
  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      order: {
        select: {
          id: true,
          number: true,
          status: true,
          totalCents: true,
          buyerId: true,
          listingSnapshot: true,
          trackingNumber: true,
          carrier: true,
          seller: { select: { userId: true, displayName: true } },
          buyer: { select: { name: true } },
        },
      },
    },
  });
  if (!dispute) return null;
  const role: OrderRole | null =
    user.role === "ADMIN" ? "ADMIN" : dispute.order.buyerId === user.id ? "BUYER" : dispute.order.seller.userId === user.id ? "SELLER" : null;
  if (!role) return null;
  return { ...dispute, role, snapshot: parse<OrderSnapshot>(dispute.order.listingSnapshot, {} as OrderSnapshot) };
}

export async function getFavorites(userId: string) {
  const rows = await db.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      listing: {
        select: {
          id: true,
          slug: true,
          title: true,
          category: true,
          brand: true,
          priceCents: true,
          originalPriceCents: true,
          conditionGrade: true,
          warrantyType: true,
          warrantyMonths: true,
          location: true,
          status: true,
          images: { select: { key: true, width: true, height: true, alt: true }, orderBy: { position: "asc" }, take: 1 },
          conditionReport: { select: { batteryHealth: true, functionalScore: true, checks: true } },
          seller: { select: { displayName: true, slug: true, verificationStatus: true } },
        },
      },
    },
  });
  return rows.map((r) => r.listing).filter((l) => ["ACTIVE", "RESERVED", "SOLD"].includes(l.status));
}

export async function getSellerDashboard(sellerId: string) {
  const [listingCounts, orderCounts, revenue, needsAction] = await Promise.all([
    db.listing.groupBy({ by: ["status"], where: { sellerId }, _count: { _all: true } }),
    db.order.groupBy({ by: ["status"], where: { sellerId }, _count: { _all: true } }),
    db.order.aggregate({ where: { sellerId, status: "COMPLETED" }, _sum: { totalCents: true, platformFeeCents: true, refundCents: true } }),
    db.order.findMany({
      where: {
        sellerId,
        OR: [{ status: "PAID" }, { status: "RETURN_IN_PROGRESS" }, { status: "DISPUTED" }],
      },
      select: { id: true, number: true, status: true, listingSnapshot: true, createdAt: true, returnRequest: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
  ]);
  const count = (rows: { status: string; _count: { _all: number } }[], s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return {
    listings: { active: count(listingCounts, "ACTIVE"), draft: count(listingCounts, "DRAFT"), sold: count(listingCounts, "SOLD"), reserved: count(listingCounts, "RESERVED") },
    orders: { toShip: count(orderCounts, "PAID"), inTransit: count(orderCounts, "SHIPPED"), completed: count(orderCounts, "COMPLETED") },
    earningsCents: (revenue._sum.totalCents ?? 0) - (revenue._sum.platformFeeCents ?? 0) - (revenue._sum.refundCents ?? 0),
    needsAction: needsAction.map((o) => ({ ...o, snapshot: parse<OrderSnapshot>(o.listingSnapshot, {} as OrderSnapshot) })),
  };
}
