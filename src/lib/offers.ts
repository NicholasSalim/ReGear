import "server-only";
import { isLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import { listingTags } from "@/lib/cache";
import { enqueueEmail } from "@/lib/email/outbox";
import { formatMoney } from "@/lib/format";
import { DomainError } from "@/lib/orders/service";

// Make an offer. A buyer offers less than the asking price; the seller accepts
// or declines; an accepted offer is checked out at its amount (see
// createOrder). Statuses are written when someone acts; time limits are
// checked when an offer is read or used, so nothing has to run on a timer.

/** How long the seller has to answer. */
export const OFFER_ANSWER_HOURS = 48;
/** How long the buyer has to check out once their offer is accepted. */
export const OFFER_CHECKOUT_HOURS = 24;
/** Offers below this share of the asking price are refused outright. */
export const OFFER_MIN_SHARE = 0.5;
/** Offers one buyer can make on one listing, in all. */
export const MAX_OFFERS_PER_LISTING = 3;

const HOUR_MS = 3_600_000;
const localeOf = (value: string) => (isLocale(value) ? value : "id");

export type OfferStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN" | "USED" | "EXPIRED";

/** The status to show and act on: a pending or accepted offer past its time limit has expired. */
export function offerStatus(offer: { status: string; expiresAt: Date }, now = new Date()): OfferStatus {
  if ((offer.status === "PENDING" || offer.status === "ACCEPTED") && offer.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return offer.status as OfferStatus;
}

/** The lowest offer a listing accepts, in whole rupiah. */
export function minimumOffer(priceIdr: number) {
  return Math.ceil(priceIdr * OFFER_MIN_SHARE);
}

export async function makeOffer(buyerId: string, listingId: string, amountIdr: number, message: string) {
  return db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: { id: true, sellerId: true, title: true, priceIdr: true, status: true, acceptsOffers: true, seller: { select: { userId: true, user: { select: { locale: true } } } } },
    });
    if (!listing || listing.status !== "ACTIVE") throw new DomainError("itemUnavailable");
    if (listing.seller.userId === buyerId) throw new DomainError("ownListing");
    if (!listing.acceptsOffers) throw new DomainError("offersOff");
    if (amountIdr >= listing.priceIdr) throw new DomainError("offerTooHigh");
    const min = minimumOffer(listing.priceIdr);
    if (amountIdr < min) throw new DomainError("offerTooLow", formatMoney(min));

    const now = new Date();
    const earlier = await tx.offer.findMany({ where: { listingId, buyerId }, select: { status: true, expiresAt: true } });
    if (earlier.some((o) => offerStatus(o, now) === "PENDING" || offerStatus(o, now) === "ACCEPTED")) throw new DomainError("offerPending");
    if (earlier.length >= MAX_OFFERS_PER_LISTING) throw new DomainError("offerLimit", MAX_OFFERS_PER_LISTING);

    const offer = await tx.offer.create({
      data: { listingId, buyerId, amountIdr, message: message.slice(0, 300), expiresAt: new Date(now.getTime() + OFFER_ANSWER_HOURS * HOUR_MS) },
    });
    await enqueueEmail(
      tx,
      { userId: listing.seller.userId, locale: localeOf(listing.seller.user.locale) },
      { template: "offer-received", params: { title: listing.title, amountIdr, hours: OFFER_ANSWER_HOURS } },
    );
    return { offerId: offer.id, tags: [...listingTags(listing), `offers-${buyerId}`] };
  });
}

export async function withdrawOffer(buyerId: string, offerId: string) {
  const offer = await db.offer.findUnique({ where: { id: offerId }, select: { buyerId: true, status: true, expiresAt: true, listing: { select: { id: true, sellerId: true } } } });
  if (!offer || offer.buyerId !== buyerId) throw new DomainError("offerNotFound");
  if (offerStatus(offer) !== "PENDING") throw new DomainError("offerClosed");
  // Only a still-pending offer can be withdrawn; the seller may be answering it right now.
  const res = await db.offer.updateMany({ where: { id: offerId, status: "PENDING" }, data: { status: "WITHDRAWN" } });
  if (res.count !== 1) throw new DomainError("offerClosed");
  return { tags: [...listingTags(offer.listing), `offers-${buyerId}`] };
}

/** The seller's answer. Accepting gives the buyer OFFER_CHECKOUT_HOURS to check out at the offer's price. */
export async function answerOffer(sellerUserId: string, offerId: string, accept: boolean) {
  return db.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({
      where: { id: offerId },
      select: {
        id: true,
        buyerId: true,
        amountIdr: true,
        status: true,
        expiresAt: true,
        buyer: { select: { locale: true } },
        listing: { select: { id: true, slug: true, title: true, status: true, sellerId: true, seller: { select: { userId: true } } } },
      },
    });
    if (!offer || offer.listing.seller.userId !== sellerUserId) throw new DomainError("offerNotFound");
    if (offerStatus(offer) !== "PENDING") throw new DomainError("offerClosed");
    if (accept && offer.listing.status !== "ACTIVE") throw new DomainError("itemUnavailable");

    const now = new Date();
    const res = await tx.offer.updateMany({
      where: { id: offerId, status: "PENDING" },
      data: accept
        ? { status: "ACCEPTED", respondedAt: now, expiresAt: new Date(now.getTime() + OFFER_CHECKOUT_HOURS * HOUR_MS) }
        : { status: "DECLINED", respondedAt: now },
    });
    if (res.count !== 1) throw new DomainError("offerClosed");

    await enqueueEmail(
      tx,
      { userId: offer.buyerId, locale: localeOf(offer.buyer.locale) },
      {
        template: "offer-answered",
        params: { offerId, listingId: offer.listing.id, slug: offer.listing.slug, title: offer.listing.title, amountIdr: offer.amountIdr, accepted: accept, hours: OFFER_CHECKOUT_HOURS },
      },
    );
    return { tags: [...listingTags(offer.listing), `offers-${offer.buyerId}`] };
  });
}

/** A buyer's offers on one listing, newest first, for the item page. */
export async function getMyOffersForListing(buyerId: string, listingId: string) {
  return db.offer.findMany({
    where: { buyerId, listingId },
    select: { id: true, amountIdr: true, status: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/** Everything a buyer has offered, newest first, for My ReGear. */
export async function getBuyerOffers(buyerId: string) {
  return db.offer.findMany({
    where: { buyerId },
    select: {
      id: true,
      amountIdr: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      listing: { select: { id: true, slug: true, title: true, priceIdr: true, status: true, images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/** Offers on a seller's listings, newest first, for Seller Hub. Buyers show by first name only. */
export async function getSellerOffers(sellerId: string) {
  const rows = await db.offer.findMany({
    where: { listing: { sellerId } },
    select: {
      id: true,
      amountIdr: true,
      message: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      buyer: { select: { name: true } },
      listing: { select: { id: true, slug: true, title: true, priceIdr: true, status: true, images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ ...r, buyer: { name: r.buyer.name.split(" ")[0] } }));
}

/** Offers still waiting for this seller's answer. */
export async function countPendingOffers(sellerId: string, now = new Date()) {
  return db.offer.count({ where: { listing: { sellerId }, status: "PENDING", expiresAt: { gt: now } } });
}
