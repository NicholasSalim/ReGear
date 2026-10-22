import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { requireUser } from "@/lib/auth/dal";
import { getOrderForUser } from "@/lib/data/orders";
import { OrderDetail } from "@/components/order-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.orderMetaTitle };
}

export default async function BuyerOrderPage({ params }: PageProps<"/[lang]/account/orders/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/account/orders/${id}`);
  const [order, t] = await Promise.all([getOrderForUser(id, user), getDictionary()]);
  if (!order || order.role !== "BUYER") notFound();
  return (
    <>
      <Link href="/account/orders" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-700">
        {t.account.backToPurchases}
      </Link>
      <OrderDetail order={order} now={new Date()} />
    </>
  );
}
