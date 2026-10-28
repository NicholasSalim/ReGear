import { describe, expect, it } from "vitest";
import { escapeLike, searchWords } from "@/lib/search-text";
import { createWindowLimiter } from "@/lib/security/window-limit";

describe("search text", () => {
  it("takes LIKE wildcards literally", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
    expect(escapeLike("plain words")).toBe("plain words");
  });

  it("drops single letters and keeps at most six words", () => {
    expect(searchWords("iPhone 13 a Pro")).toEqual(["iphone", "13", "pro"]);
    expect(searchWords("a b c")).toEqual([]);
    expect(searchWords("%")).toEqual([]); // one character, dropped before it can match everything
    expect(searchWords("s%y")).toEqual(["s\\%y"]);
    expect(searchWords("one two three four five six seven")).toHaveLength(6);
  });
});

describe("window limiter", () => {
  it("allows the limit per window, then refuses until the window ends", () => {
    const hit = createWindowLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect([hit("ip", t0), hit("ip", t0 + 1), hit("ip", t0 + 2)].every((r) => r.ok)).toBe(true);
    expect(hit("ip", t0 + 10_000)).toEqual({ ok: false, retryAfterSec: 50 });
    expect(hit("other-ip", t0 + 10_000).ok).toBe(true); // counted per visitor
    expect(hit("ip", t0 + 60_000).ok).toBe(true); // a new window
  });

  it("stays bounded when many addresses arrive at once", () => {
    const hit = createWindowLimiter({ limit: 1, windowMs: 60_000, maxKeys: 100 });
    for (let i = 0; i < 1_000; i++) hit(`ip-${i}`, 0);
    // Still answers sensibly after shedding old entries.
    expect(hit("fresh", 0).ok).toBe(true);
  });
});
