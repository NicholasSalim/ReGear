import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { localePath, splitLocale } from "@/i18n/locales";
import { proxy } from "@/proxy";

const request = (path: string, cookies: Record<string, string> = {}, method = "GET") =>
  new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
  });

describe("locale paths", () => {
  it("keeps Indonesian at clean URLs and prefixes English", () => {
    expect(localePath("/listings", "id")).toBe("/listings");
    expect(localePath("/listings", "en")).toBe("/en/listings");
    expect(localePath("/", "en")).toBe("/en");
    expect(localePath("https://example.com", "en")).toBe("https://example.com");
    expect(localePath("//evil.example", "en")).toBe("//evil.example");
  });

  it("splits a pathname into language and path", () => {
    expect(splitLocale("/en/listings/x")).toEqual({ locale: "en", path: "/listings/x" });
    expect(splitLocale("/en")).toEqual({ locale: "en", path: "/" });
    expect(splitLocale("/listings")).toEqual({ locale: "id", path: "/listings" });
  });
});

describe("proxy", () => {
  it("rewrites clean URLs to the Indonesian route and remembers it", () => {
    const res = proxy(request("/listings?q=sony"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/id/listings?q=sony");
    expect(res.cookies.get("regear_lang")?.value).toBe("id");
  });

  it("serves /en directly and remembers English", () => {
    const res = proxy(request("/en/listings"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("regear_lang")?.value).toBe("en");
  });

  it("redirects /id/... to the clean URL", () => {
    const res = proxy(request("/id/how-it-works", { regear_lang: "en" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/how-it-works");
    expect(res.cookies.get("regear_lang")?.value).toBe("id");
  });

  it("sends visitors who chose English to /en, but never redirects a POST", () => {
    const res = proxy(request("/listings", { regear_lang: "en" }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/en/listings");
    expect(proxy(request("/listings", { regear_lang: "en" }, "POST")).headers.get("location")).toBeNull();
  });

  it("gates private pages in both languages and keeps the language for sign-in", () => {
    expect(proxy(request("/account")).headers.get("location")).toBe("http://localhost:3000/login?next=%2Faccount");
    expect(proxy(request("/en/sell/listings")).headers.get("location")).toBe("http://localhost:3000/en/login?next=%2Fen%2Fsell%2Flistings");
    expect(proxy(request("/en/account", { regear_session: "x" })).headers.get("location")).toBeNull();
  });

  it("counts searches that only claim to be prefetches", () => {
    const search = (i: number, headers: Record<string, string>) =>
      proxy(new NextRequest(new URL(`/listings?q=probe${i}`, "http://localhost:3000"), { headers }));
    // Anyone can send these headers; only a real static prefetch (rsc + prefetch "1") renders no search.
    const statuses = Array.from({ length: 130 }, (_, i) => search(i, { "next-router-prefetch": "2" }).status);
    expect(statuses).toContain(429);
    expect(search(999, { purpose: "prefetch" }).status).toBe(429);
    expect(search(1000, { rsc: "1", "next-router-prefetch": "1" }).status).not.toBe(429);
  });
});

describe("server messages in the visitor's language", () => {
  it("translates validation messages, including bilingual labels", async () => {
    const { en } = await import("@/i18n/dictionaries/en");
    const { id } = await import("@/i18n/dictionaries/id");
    const { fieldErrors, registerSchema, listingSchema } = await import("@/lib/validation");
    const res = registerSchema.safeParse({ name: "A", email: "nope", password: "short" });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(fieldErrors(res.error, id, "id")).toEqual({
      name: "Minimal 2 karakter",
      email: "Masukkan alamat email yang valid",
      password: "Gunakan minimal 8 karakter",
      acceptTerms: "Setujui Syarat & Ketentuan dan Kebijakan Privasi untuk membuat akun",
    });
    expect(fieldErrors(res.error, en, "en").name).toBe("Must be at least 2 characters");

    const base = {
      title: "iPhone 13 128GB Midnight", category: "phones", brand: "Apple", model: "iPhone 13",
      description: "Well kept phone, used with a case and screen protector since day one.",
      priceIdr: "7.999.000", shippingIdr: "0", location: "Jakarta", conditionGrade: "EXCELLENT", warrantyType: "NONE",
      warrantyMonths: "0", warrantyTerms: "", returnWindowDays: "7", specs: {}, batteryHealth: "88", cosmeticScore: "9",
      checks: [{ key: "screen", status: "PASS" }], includedAccessories: [], knownIssues: "", serialVerified: false,
      originalBox: false, imageIds: ["clx0000000000000000000000"], publish: true,
    };
    const listing = listingSchema.safeParse(base);
    if (listing.success) throw new Error("expected failure");
    expect(fieldErrors(listing.error, id, "id")["specs.storage"]).toBe("Penyimpanan wajib diisi");
    expect(fieldErrors(listing.error, en, "en")["specs.storage"]).toBe("Storage is required");
    const grade = listingSchema.safeParse({ ...base, conditionGrade: "MINT" });
    if (grade.success) throw new Error("expected failure");
    expect(fieldErrors(grade.error, id, "id").conditionGrade).toBe("Pilih salah satu");
  });

  it("keeps domain errors in English for logs but carries a code for the UI", async () => {
    const { DomainError } = await import("@/lib/orders/service");
    const { id } = await import("@/i18n/dictionaries/id");
    const { resolveEntry } = await import("@/i18n/messages");
    const err = new DomainError("unverifiedLimit", 5);
    expect(err.message).toBe("Unverified sellers can have up to 5 active listings. Verify your account to list more.");
    expect(resolveEntry(id.domain[err.code], err.args)).toContain("5 iklan aktif");
  });

  it("words order events from their params, and keeps old events as stored", async () => {
    const { en } = await import("@/i18n/dictionaries/en");
    const { id } = await import("@/i18n/dictionaries/id");
    const { eventText } = await import("@/i18n/messages");
    const shipped = { type: "SHIPPED", message: "Shipped with JNE, tracking number AB123.", params: JSON.stringify({ carrier: "JNE", tracking: "AB123" }) };
    expect(eventText(shipped, id)).toBe("Dikirim dengan JNE, nomor resi AB123.");
    expect(eventText(shipped, en)).toBe(shipped.message);
    expect(eventText({ type: "SHIPPED", message: "Shipped with JNE.", params: null }, id)).toBe("Shipped with JNE.");
    expect(eventText({ type: "CANCELLED", message: "", params: JSON.stringify({ by: "seller", refunded: true }) }, id)).toBe(
      "Pesanan dibatalkan oleh penjual. Pembeli mendapat pengembalian dana penuh.",
    );
  });

  it("rewords ReGear's own dispute notes but leaves people's messages alone", async () => {
    const { id } = await import("@/i18n/dictionaries/id");
    const { disputeMessageText } = await import("@/i18n/messages");
    expect(disputeMessageText({ authorRole: "ADMIN", body: "A ReGear specialist is now reviewing this case." }, id)).toBe(
      "Petugas ReGear sekarang meninjau kasus ini.",
    );
    expect(disputeMessageText({ authorRole: "ADMIN", body: "Resolution: Partial refund for the fan." }, id)).toBe("Keputusan: Partial refund for the fan.");
    expect(disputeMessageText({ authorRole: "BUYER", body: "Resolution: please refund me" }, id)).toBe("Resolution: please refund me");
  });

  it("gives rejected images a code the uploader sees translated", async () => {
    const { InvalidImageError } = await import("@/lib/storage");
    const { id } = await import("@/i18n/dictionaries/id");
    const err = new InvalidImageError("tooSmall");
    expect(err.message).toBe("Images must be at least 200×200 pixels");
    expect(id.uploads.image[err.code]).toBe("Gambar minimal berukuran 200×200 piksel");
  });
});
