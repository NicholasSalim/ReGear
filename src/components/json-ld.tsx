// Structured data for search engines. JSON is serialised with "<" escaped so
// user-controlled strings (titles, descriptions) can never close the script tag.
const LINE_SEP = new RegExp("\\u2028", "g");
const PARA_SEP = new RegExp("\\u2029", "g");

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(LINE_SEP, "\\u2028").replace(PARA_SEP, "\\u2029");
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
