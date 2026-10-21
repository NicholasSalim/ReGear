import Image from "next/image";
import { getLocale } from "@/i18n/server";
import Link from "next/link";
import { formatDate, formatMoney } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import type { OrderSnapshot } from "@/lib/data/orders";
import { OrderStatusBadge } from "@/components/badges";

type Row = { id: string; number: string; status: string; totalIdr: number; createdAt: Date; snapshot: OrderSnapshot; counterpart?: string };

export async function OrderList({ orders, basePath }: { orders: Row[]; basePath: string }) {
  const locale = await getLocale();
  return (
    <ul className="card divide-y divide-slate-100">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`${basePath}/${o.id}`} className="flex items-center gap-4 p-4 hover:bg-slate-50">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {o.snapshot.imageKey && <Image src={mediaUrl(o.snapshot.imageKey)} alt="" fill sizes="64px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{o.snapshot.title}</p>
              <p className="text-xs text-slate-500">
                {o.counterpart ? `${o.counterpart}, ` : ""}
                order {o.number}, {formatDate(o.createdAt, locale)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold">{formatMoney(o.totalIdr)}</span>
              <OrderStatusBadge status={o.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
