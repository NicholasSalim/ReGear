import { Camera, Cpu, Gamepad2, Headphones, Laptop, Smartphone, Tablet, Watch, type LucideIcon } from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  phones: Smartphone,
  laptops: Laptop,
  tablets: Tablet,
  cameras: Camera,
  "pc-components": Cpu,
  audio: Headphones,
  gaming: Gamepad2,
  smartwatches: Watch,
};

/** A category's line icon: on the sell start page, and in place of a photo when a category has nothing for sale. */
export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = CATEGORY_ICONS[slug] ?? Cpu;
  return <Icon className={className} strokeWidth={1.5} aria-hidden />;
}
