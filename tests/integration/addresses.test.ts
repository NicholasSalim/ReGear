import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { db } = await import("@/lib/db");
const { deleteAddress, getAddress, listAddresses, saveAddress, setDefaultAddress, shippingSnapshot } = await import("@/lib/addresses");
const { ADDRESS_LIMIT, savedAddressSchema } = await import("@/lib/validation");

const input = (over: Record<string, string> = {}) =>
  savedAddressSchema.parse({
    label: "Rumah",
    recipientName: "Pat Buyer",
    phone: "+62 000 0000 0000",
    provinceCode: "32",
    cityCode: "32.73",
    districtCode: "32.73.02",
    postalCode: "40132",
    street: "Jl. Contoh No. 10",
    detail: "",
    note: "Pagar hitam",
    latitude: "",
    longitude: "",
    ...over,
  });

async function users() {
  await db.address.deleteMany({ where: { user: { email: { endsWith: "@addresses.test" } } } });
  await db.user.deleteMany({ where: { email: { endsWith: "@addresses.test" } } });
  const verified = new Date();
  return {
    pat: await db.user.create({ data: { email: "pat@addresses.test", name: "Pat", emailVerifiedAt: verified } }),
    sam: await db.user.create({ data: { email: "sam@addresses.test", name: "Sam", emailVerifiedAt: verified } }),
  };
}

describe("address book", () => {
  let u: Awaited<ReturnType<typeof users>>;
  beforeEach(async () => {
    u = await users();
  });

  it("makes the first address the default, and moves it when asked", async () => {
    const first = await saveAddress(u.pat.id, input());
    const second = await saveAddress(u.pat.id, input({ label: "Kantor" }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect((await listAddresses(u.pat.id)).map((a) => [a.label, a.isDefault])).toEqual([["Rumah", true], ["Kantor", false]]);

    await saveAddress(u.pat.id, input({ label: "Kos", makeDefault: "on" }));
    expect((await listAddresses(u.pat.id)).filter((a) => a.isDefault).map((a) => a.label)).toEqual(["Kos"]);
    expect(await setDefaultAddress(u.pat.id, first.id)).toBe(true);
    expect((await listAddresses(u.pat.id)).filter((a) => a.isDefault).map((a) => a.id)).toEqual([first.id]);
  });

  it("takes region names from the official list, and refuses codes that don't belong together", async () => {
    const saved = await saveAddress(u.pat.id, input());
    if (!saved.ok) throw new Error("not saved");
    expect(await getAddress(u.pat.id, saved.id)).toMatchObject({ province: "Jawa Barat", city: "Kota Bandung", district: "Coblong" });
    expect(await saveAddress(u.pat.id, input({ cityCode: "31.71", districtCode: "31.71.01" }))).toEqual({ ok: false, reason: "region" });
  });

  it("stops at the limit", async () => {
    for (let i = 0; i < ADDRESS_LIMIT; i++) expect((await saveAddress(u.pat.id, input({ label: `A${i}` }))).ok).toBe(true);
    expect(await saveAddress(u.pat.id, input({ label: "One too many" }))).toEqual({ ok: false, reason: "limit" });
  });

  it("promotes another address when the default is deleted", async () => {
    const first = await saveAddress(u.pat.id, input());
    await saveAddress(u.pat.id, input({ label: "Kantor" }));
    if (!first.ok) throw new Error("not saved");
    expect(await deleteAddress(u.pat.id, first.id)).toBe(true);
    expect((await listAddresses(u.pat.id)).map((a) => [a.label, a.isDefault])).toEqual([["Kantor", true]]);
  });

  it("never reads, changes or deletes someone else's address", async () => {
    const pats = await saveAddress(u.pat.id, input());
    if (!pats.ok) throw new Error("not saved");
    expect(await getAddress(u.sam.id, pats.id)).toBeNull();
    expect(await saveAddress(u.sam.id, input({ label: "Hijacked" }), pats.id)).toEqual({ ok: false, reason: "notFound" });
    expect(await setDefaultAddress(u.sam.id, pats.id)).toBe(false);
    expect(await deleteAddress(u.sam.id, pats.id)).toBe(false);
    expect(await getAddress(u.pat.id, pats.id)).toMatchObject({ label: "Rumah" });
  });

  it("gives orders a copy with the district, courier note and pin", async () => {
    const saved = await saveAddress(u.pat.id, input({ latitude: "-6.8915", longitude: "107.6107" }));
    if (!saved.ok) throw new Error("not saved");
    expect(shippingSnapshot((await getAddress(u.pat.id, saved.id))!)).toEqual({
      fullName: "Pat Buyer",
      phone: "+62 000 0000 0000",
      line1: "Jl. Contoh No. 10",
      line2: "",
      district: "Coblong",
      city: "Kota Bandung",
      region: "Jawa Barat",
      postalCode: "40132",
      country: "Indonesia",
      note: "Pagar hitam",
      latitude: -6.8915,
      longitude: 107.6107,
    });
  });
});
