import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireTrader } from "@/lib/auth/dal";
import { formatDateTime } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { getInbox, isUnread, sideOf } from "@/lib/messages";
import { EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).messages.metaTitle };
}

/** Every conversation the user is in, as buyer or seller, newest first; unread ones stand out. */
export default async function MessagesPage() {
  const user = await requireTrader("/account/messages");
  const [inbox, dict, locale] = await Promise.all([getInbox(user.id), getDictionary(), getLocale()]);
  const t = dict.messages;

  return (
    <>
      <PageHeader title={t.title} description={t.intro} />
      {inbox.length === 0 ? (
        <EmptyState title={t.empty} description={t.emptyHint} />
      ) : (
        <ul className="card divide-y divide-rule">
          {inbox.map((c) => {
            const side = sideOf(c, user.id)!;
            const unread = isUnread(c, side, user.id);
            const other = side === "buyer" ? t.withSeller(c.seller.displayName) : t.withBuyer(c.buyer.name.split(" ")[0] || dict.common.deletedUser);
            const last = c.messages[0];
            return (
              <li key={c.id}>
                <Link href={`/account/messages/${c.id}`} className={`flex items-center gap-3 p-4 hover:bg-slate-50 ${unread ? "bg-brand-50/60" : ""}`}>
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-plate">
                    {c.listing.images[0] && <Image src={mediaUrl(c.listing.images[0].key)} alt="" fill sizes="56px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex items-center gap-2">
                      {unread && (
                        <span className="size-2 shrink-0 rounded-full bg-brand-600">
                          <span className="sr-only">{t.unread}</span>
                        </span>
                      )}
                      <span className={`truncate ${unread ? "font-bold text-ink" : "font-semibold text-ink"}`}>{c.listing.title}</span>
                    </p>
                    <p className="text-xs text-slate-500">{other}</p>
                    {last && (
                      <p className={`truncate ${unread ? "text-ink" : "text-slate-600"}`}>
                        {last.senderId === user.id && <span className="text-slate-500">{t.you}: </span>}
                        {last.body || t.deleted}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">{formatDateTime(c.lastMessageAt, locale)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
