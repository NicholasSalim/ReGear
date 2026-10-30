import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/format";

describe("dates", () => {
  // 18:30 UTC is already the next day in Jakarta (UTC+7), whatever zone the server is in.
  const late = new Date("2026-10-29T18:30:00Z");

  it("reads in Jakarta time", () => {
    expect(formatDateTime(late, "en")).toContain("30 Oct 2026");
    expect(formatDateTime(late, "en")).toContain("01:30");
    expect(formatDate(late, "en")).toBe("30 Oct 2026");
    expect(formatDate(late, "id")).toContain("30");
  });
});
