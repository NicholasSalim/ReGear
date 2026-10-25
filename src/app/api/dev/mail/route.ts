import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { DEV_MAIL_DIR } from "@/lib/email/transport";

// Development inbox: emails the app "sent" without SMTP. Not available in production.
// /api/dev/mail lists the latest; /api/dev/mail?id=<file> shows one.

const FILE_RE = /^\d+-[a-z0-9]+\.json$/;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: Request) {
  if (env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const id = new URL(req.url).searchParams.get("id");
  const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

  if (id) {
    if (!FILE_RE.test(id)) return new Response("Not found", { status: 404 });
    try {
      const mail = JSON.parse(await readFile(path.join(DEV_MAIL_DIR, id), "utf8")) as { html: string };
      return new Response(mail.html, { headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  const files = (await readdir(DEV_MAIL_DIR).catch(() => [] as string[])).filter((f) => FILE_RE.test(f)).sort().reverse().slice(0, 50);
  const rows = await Promise.all(
    files.map(async (f) => {
      const mail = JSON.parse(await readFile(path.join(DEV_MAIL_DIR, f), "utf8")) as { to: string; subject: string; date: string };
      return `<tr><td>${escape(new Date(mail.date).toLocaleString("en-GB"))}</td><td>${escape(mail.to)}</td><td><a href="?id=${f}">${escape(mail.subject)}</a></td></tr>`;
    }),
  );
  const body = `<!doctype html><html><head><title>Dev inbox</title></head><body style="font-family:sans-serif;padding:24px">
<h1>Dev inbox</h1><p>Emails written to ${escape(DEV_MAIL_DIR)} because SMTP_URL is not set. Newest first.</p>
<table cellpadding="6" style="border-collapse:collapse"><thead><tr><th align="left">Sent</th><th align="left">To</th><th align="left">Subject</th></tr></thead><tbody>${rows.join("") || '<tr><td colspan="3">No emails yet.</td></tr>'}</tbody></table></body></html>`;
  return new Response(body, { headers });
}
