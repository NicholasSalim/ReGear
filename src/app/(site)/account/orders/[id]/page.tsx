import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getOrderForUser } from "@/lib/data/orders";
import { OrderDetail } from "@/components/order-detail";

export const metadata: Metadata = { title: "Order details" };

export default async function BuyerOrderPage({ params }: PageProps<"/account/orders/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/account/orders/${id}`);
  const order = await getOrderForUser(id, user);
  if (!order || order.role !== "BUYER") notFound();
  return (
    <>
      <Link href="/account/orders" className="mb-4 inline-block text-sm text-slate-500 hover:text-brand-700">
        All purchases
      </Link>
      <OrderDetail order={order} now={new Date()} />
    </>
  );
}
