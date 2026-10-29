import "server-only";
import { db } from "@/lib/db";
import { resolveRegion } from "@/lib/regions";
import { ADDRESS_LIMIT, type Address, type SavedAddressInput } from "@/lib/validation";
import type { Address as SavedAddress } from "@/generated/prisma/client";

// The buyer's address book. One address is the default (picked first at
// checkout); the first one saved becomes it, and deleting it promotes the
// most recently updated of the rest.

/** What an order keeps of the address it was sent to. The first eight keys are what orders have always stored. */
export type ShippingAddress = Address & {
  district?: string;
  note?: string;
  latitude?: number;
  longitude?: number;
};

export function listAddresses(userId: string) {
  return db.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
}

export function getAddress(userId: string, id: string) {
  return db.address.findFirst({ where: { id, userId } });
}

export type SaveResult = { ok: true; id: string } | { ok: false; reason: "region" | "limit" | "notFound" };

/** Create (no id) or update one of the user's addresses. */
export async function saveAddress(userId: string, input: SavedAddressInput, id?: string): Promise<SaveResult> {
  const region = resolveRegion(input.provinceCode, input.cityCode, input.districtCode);
  if (!region) return { ok: false, reason: "region" };
  const data = {
    label: input.label,
    recipientName: input.recipientName,
    phone: input.phone,
    provinceCode: input.provinceCode,
    province: region.province,
    cityCode: input.cityCode,
    city: region.city,
    districtCode: input.districtCode,
    district: region.district,
    postalCode: input.postalCode,
    street: input.street,
    detail: input.detail,
    note: input.note,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
  };

  return db.$transaction(async (tx) => {
    // Lock the user's row so two saves at once can't pass the limit or both become default.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const count = await tx.address.count({ where: { userId } });
    let addressId: string;
    if (id) {
      const updated = await tx.address.updateMany({ where: { id, userId }, data });
      if (updated.count === 0) return { ok: false, reason: "notFound" } as const;
      addressId = id;
    } else {
      if (count >= ADDRESS_LIMIT) return { ok: false, reason: "limit" } as const;
      addressId = (await tx.address.create({ data: { ...data, userId }, select: { id: true } })).id;
    }
    if (input.makeDefault || count === 0) {
      await tx.address.updateMany({ where: { userId, isDefault: true, id: { not: addressId } }, data: { isDefault: false } });
      await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    }
    return { ok: true, id: addressId } as const;
  });
}

export async function setDefaultAddress(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({ where: { id, userId }, select: { id: true } });
    if (!address) return false;
    await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    await tx.address.update({ where: { id }, data: { isDefault: true } });
    return true;
  });
}

export async function deleteAddress(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({ where: { id, userId }, select: { isDefault: true } });
    if (!address) return false;
    await tx.address.delete({ where: { id } });
    if (address.isDefault) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return true;
  });
}

/** The copy of an address an order keeps. */
export function shippingSnapshot(a: SavedAddress): ShippingAddress {
  return {
    fullName: a.recipientName,
    phone: a.phone,
    line1: a.street,
    line2: a.detail,
    district: a.district,
    city: a.city,
    region: a.province,
    postalCode: a.postalCode,
    country: "Indonesia",
    note: a.note || undefined,
    latitude: a.latitude ?? undefined,
    longitude: a.longitude ?? undefined,
  };
}
