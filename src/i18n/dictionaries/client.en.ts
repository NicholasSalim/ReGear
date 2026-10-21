// English text for Client Components. client.id.ts must match this shape.
// Kept separate and small: both languages ship to the browser.

export const clientEn = {
  compare: {
    added: "Added to compare",
    full: (max: number) => `Compare full (${max})`,
    compare: "Compare",
    trayAria: "Comparison",
    remove: (title: string) => `Remove ${title} from comparison`,
    mixed: "Mixed categories",
    clear: "Clear",
    compareCount: (n: number) => `Compare ${n}`,
    removeOne: "Remove",
  },
  favorite: { saved: "Saved", save: "Save" },
  gallery: { photos: "Photos", showPhoto: (i: number, n: number) => `Show photo ${i} of ${n}` },
  error: {
    title: "Something went wrong",
    body: "Please try again. If the problem persists, contact support.",
    reference: (digest: string) => `Reference: ${digest}`,
    retry: "Try again",
  },
  language: { label: "Language", switchTo: { id: "Ganti ke Bahasa Indonesia", en: "Switch to English" } },
};
