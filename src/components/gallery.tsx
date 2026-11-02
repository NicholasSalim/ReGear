"use client";

import Image from "next/image";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/i18n/client";
import { mediaUrl } from "@/lib/media";

type Img = { id: string; key: string; width: number; height: number; alt: string };

/** The listing's photos: one large, with arrows, and the rest as thumbnails down the side on wide screens. */
export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [index, setIndex] = useState(0);
  const t = useT();
  const current = images[index];
  if (!current) return <div className="aspect-[4/3] rounded-2xl bg-slate-100" />;
  const step = (by: number) => setIndex((i) => (i + by + images.length) % images.length);
  const arrow = "press absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink shadow-md hover:bg-surface";

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[4.5rem_minmax(0,1fr)]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-plate lg:col-start-2">
        <Image
          src={mediaUrl(current.key)}
          alt={current.alt || title}
          fill
          priority
          sizes="(min-width: 1024px) 640px, 100vw"
          className="object-contain"
        />
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} className={`${arrow} left-3`} aria-label={t.gallery.previous}>
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => step(1)} className={`${arrow} right-3`} aria-label={t.gallery.next}>
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <span className="num absolute right-3 bottom-3 rounded-full bg-inverse/80 px-2 py-0.5 text-xs text-white" aria-hidden>
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:row-start-1 lg:flex lg:flex-col" aria-label={t.gallery.photos}>
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`press relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${i === index ? "border-ink" : "border-transparent opacity-80 hover:opacity-100"}`}
                aria-label={t.gallery.showPhoto(i + 1, images.length)}
                aria-current={i === index}
              >
                <Image src={mediaUrl(img.key)} alt="" fill sizes="96px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
