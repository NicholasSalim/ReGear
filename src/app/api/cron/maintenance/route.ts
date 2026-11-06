import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runOrderMaintenance } from "@/lib/orders/service";
import { runPayoutMaintenance } from "@/lib/payouts/service";
import { deliverPendingEmails } from "@/lib/email/outbox";
import { runSavedSearchAlerts } from "@/lib/saved-searches";
import { liftExpiredBans } from "@/lib/account/ban";
import { runHousekeeping } from "@/lib/housekeeping";

// Periodic maintenance. Call from a scheduler (cron, systemd timer, platform
// cron) every ~5 minutes:  curl -X POST -H "Authorization: Bearer $CRON_SECRET" .../api/cron/maintenance
function authorized(req: Request) {
  if (!env.CRON_SECRET) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  // Each job runs on its own: one that fails is logged and reported, and the
  // rest still run (a stuck order mustn't hold back everyone's emails).
  const failed: string[] = [];
  async function job<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (err) {
      console.error(`[maintenance] ${name} failed`, err);
      failed.push(name);
      return null;
    }
  }

  const orders = await job("orders", () => runOrderMaintenance(now));
  const withdrawals = await job("payouts", () => runPayoutMaintenance(now));
  // Timed bans that have run out: the account's listings go back on sale.
  const bans = await job("bans", () => liftExpiredBans(now));
  // New listings for saved searches, queued before the send below.
  const searchAlerts = await job("searchAlerts", () => runSavedSearchAlerts(now));
  // Emails: send what's due, including retries.
  const emails = await job("emails", () => deliverPendingEmails(200));
  const housekeeping = await job("housekeeping", () => runHousekeeping(now));

  return NextResponse.json(
    {
      expiredOrders: orders?.expired,
      autoDelivered: orders?.autoDelivered,
      bansLifted: bans?.lifted,
      ...withdrawals,
      searchAlerts,
      emailsSent: emails?.sent,
      housekeeping,
      ...(failed.length ? { failed } : {}),
    },
    // A failed job makes the run fail, so the scheduler's log shows it.
    { status: failed.length ? 500 : 200 },
  );
}
