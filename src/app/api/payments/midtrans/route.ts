import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { syncPayment } from "@/lib/orders/service";
import { id as idSchema } from "@/lib/validation";

// Midtrans payment notifications. Set this URL as the "Payment Notification
// URL" in the Midtrans dashboard: https://<site>/api/payments/midtrans
//
// The notification only tells us which order to look at. Its status isn't
// trusted on its own: syncPayment asks Midtrans's API and checks the amount.
export async function POST(req: Request) {
  if (!env.MIDTRANS_SERVER_KEY) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!verifyMidtransSignature(body, env.MIDTRANS_SERVER_KEY)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Not one of our orders (e.g. the dashboard's "test notification"): acknowledge and move on.
  const orderId = idSchema.safeParse(body.order_id);
  if (!orderId.success) return NextResponse.json({ ok: true });

  try {
    await syncPayment(orderId.data);
  } catch (err) {
    // A 500 makes Midtrans retry; the maintenance job catches up after that.
    console.error("[payments] notification failed", orderId.data, err);
    return NextResponse.json({ error: "Try again" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
