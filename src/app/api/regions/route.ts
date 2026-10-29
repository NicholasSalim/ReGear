import { NextResponse } from "next/server";
import { listCities, listDistricts, listProvinces } from "@/lib/regions";

// One level of the Indonesian region list for the address form: provinces
// (no parent), the cities of a province (?parent=32) or the districts of a
// city (?parent=32.73). The list only changes with a new government decree,
// so responses are cached for a day.
export async function GET(req: Request) {
  const parent = new URL(req.url).searchParams.get("parent") ?? "";
  let regions;
  if (parent === "") regions = listProvinces();
  else if (/^\d{2}$/.test(parent)) regions = listCities(parent);
  else if (/^\d{2}\.\d{2}$/.test(parent)) regions = listDistricts(parent);
  else return NextResponse.json({ error: "Bad parent" }, { status: 400 });
  return NextResponse.json(regions, { headers: { "Cache-Control": "public, max-age=86400" } });
}
