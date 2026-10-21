"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setListingStatusAction } from "@/actions/listings";
import { buttonClass } from "@/components/ui";

export function ListingRowActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = status === "DRAFT" || status === "ACTIVE";

  const change = (next: "ACTIVE" | "DRAFT" | "REMOVED", confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const res = await setListingStatusAction(id, next);
      if (res.error) setError(res.error);
    });
  };

  if (!editable) return <span className="text-xs text-slate-500">Locked while an order is in progress</span>;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Link href={`/sell/listings/${id}/edit`} className={buttonClass("secondary", "px-3 py-1.5")}>
          Edit
        </Link>
        {status === "DRAFT" ? (
          <button type="button" disabled={pending} onClick={() => change("ACTIVE")} className={buttonClass("primary", "px-3 py-1.5")}>
            Publish
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => change("DRAFT")} className={buttonClass("secondary", "px-3 py-1.5")}>
            Unpublish
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => change("REMOVED", "Delete this listing? This cannot be undone.")} className={buttonClass("ghost", "px-3 py-1.5 text-rose-600")}>
          Delete
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
