// Indonesian text for Client Components. Must match client.en.ts.

import type { clientEn } from "./client.en";

export const clientId: typeof clientEn = {
  compare: {
    added: "Ditambahkan ke perbandingan",
    full: (max: number) => `Perbandingan penuh (${max})`,
    compare: "Bandingkan",
    trayAria: "Perbandingan",
    remove: (title: string) => `Hapus ${title} dari perbandingan`,
    mixed: "Kategori campuran",
    clear: "Kosongkan",
    compareCount: (n: number) => `Bandingkan ${n}`,
    removeOne: "Hapus",
  },
  favorite: { saved: "Tersimpan", save: "Simpan" },
  gallery: { photos: "Foto", showPhoto: (i: number, n: number) => `Tampilkan foto ${i} dari ${n}` },
  error: {
    title: "Terjadi kesalahan",
    body: "Silakan coba lagi. Jika masalah berlanjut, hubungi dukungan.",
    reference: (digest: string) => `Referensi: ${digest}`,
    retry: "Coba lagi",
  },
  language: { label: "Bahasa", switchTo: { id: "Ganti ke Bahasa Indonesia", en: "Switch to English" } },
};
