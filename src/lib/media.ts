/** Public URL for a stored image key (served by app/media/[...key]/route.ts). */
export function mediaUrl(key: string): string {
  return `/media/${key}`;
}
