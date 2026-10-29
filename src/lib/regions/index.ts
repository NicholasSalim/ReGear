import "server-only";
import data from "./wilayah.json";

// Indonesian administrative regions down to district (kecamatan), from
// cahyadsn/wilayah (MIT licence), following Kepmendagri No 300.2.2-2138
// Tahun 2025. Codes are the official ones: "32" (province), "32.73"
// (city/regency), "32.73.02" (district). The data stays on the server; the
// address form asks /api/regions for one list at a time.

export type Region = { code: string; name: string };
type Row = [string, string];

const toRegions = (rows: Row[] | undefined): Region[] => (rows ?? []).map(([code, name]) => ({ code, name }));

const { provinces, cities, districts } = data as unknown as { provinces: Row[]; cities: Record<string, Row[]>; districts: Record<string, Row[]> };

export function listProvinces() {
  return toRegions(provinces);
}

export function listCities(provinceCode: string) {
  return toRegions(cities[provinceCode]);
}

export function listDistricts(cityCode: string) {
  return toRegions(districts[cityCode]);
}

/**
 * The names for a province → city → district choice, or null if the codes
 * don't exist or don't belong together. Names are always taken from here,
 * never from what the browser sent.
 */
export function resolveRegion(provinceCode: string, cityCode: string, districtCode: string) {
  const province = provinces.find(([code]) => code === provinceCode);
  if (!province || !cityCode.startsWith(`${provinceCode}.`)) return null;
  const city = cities[provinceCode]?.find(([code]) => code === cityCode);
  if (!city || !districtCode.startsWith(`${cityCode}.`)) return null;
  const district = districts[cityCode]?.find(([code]) => code === districtCode);
  if (!district) return null;
  return { province: province[1], city: city[1], district: district[1] };
}
