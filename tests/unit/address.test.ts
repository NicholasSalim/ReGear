import { describe, expect, it } from "vitest";
import { listCities, listDistricts, listProvinces, resolveRegion } from "@/lib/regions";
import { addressLines, mapsUrl } from "@/lib/address-format";
import { savedAddressSchema } from "@/lib/validation";

describe("Indonesian regions", () => {
  it("has every province, city and district of the 2025 decree", () => {
    expect(listProvinces()).toHaveLength(38);
    const cities = listProvinces().flatMap((p) => listCities(p.code));
    expect(cities).toHaveLength(514);
    expect(cities.flatMap((c) => listDistricts(c.code))).toHaveLength(7285);
  });

  it("resolves names only for codes that belong together", () => {
    expect(resolveRegion("32", "32.73", "32.73.02")).toEqual({ province: "Jawa Barat", city: "Kota Bandung", district: "Coblong" });
    expect(resolveRegion("31", "32.73", "32.73.02")).toBeNull(); // city from another province
    expect(resolveRegion("32", "32.73", "32.74.01")).toBeNull(); // district from another city
    expect(resolveRegion("32", "32.73", "32.73.99")).toBeNull(); // no such district
  });
});

describe("address form", () => {
  const valid = {
    label: "Rumah",
    recipientName: "Pat Buyer",
    phone: "+62 000 0000 0000",
    provinceCode: "32",
    cityCode: "32.73",
    districtCode: "32.73.02",
    postalCode: "40132",
    street: "Jl. Contoh No. 10, RT 01/RW 02",
    detail: "",
    note: "",
    latitude: "",
    longitude: "",
  };

  it("accepts an address without a pin, and with one inside Indonesia", () => {
    expect(savedAddressSchema.parse(valid)).toMatchObject({ latitude: undefined, longitude: undefined, makeDefault: false });
    expect(savedAddressSchema.parse({ ...valid, latitude: "-6.89", longitude: "107.61", makeDefault: "on" })).toMatchObject({ latitude: -6.89, longitude: 107.61, makeDefault: true });
  });

  it("refuses a pin outside Indonesia, half a pin, or a bad postal code", () => {
    expect(savedAddressSchema.safeParse({ ...valid, latitude: "51.5", longitude: "-0.12" }).success).toBe(false);
    expect(savedAddressSchema.safeParse({ ...valid, latitude: "-6.89" }).success).toBe(false);
    expect(savedAddressSchema.safeParse({ ...valid, postalCode: "4013" }).success).toBe(false);
  });

  it("writes saved addresses and old order snapshots the same way", () => {
    expect(addressLines({ street: "Jl. Contoh 10", detail: "Lantai 3", district: "Coblong", city: "Kota Bandung", province: "Jawa Barat", postalCode: "40132" })).toEqual([
      "Jl. Contoh 10, Lantai 3",
      "Coblong, Kota Bandung",
      "Jawa Barat 40132",
    ]);
    // An order from before the address book: no district, and a free-text country.
    expect(addressLines({ line1: "1 Main St", line2: "", city: "Singapore", region: "", postalCode: "018956", country: "Singapore" })).toEqual(["1 Main St", "Singapore", "018956", "Singapore"]);
    expect(mapsUrl(-6.89, 107.61)).toBe("https://www.google.com/maps/search/?api=1&query=-6.89,107.61");
  });
});
