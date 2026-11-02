import type { Metadata } from "next";
import { pick } from "@/i18n/locales";
import { alternatesFor } from "@/i18n/metadata";
import { getDictionary, getLocale } from "@/i18n/server";
import { CHECK_STATUS_INFO, CONDITION_GRADES, GRADE_INFO, type CheckStatus } from "@/lib/constants";
import { GradeBadge } from "@/components/badges";

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return { title: t.how.metaTitle, description: t.how.metaDescription, alternates: alternatesFor("/how-it-works", locale) };
}

export default async function HowItWorksPage() {
  const [locale, t] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="container-page max-w-4xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">{t.how.heading}</h1>
      <p className="mt-3 text-lg text-slate-600">{t.how.intro}</p>

      <section id="grading" className="mt-12 scroll-mt-6">
        <h2 className="text-xl font-bold">{t.how.gradesHeading}</h2>
        <p className="mt-2 text-slate-600">{t.how.gradesIntro}</p>
        <dl className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface">
          {CONDITION_GRADES.map((g) => (
            <div key={g} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-6">
              <dt className="w-32 shrink-0">
                <GradeBadge grade={g} />
              </dt>
              <dd className="text-sm text-slate-700">{pick(GRADE_INFO[g].summary, locale)}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-8 font-semibold">{t.how.ratingsHeading}</h3>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(CHECK_STATUS_INFO) as CheckStatus[]).map((s) => (
            <li key={s} className={`text-sm font-medium ${CHECK_STATUS_INFO[s].tone}`}>
              {pick(CHECK_STATUS_INFO[s].label, locale)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-600">{t.how.scoreNote}</p>
      </section>

      <section id="verification" className="mt-12 scroll-mt-6">
        <h2 className="text-xl font-bold">{t.how.verificationHeading}</h2>
        <p className="mt-2 text-slate-600">{t.how.verificationBody}</p>
      </section>

      <section id="protection" className="mt-12 scroll-mt-6">
        <h2 className="text-xl font-bold">{t.how.protectionHeading}</h2>
        <ol className="mt-4 space-y-3 text-sm text-slate-700">
          {t.how.protectionSteps.map(([lead, rest]) => (
            <li key={lead}>
              <strong>{lead}</strong> {rest}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
