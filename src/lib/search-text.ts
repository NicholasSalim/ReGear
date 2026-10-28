/**
 * Text for a LIKE / Prisma `contains` search, taken literally: "%" and "_"
 * are LIKE wildcards and Prisma passes them through, so "%" would match every
 * row (and can't use an index). Backslash is Postgres's default LIKE escape.
 */
export function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * The words of a storefront search, lower-cased and escaped. Single letters
 * match nearly everything and can't use the trigram index, so they're dropped;
 * at most six words count.
 */
export function searchWords(q: string) {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, 6)
    .map(escapeLike);
}
