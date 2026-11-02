import "server-only";
import { db } from "@/lib/db";
import { cardSelect } from "@/lib/data/catalog";
import type { CurrentUser } from "@/lib/auth/dal";
import type { ShippingAddress } from "@/lib/addresses";

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
  totalIdr: true,
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
    select: { ...listSelect, platformFeeIdr: true, buyer: { select: { name: true } } },
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

  const address = parse<ShippingAddress>(order.shippingAddress, {} as ShippingAddress);
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
          totalIdr: true,
          platformFeeIdr: true,
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
    select: { listing: { select: cardSelect } },
  });
  return rows.map((r) => r.listing).filter((l) => ["ACTIVE", "RESERVED", "SOLD"].includes(l.status));
}

/** Orders that count as a sale: paid for and not cancelled or refunded. */
const SOLD_STATUSES = ["PAID", "SHIPPED", "DELIVERED", "RETURN_IN_PROGRESS", "DISPUTED", "COMPLETED"];
const DAY_MS = 86_400_000;

export async function getSellerDashboard(sellerId: string, now = new Date()) {
  const [listingCounts, orderCounts, revenue, needsAction, recentSales, watchers] = await Promise.all([
    db.listing.groupBy({ by: ["status"], where: { sellerId }, _count: { _all: true } }),
    db.order.groupBy({ by: ["status"], where: { sellerId }, _count: { _all: true } }),
    db.order.aggregate({ where: { sellerId, status: "COMPLETED" }, _sum: { totalIdr: true, platformFeeIdr: true, refundIdr: true } }),
    db.order.findMany({
      where: {
        sellerId,
        OR: [{ status: "PAID" }, { status: "RETURN_IN_PROGRESS" }, { status: "DISPUTED" }],
      },
      select: { id: true, number: true, status: true, listingSnapshot: true, createdAt: true, returnRequest: { select: { status: true } } },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    db.order.aggregate({
      where: { sellerId, status: { in: SOLD_STATUSES }, paidAt: { gte: new Date(now.getTime() - 30 * DAY_MS) } },
      _sum: { totalIdr: true },
      _count: { _all: true },
    }),
    // How many buyers are watching the shop's listings that are still for sale.
    db.favorite.count({ where: { listing: { sellerId, status: "ACTIVE" } } }),
  ]);
  const count = (rows: { status: string; _count: { _all: number } }[], s: string) => rows.find((r) => r.status === s)?._count._all ?? 0;
  return {
    listings: { active: count(listingCounts, "ACTIVE"), draft: count(listingCounts, "DRAFT"), sold: count(listingCounts, "SOLD"), reserved: count(listingCounts, "RESERVED") },
    orders: {
      toShip: count(orderCounts, "PAID"),
      inTransit: count(orderCounts, "SHIPPED"),
      completed: count(orderCounts, "COMPLETED"),
      returns: count(orderCounts, "RETURN_IN_PROGRESS"),
      disputes: count(orderCounts, "DISPUTED"),
    },
    last30: { count: recentSales._count._all, totalIdr: recentSales._sum.totalIdr ?? 0 },
    watchers,
    earningsIdr: (revenue._sum.totalIdr ?? 0) - (revenue._sum.platformFeeIdr ?? 0) - (revenue._sum.refundIdr ?? 0),
    needsAction: needsAction.map((o) => ({ ...o, snapshot: parse<OrderSnapshot>(o.listingSnapshot, {} as OrderSnapshot) })),
  };
}
