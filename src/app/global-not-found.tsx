import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Shown for URLs that match no route. It renders outside app/[lang], so it
// can't know the visitor's language: Indonesian first, English below.
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"], display: "swap" });

export const metadata: Metadata = { title: "404 · ReGear", robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <html lang="id" className={`${archivo.variable} h-full`}>
      <body className="flex min-h-full flex-col items-center justify-center px-4 text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-3xl font-bold">Halaman tidak ditemukan</h1>
        <p className="mt-1 text-slate-600" lang="en">
          We couldn&apos;t find that page
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Ke beranda
          </Link>
          <Link href="/en" lang="en" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-rule hover:ring-slate-400">
            Go home
          </Link>
        </div>
      </body>
    </html>
  );
}
