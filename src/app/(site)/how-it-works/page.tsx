import type { Metadata } from "next";
import { CHECK_STATUS_INFO, CONDITION_GRADES, GRADE_INFO, type CheckStatus } from "@/lib/constants";
import { GradeBadge } from "@/components/badges";

export const metadata: Metadata = {
  title: "How it works — grading, verification & buyer protection",
  description:
    "How ReGear grades pre-owned electronics, verifies sellers, protects payments with escrow and handles returns and disputes.",
  alternates: { canonical: "/how-it-works" },
};

export default function HowItWorksPage() {
  return (
    <div className="container-page max-w-4xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">How ReGear works</h1>
      <p className="mt-3 text-lg text-slate-600">
        A marketplace built around transparency: structured reports instead of vague descriptions, verified sellers and
        money held safely until you are happy.
      </p>

      <section id="grading" className="mt-12 scroll-mt-28">
        <h2 className="text-xl font-bold">Condition grades</h2>
        <p className="mt-2 text-slate-600">
          Sellers grade the overall cosmetic condition and complete a category-specific checklist. Grades are validated:
          an item with a failed check can never be listed as Like New or Excellent.
        </p>
        <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {CONDITION_GRADES.map((g) => (
            <div key={g} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-6">
              <dt className="w-32 shrink-0">
                <GradeBadge grade={g} />
              </dt>
              <dd className="text-sm text-slate-700">{GRADE_INFO[g].summary}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-8 font-semibold">Checklist ratings</h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {(Object.keys(CHECK_STATUS_INFO) as CheckStatus[]).map((s) => (
            <li key={s} className={`text-sm ${CHECK_STATUS_INFO[s].tone}`}>
              <strong>{s}</strong> — {CHECK_STATUS_INFO[s].label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          The functional score is the share of applicable checks that pass (minor issues count half). Battery health is
          mandatory for battery-powered devices.
        </p>
      </section>

      <section id="verification" className="mt-12 scroll-mt-28">
        <h2 className="text-xl font-bold">Seller verification</h2>
        <p className="mt-2 text-slate-600">
          Sellers submit a government ID or business registration which our team reviews manually. Documents are stored
          privately, never shown to buyers, and only the last four characters of the document number are retained.
          Unverified sellers are limited to five active listings.
        </p>
      </section>

      <section id="protection" className="mt-12 scroll-mt-28">
        <h2 className="text-xl font-bold">Buyer protection & escrow</h2>
        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          <li><strong>1. Pay securely.</strong> Your payment is held by ReGear, not sent to the seller.</li>
          <li><strong>2. Seller ships</strong> with a tracking number you can follow from your order page.</li>
          <li><strong>3. Inspect the item</strong> against its condition report once delivered.</li>
          <li><strong>4. Accept, return or dispute.</strong> Accepting releases payment. Within the return window you can request a return; if something goes wrong you can open a dispute and a ReGear specialist decides.</li>
          <li><strong>5. Auto-completion.</strong> If you take no action, the order completes automatically two days after the return window closes.</li>
        </ol>
      </section>
    </div>
  );
}
