import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isLocale, localePath, DEFAULT_LOCALE } from "@/i18n/locales";
import { syncPayment } from "@/lib/orders/service";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { id as idSchema } from "@/lib/validation";

// Where the payment page sends the buyer back. Checks the payment with the
// provider (so the order shows as paid even if the webhook hasn't arrived,
// or can't reach this server at all) and then shows the order.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const lang = params.get("lang");
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;
  const orderId = idSchema.safeParse(params.get("order"));
  const target = orderId.success ? `/account/orders/${orderId.data}` : "/account/orders";

  // Anyone can open this URL, but all it does is ask the provider about the order.
  if (orderId.success && (await rateLimit(`pay-return:${await getClientIp()}`, 60, 3600)).ok) {
    try {
      await syncPayment(orderId.data);
    } catch (err) {
      console.error("[payments] return sync failed", orderId.data, err);
    }
  }
  return NextResponse.redirect(new URL(localePath(target, locale), env.NEXT_PUBLIC_SITE_URL), 303);
}
