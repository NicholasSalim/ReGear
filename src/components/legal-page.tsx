import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/client";
import { pick } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { LEGAL_DETAILS, LEGAL_DETAILS_MISSING, LEGAL_EFFECTIVE_DATE, LEGAL_VERSION } from "@/lib/legal";
import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal-documents";
import { RichText } from "@/components/rich-text";

/** Privacy Policy or Terms, in the visitor's language, with the operator's details filled in. */
export async function LegalPage({ document: key }: { document: LegalDocumentKey }) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.legal;
  const doc = LEGAL_DOCUMENTS[key][locale];
  const fill = (text: string) => text.replace(/\{(operator|address|email|court)\}/g, (_, name: keyof typeof LEGAL_DETAILS) => pick(LEGAL_DETAILS[name], locale));

  return (
    <article className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-slate-500">{t.effective(formatDate(LEGAL_EFFECTIVE_DATE, locale), LEGAL_VERSION)}</p>
      {LEGAL_DETAILS_MISSING && (
        <p role="note" className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {t.draft}
        </p>
      )}
      <p className="mt-6 text-slate-700">
        <RichText text={fill(doc.intro)} />
      </p>

      <nav aria-labelledby="legal-contents" className="mt-8 rounded-xl border border-rule bg-surface p-5">
        <h2 id="legal-contents" className="text-sm font-semibold">{t.contents}</h2>
        <ol className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-slate-600 hover:text-brand-700">
                {s.heading}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="mt-10 scroll-mt-28">
          <h2 className="text-xl font-bold">{s.heading}</h2>
          <div className="mt-3 space-y-3 text-slate-700">
            {s.blocks.map((b, i) =>
              typeof b === "string" ? (
                <p key={i}>
                  <RichText text={fill(b)} />
                </p>
              ) : (
                <ul key={i} className="list-disc space-y-1.5 pl-5">
                  {b.list.map((item) => (
                    <li key={item}>
                      <RichText text={fill(item)} />
                    </li>
                  ))}
                </ul>
              ),
            )}
          </div>
        </section>
      ))}

      <p className="mt-12 border-t border-rule pt-6 text-sm">
        <Link href={key === "privacy" ? "/terms" : "/privacy"} className="font-semibold text-brand-700 hover:underline">
          {t.otherDocument[key]}
        </Link>
      </p>
    </article>
  );
}
