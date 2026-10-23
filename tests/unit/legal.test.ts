import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS } from "@/lib/legal-documents";

const docs = Object.entries(LEGAL_DOCUMENTS);
const text = (doc: (typeof LEGAL_DOCUMENTS)["privacy"]["id"]) =>
  [doc.intro, ...doc.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => (typeof b === "string" ? [b] : b.list))])].join("\n");

describe("legal documents", () => {
  it.each(docs)("%s has the same sections in both languages", (_, byLocale) => {
    expect(byLocale.en.sections.map((s) => s.id)).toEqual(byLocale.id.sections.map((s) => s.id));
    for (const locale of ["en", "id"] as const) {
      const doc = byLocale[locale];
      expect(doc.sections.every((s) => s.blocks.length > 0)).toBe(true);
    }
  });

  it.each(docs)("%s only uses known placeholders and links to pages that exist", (_, byLocale) => {
    for (const locale of ["en", "id"] as const) {
      const all = text(byLocale[locale]);
      for (const [, name] of all.matchAll(/\{(\w+)\}/g)) expect(["operator", "address", "email", "court"]).toContain(name);
      for (const [, href] of all.matchAll(/\]\(([^)]+)\)/g)) {
        const [route, anchor] = href.split("#");
        expect(existsSync(path.join("src/app/[lang]/(site)", route, "page.tsx")), href).toBe(true);
        if (anchor) {
          const target = route === "/privacy" ? LEGAL_DOCUMENTS.privacy : LEGAL_DOCUMENTS.terms;
          expect(target[locale].sections.map((s) => s.id), href).toContain(anchor);
        }
      }
    }
  });
});
