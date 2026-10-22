import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/dal";
import { getOrderForUser } from "@/lib/data/orders";
import { OrderDetail } from "@/components/order-detail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).sell.saleMetaTitle };
}

export default async function SellerOrderPage({ params }: PageProps<"/[lang]/sell/orders/[id]">) {
  const { id } = await params;
  const { user } = await requireSeller(`/sell/orders/${id}`);
  const order = await getOrderForUser(id, user);
  if (!order || order.role !== "SELLER") notFound();
  const t = (await getDictionary()).sell;
  return (
    <>
      <Link href="/sell/orders" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-700">
        {t.allSales}
      </Link>
      <OrderDetail order={order} now={new Date()} />
    </>
  );
}
