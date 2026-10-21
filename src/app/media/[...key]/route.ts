import { readPublicImage } from "@/lib/storage";

// Serves processed listing photos. Keys are random and content-addressed per
// upload, so responses are immutable and can be cached forever by browsers/CDNs.
export async function GET(_req: Request, ctx: RouteContext<"/media/[...key]">) {
  const { key } = await ctx.params;
  const joined = key.join("/");
  const data = await readPublicImage(joined).catch(() => null);
  if (!data) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
