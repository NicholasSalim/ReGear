"use client";

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/actions/listings";
import { useT } from "@/i18n/client";

/** The buy box's watch button. */
export function FavoriteButton({ listingId, initial }: { listingId: string; initial: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(initial);
  const [pending, start] = useTransition();
  const t = useT();

  return (
    <button
      type="button"
      className="press inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface font-semibold text-brand-700 ring-1 ring-brand-600 hover:bg-brand-50"
      aria-pressed={optimistic}
      onClick={() =>
        !pending &&
        start(async () => {
          setOptimistic(!optimistic);
          await toggleFavoriteAction(listingId);
        })
      }
    >
      <Heart className={`size-4 ${optimistic ? "fill-rose-500 text-rose-500" : ""}`} aria-hidden />
      {optimistic ? t.favorite.saved : t.favorite.save}
    </button>
  );
}
