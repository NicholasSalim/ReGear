"use client";

import Image from "next/image";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { mediaUrl } from "@/lib/media";

type Img = { id: string; key: string; width: number; height: number; alt: string };

export function Gallery({ images, title }: { images: Img[]; title: string }) {
  const [index, setIndex] = useState(0);
  const t = useT();
  const current = images[index];
  if (!current) return <div className="aspect-[4/3] rounded-2xl bg-slate-100" />;

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Image
          src={mediaUrl(current.key)}
          alt={current.alt || title}
          fill
          priority
          sizes="(min-width: 1024px) 640px, 100vw"
          className="object-contain"
        />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label={t.gallery.photos}>
          {images.map((img, i) => (
            <li key={img.id}>
              <button
                type="button"
                onClick={() => setIndex(i)}
                className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 ${i === index ? "border-brand-600" : "border-transparent opacity-80 hover:opacity-100"}`}
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
