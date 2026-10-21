"use client";

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleFavoriteAction } from "@/actions/listings";
import { useT } from "@/i18n/client";
import { buttonClass } from "@/components/ui";

export function FavoriteButton({ listingId, initial }: { listingId: string; initial: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(initial);
  const [pending, start] = useTransition();
  const t = useT();

  return (
    <button
      type="button"
      className={buttonClass("secondary", "w-full")}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
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
