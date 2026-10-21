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
});
