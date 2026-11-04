import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Link } from "@/i18n/client";
import { localePath } from "@/i18n/locales";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireTrader } from "@/lib/auth/dal";
import { formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { findConversation } from "@/lib/messages";
import { startConversationAction } from "@/actions/buying";
import { MessageForm } from "@/components/message-form";
import { EmptyState, PageHeader } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).messages.newTitle, robots: { index: false } };
}

/** "Contact seller": the first message about a listing. An existing conversation about it opens instead. */
export default async function NewMessagePage({ searchParams }: PageProps<"/[lang]/account/messages/new">) {
  const { listing: raw } = await searchParams;
  const listingId = typeof raw === "string" && /^[a-z0-9]{20,32}$/i.test(raw) ? raw : null;
  const user = await requireTrader(listingId ? `/account/messages/new?listing=${listingId}` : "/account/messages");
  if (!listingId) notFound();
  const [dict, locale] = await Promise.all([getDictionary(), getLocale()]);
  const t = dict.messages;

  const existing = await findConversation(user.id, listingId);
  if (existing?.lastSenderId) redirect(localePath(`/account/messages/${existing.id}`, locale));

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      title: true,
      slug: true,
      priceIdr: true,
      status: true,
      images: { select: { key: true }, orderBy: { position: "asc" }, take: 1 },
      seller: { select: { userId: true, displayName: true } },
    },
  });
  if (!listing || !["ACTIVE", "RESERVED", "SOLD"].includes(listing.status)) notFound();
  if (listing.seller.userId === user.id) return <EmptyState title={dict.domain.messageOwnListing} />;

  return (
    <>
      <PageHeader title={t.newTitle} description={t.newIntro} />
      <div className="card flex items-center gap-3 p-4">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-plate">
          {listing.images[0] && <Image src={mediaUrl(listing.images[0].key)} alt="" fill sizes="56px" className="object-cover" />}
        </div>
        <div className="min-w-0 text-sm">
          <Link href={`/listings/${listing.slug}`} className="font-semibold text-ink hover:underline">
            {listing.title}
          </Link>
          <p className="num text-slate-600">{formatMoney(listing.priceIdr)}</p>
          <p className="text-xs text-slate-500">{t.withSeller(listing.seller.displayName)}</p>
        </div>
      </div>
      <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <ShieldAlert className="size-4 shrink-0" aria-hidden /> {t.safety}
      </p>
      <div className="card mt-4 p-4">
        <MessageForm action={startConversationAction.bind(null, listingId)} label={t.label} placeholder={t.placeholder} send={t.send} sending={t.sending} autoFocus />
      </div>
    </>
  );
}
