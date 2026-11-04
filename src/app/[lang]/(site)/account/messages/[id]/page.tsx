import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireTrader } from "@/lib/auth/dal";
import { formatDateTime, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { getConversation, sideOf } from "@/lib/messages";
import { markReadAction, replyAction } from "@/actions/buying";
import { MarkRead, MessageForm } from "@/components/message-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).messages.metaTitle, robots: { index: false } };
}

/** One conversation: the listing it's about, the messages, and a reply box. */
export default async function ConversationPage({ params }: PageProps<"/[lang]/account/messages/[id]">) {
  const { id } = await params;
  const user = await requireTrader(`/account/messages/${id}`);
  if (!/^[a-z0-9]{20,32}$/i.test(id)) notFound();
  const [c, dict, locale] = await Promise.all([getConversation(user.id, id), getDictionary(), getLocale()]);
  if (!c) notFound();
  const t = dict.messages;
  const side = sideOf(c, user.id)!;
  const otherName = side === "buyer" ? c.seller.displayName : c.buyer.name.split(" ")[0] || dict.common.deletedUser;

  return (
    <>
      <MarkRead action={markReadAction.bind(null, c.id)} stamp={c.lastMessageAt.toISOString()} />
      <Link href="/account/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> {t.back}
      </Link>

      <div className="card flex items-center gap-3 p-4">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-plate">
          {c.listing.images[0] && <Image src={mediaUrl(c.listing.images[0].key)} alt="" fill sizes="56px" className="object-cover" />}
        </div>
        <div className="min-w-0 text-sm">
          <Link href={`/listings/${c.listing.slug}`} className="font-semibold text-ink hover:underline">
            {c.listing.title}
          </Link>
          <p className="num text-slate-600">{formatMoney(c.listing.priceIdr)}</p>
          <p className="text-xs text-slate-500">{side === "buyer" ? t.withSeller(otherName) : t.withBuyer(otherName)}</p>
        </div>
      </div>

      <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <ShieldAlert className="size-4 shrink-0" aria-hidden /> {t.safety}
      </p>

      <ol className="mt-5 space-y-3" aria-label={t.title}>
        {c.messages.map((m) => {
          const mine = m.senderId === user.id;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[70%] ${mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md border border-rule bg-surface text-ink"}`}>
                <p className="sr-only">{mine ? t.you : otherName}:</p>
                <p className="whitespace-pre-line">{m.body || <em className="opacity-70">{t.deleted}</em>}</p>
                <p className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-slate-500"}`}>{formatDateTime(m.createdAt, locale)}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="card mt-5 p-4">
        <MessageForm action={replyAction.bind(null, c.id)} label={t.label} placeholder={t.placeholder} send={t.send} sending={t.sending} />
      </div>
    </>
  );
}
