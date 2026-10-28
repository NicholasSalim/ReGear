import { describe, expect, it } from "vitest";
import type { EventParams, EventType } from "@/i18n/messages";
import { ORDER_EMAIL_RECIPIENTS } from "@/lib/email/notify";
import { orderCopy, renderEmail } from "@/lib/email/templates";

// Sample params that reach every branch of the recipient rules.
const SAMPLES: { [T in EventType]?: EventParams<T>[] } = {
  PAID: [{}],
  CANCELLED: [{ by: "seller" }, { by: "buyer", refunded: true }, { by: "buyer", refunded: false }],
  EXPIRED: [{}],
  SHIPPED: [{ carrier: "JNE", tracking: "X1" }],
  DELIVERED: [{ auto: true, returnDays: 7 }, { auto: false, returnDays: 0 }],
  COMPLETED: [{ by: "buyer" }],
  RETURN_REQUESTED: [{}],
  RETURN_APPROVED: [{}],
  RETURN_REJECTED: [{ note: "Used" }],
  RETURN_SHIPPED: [{ carrier: "JNE", tracking: "X1" }],
  REFUNDED: [{}],
  DISPUTE_OPENED: [{ by: "buyer" }, { by: "seller" }],
  DISPUTE_RESOLVED: [{ outcome: "buyer" }, { outcome: "partial" }, { outcome: "seller" }],
};

describe("order email copy", () => {
  it("exists in both languages for every event and recipient that is emailed", () => {
    for (const [type, pick] of Object.entries(ORDER_EMAIL_RECIPIENTS)) {
      const samples = SAMPLES[type as EventType] ?? [];
      expect(samples.length, type).toBeGreaterThan(0);
      for (const params of samples) {
        for (const role of (pick as (p: unknown) => ("buyer" | "seller")[])(params)) {
          for (const locale of ["id", "en"] as const) {
            expect(orderCopy(locale, type, role), `${type}/${role}/${locale}`).toBeDefined();
            const mail = renderEmail(
              { template: "order-event", params: { orderId: "o1", number: "RG-1", title: "Item", type: type as EventType, role, event: params as Record<string, unknown> } },
              locale,
              "x@test.dev",
              "Pat",
            );
            expect(mail.subject).toContain("RG-1");
            expect(mail.text).not.toMatch(/undefined|\[object Object\]/);
          }
        }
      }
    }
  });

  it("puts the sign-up code in the subject and body, in both languages", () => {
    for (const locale of ["id", "en"] as const) {
      const mail = renderEmail({ template: "signup-code", params: { code: "042917", name: "Pat" } }, locale, "x@test.dev", null);
      expect(mail.subject).toContain("042917");
      expect(mail.text).toContain("\n042917\n");
      expect(mail.html).toContain(">042917</p>");
      const existing = renderEmail({ template: "signup-existing", params: {} }, locale, "x@test.dev", "Pat");
      expect(existing.text).not.toMatch(/\d{6}|undefined/);
    }
  });

  it("escapes names and links in HTML", () => {
    const mail = renderEmail({ template: "reset-password", params: { url: 'http://x/?a="b"&c', name: "<b>Pat</b>" } }, "en", "x@test.dev", "<b>Pat</b>");
    expect(mail.html).toContain("Hi &lt;b&gt;Pat&lt;/b&gt;,");
    expect(mail.html).toContain('href="http://x/?a=&quot;b&quot;&amp;c"');
  });
});
