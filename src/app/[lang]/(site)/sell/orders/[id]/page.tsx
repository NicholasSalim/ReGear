import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth/dal";
import { getOrderForUser } from "@/lib/data/orders";
import { OrderDetail } from "@/components/order-detail";

export const metadata: Metadata = { title: "Sale details" };

export default async function SellerOrderPage({ params }: PageProps<"/[lang]/sell/orders/[id]">) {
  const { id } = await params;
  const { user } = await requireSeller(`/sell/orders/${id}`);
  const order = await getOrderForUser(id, user);
  if (!order || order.role !== "SELLER") notFound();
  return (
    <>
      <Link href="/sell/orders" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-700">
        All sales
      </Link>
      <OrderDetail order={order} now={new Date()} />
    </>
  );
}
