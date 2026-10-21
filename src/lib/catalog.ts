// Category catalogue: each category defines the structured specification
// fields sellers must fill in and the condition checklist an item is graded on.
// Keeping this in code gives us type-safety and zero DB round-trips.
// A check can apply only to some devices in a category (a lens has no shutter,
// a wired DAC has no pairing); `when` decides that from the listing's specs.
// Display text is bilingual (see src/i18n/locales.ts); keys, slugs and option
// values are stored in listings and never change with the language.

import { pick, type Locale, type Localized } from "@/i18n/locales";

export type Specs = Readonly<Record<string, string | number | boolean | undefined>>;

export type SpecField = {
  key: string;
  label: Localized;
  type: "text" | "number" | "select" | "boolean";
  unit?: string;
  /** Stored values. */
  options?: readonly string[];
  /** Display text for options whose wording differs by language. */
  optionLabels?: Readonly<Record<string, Localized>>;
  required?: boolean;
  placeholder?: Localized;
};

export type ConditionCheck = { key: string; label: Localized; hint?: Localized; when?: (s: Specs) => boolean };

export type Category = {
  slug: string;
  name: Localized;
  singular: Localized;
  description: Localized;
  hasBattery: boolean | ((s: Specs) => boolean);
  specFields: readonly SpecField[];
  checks: readonly ConditionCheck[];
};

const L = (en: string, id: string): Localized => ({ en, id });

const COMMON_COSMETIC: ConditionCheck[] = [
  { key: "body", label: L("Body / housing", "Bodi / casing"), hint: L("Dents, cracks, scratches", "Penyok, retak, goresan") },
];

const OTHER = { Other: L("Other", "Lainnya") };

const isType =
  (field: string, ...values: string[]) =>
  (s: Specs) =>
    values.includes(String(s[field] ?? ""));
const isNotType =
  (field: string, ...values: string[]) =>
  (s: Specs) =>
    s[field] !== undefined && s[field] !== "" && !values.includes(String(s[field]));
const hasFeature = (field: string) => (s: Specs) => s[field] === true;

export const CATEGORIES: readonly Category[] = [
  {
    slug: "phones",
    name: L("Phones", "Ponsel"),
    singular: L("Phone", "Ponsel"),
    description: L(
      "Pre-owned smartphones with verified battery health, IMEI checks and full functional reports.",
      "Ponsel bekas dengan kesehatan baterai terverifikasi, pengecekan IMEI, dan laporan fungsi lengkap.",
    ),
    hasBattery: true,
    specFields: [
      { key: "storage", label: L("Storage", "Penyimpanan"), type: "number", unit: "GB", required: true },
      { key: "ram", label: L("RAM", "RAM"), type: "number", unit: "GB" },
      { key: "chipset", label: L("Chipset", "Chipset"), type: "text", placeholder: L("e.g. A16 Bionic", "mis. A16 Bionic") },
      { key: "screenSize", label: L("Screen size", "Ukuran layar"), type: "number", unit: "in" },
      { key: "color", label: L("Color", "Warna"), type: "text" },
      { key: "network", label: L("Network", "Jaringan"), type: "select", options: ["4G", "5G"] },
      {
        key: "simLock",
        label: L("Carrier lock", "Kunci operator"),
        type: "select",
        options: ["Unlocked", "Locked"],
        optionLabels: { Unlocked: L("Unlocked", "Tidak terkunci"), Locked: L("Locked", "Terkunci") },
        required: true,
      },
      { key: "dualSim", label: L("Dual SIM", "Dual SIM"), type: "boolean" },
    ],
    checks: [
      { key: "screen", label: L("Display", "Layar"), hint: L("Dead pixels, burn-in, touch response", "Piksel mati, burn-in, respons sentuh") },
      ...COMMON_COSMETIC,
      { key: "backGlass", label: L("Back glass", "Kaca belakang") },
      { key: "cameras", label: L("Cameras (front & rear)", "Kamera (depan & belakang)") },
      { key: "biometrics", label: L("Face ID / fingerprint", "Face ID / sidik jari") },
      { key: "audio", label: L("Speakers & microphone", "Speaker & mikrofon") },
      { key: "charging", label: L("Charging port & wireless charging", "Port pengisian & pengisian nirkabel") },
      { key: "buttons", label: L("Buttons & switches", "Tombol & sakelar") },
      { key: "connectivity", label: L("Cellular, Wi-Fi & Bluetooth", "Seluler, Wi-Fi & Bluetooth") },
    ],
  },
  {
    slug: "laptops",
    name: L("Laptops", "Laptop"),
    singular: L("Laptop", "Laptop"),
    description: L(
      "Second-hand laptops with tested keyboards, displays, battery cycles and full component specs.",
      "Laptop bekas dengan keyboard, layar, dan siklus baterai yang sudah diuji, plus spesifikasi komponen lengkap.",
    ),
    hasBattery: true,
    specFields: [
      { key: "cpu", label: L("Processor", "Prosesor"), type: "text", required: true, placeholder: L("e.g. Apple M2 / Intel i7-1260P", "mis. Apple M2 / Intel i7-1260P") },
      { key: "gpu", label: L("Graphics", "Grafis"), type: "text" },
      { key: "ram", label: L("RAM", "RAM"), type: "number", unit: "GB", required: true },
      { key: "storage", label: L("Storage", "Penyimpanan"), type: "number", unit: "GB", required: true },
      { key: "storageType", label: L("Storage type", "Jenis penyimpanan"), type: "select", options: ["NVMe SSD", "SATA SSD", "HDD", "eMMC"] },
      { key: "screenSize", label: L("Screen size", "Ukuran layar"), type: "number", unit: "in" },
      { key: "resolution", label: L("Resolution", "Resolusi"), type: "text", placeholder: L("e.g. 2560×1600", "mis. 2560×1600") },
      { key: "os", label: L("Operating system", "Sistem operasi"), type: "text" },
      { key: "year", label: L("Release year", "Tahun rilis"), type: "number" },
      { key: "batteryCycles", label: L("Battery cycles", "Siklus baterai"), type: "number" },
    ],
    checks: [
      { key: "display", label: L("Display", "Layar"), hint: L("Dead pixels, backlight bleed, delamination", "Piksel mati, kebocoran cahaya latar, delaminasi") },
      { key: "keyboard", label: L("Keyboard", "Keyboard") },
      { key: "trackpad", label: L("Trackpad", "Trackpad") },
      { key: "ports", label: L("Ports", "Port") },
      { key: "hinge", label: L("Hinge", "Engsel") },
      { key: "webcam", label: L("Webcam & microphone", "Webcam & mikrofon") },
      { key: "speakers", label: L("Speakers", "Speaker") },
      ...COMMON_COSMETIC,
      { key: "charger", label: L("Charger", "Pengisi daya") },
      { key: "thermals", label: L("Thermals under load", "Suhu saat beban berat") },
    ],
  },
  {
    slug: "tablets",
    name: L("Tablets", "Tablet"),
    singular: L("Tablet", "Tablet"),
    description: L(
      "Used tablets and e-readers, graded with battery health and display checks.",
      "Tablet dan e-reader bekas, dinilai lewat kesehatan baterai dan pengecekan layar.",
    ),
    hasBattery: true,
    specFields: [
      { key: "type", label: L("Type", "Jenis"), type: "select", options: ["Tablet", "E-reader"], required: true },
      { key: "storage", label: L("Storage", "Penyimpanan"), type: "number", unit: "GB", required: true },
      { key: "screenSize", label: L("Screen size", "Ukuran layar"), type: "number", unit: "in" },
      { key: "chipset", label: L("Chipset", "Chipset"), type: "text" },
      { key: "connectivity", label: L("Connectivity", "Konektivitas"), type: "select", options: ["Wi-Fi", "Wi-Fi + Cellular"], optionLabels: { "Wi-Fi + Cellular": L("Wi-Fi + Cellular", "Wi-Fi + Seluler") } },
      { key: "color", label: L("Color", "Warna"), type: "text" },
      { key: "stylusSupport", label: L("Stylus support", "Dukungan stylus"), type: "boolean" },
    ],
    checks: [
      { key: "screen", label: L("Display & touch", "Layar & sentuh") },
      ...COMMON_COSMETIC,
      { key: "cameras", label: L("Cameras", "Kamera"), when: isType("type", "Tablet") },
      { key: "audio", label: L("Speakers & microphone", "Speaker & mikrofon"), when: isType("type", "Tablet") },
      { key: "charging", label: L("Charging port", "Port pengisian") },
      { key: "buttons", label: L("Buttons", "Tombol") },
      { key: "connectivity", label: L("Wi-Fi & Bluetooth", "Wi-Fi & Bluetooth") },
      { key: "cellular", label: L("Cellular", "Seluler"), when: isType("connectivity", "Wi-Fi + Cellular") },
    ],
  },
  {
    slug: "cameras",
    name: L("Cameras & Lenses", "Kamera & Lensa"),
    singular: L("Camera", "Kamera"),
    description: L(
      "Pre-owned cameras and lenses with shutter counts, sensor inspection and optics checks.",
      "Kamera dan lensa bekas dengan jumlah shutter, pemeriksaan sensor, dan pengecekan optik.",
    ),
    hasBattery: false,
    specFields: [
      {
        key: "type",
        label: L("Type", "Jenis"),
        type: "select",
        options: ["Mirrorless", "DSLR", "Compact", "Lens", "Action", "Film"],
        optionLabels: { Compact: L("Compact", "Kompak"), Lens: L("Lens", "Lensa"), Action: L("Action", "Kamera aksi") },
        required: true,
      },
      { key: "mount", label: L("Lens mount", "Dudukan lensa"), type: "text", placeholder: L("e.g. Sony E", "mis. Sony E") },
      {
        key: "sensor",
        label: L("Sensor format", "Format sensor"),
        type: "select",
        options: ["Full frame", "APS-C", "Micro Four Thirds", "1-inch", "Medium format", "Other"],
        optionLabels: { "1-inch": L("1-inch", "1 inci"), ...OTHER },
      },
      { key: "megapixels", label: L("Resolution", "Resolusi"), type: "number", unit: "MP" },
      { key: "shutterCount", label: L("Shutter count", "Jumlah shutter"), type: "number" },
      { key: "focalLength", label: L("Focal length (lenses)", "Panjang fokus (lensa)"), type: "text", placeholder: L("e.g. 24-70mm f/2.8", "mis. 24-70mm f/2.8") },
    ],
    checks: [
      { key: "sensor", label: L("Sensor / optics", "Sensor / optik"), hint: L("Dust, fungus, haze, scratches", "Debu, jamur, kabut, goresan") },
      { key: "shutter", label: L("Shutter", "Shutter"), when: isType("type", "Mirrorless", "DSLR", "Compact", "Film") },
      { key: "aperture", label: L("Aperture blades", "Bilah apertur"), hint: L("Clean, dry, close smoothly", "Bersih, kering, menutup dengan lancar"), when: isType("type", "Lens") },
      { key: "autofocus", label: L("Autofocus & stabilisation", "Fokus otomatis & stabilisasi"), when: isNotType("type", "Action") },
      { key: "mount", label: L("Lens mount & contacts", "Dudukan lensa & kontak"), when: isType("type", "Mirrorless", "DSLR", "Lens", "Film") },
      { key: "rings", label: L("Focus & zoom rings", "Ring fokus & zoom"), when: isType("type", "Lens") },
      { key: "screen", label: L("LCD / viewfinder", "LCD / jendela bidik"), when: isNotType("type", "Lens") },
      { key: "controls", label: L("Dials & buttons", "Dial & tombol"), when: isNotType("type", "Lens") },
      ...COMMON_COSMETIC,
      { key: "battery", label: L("Battery & door", "Baterai & penutupnya"), when: isNotType("type", "Lens") },
    ],
  },
  {
    slug: "pc-components",
    name: L("PC Components", "Komponen PC"),
    singular: L("Component", "Komponen"),
    description: L(
      "Used GPUs, CPUs, RAM, motherboards and storage — stress tested with usage history disclosed.",
      "GPU, CPU, RAM, motherboard, dan penyimpanan bekas — sudah diuji stres dengan riwayat pemakaian yang jelas.",
    ),
    hasBattery: false,
    specFields: [
      {
        key: "componentType",
        label: L("Component", "Komponen"),
        type: "select",
        options: ["GPU", "CPU", "RAM", "Motherboard", "Storage", "PSU", "Cooling", "Case", "Other"],
        optionLabels: { Storage: L("Storage", "Penyimpanan"), Cooling: L("Cooling", "Pendingin"), Case: L("Case", "Casing"), ...OTHER },
        required: true,
      },
      { key: "chipset", label: L("Chipset / model", "Chipset / model"), type: "text", required: true, placeholder: L("e.g. RTX 4070 / Ryzen 7 7800X3D", "mis. RTX 4070 / Ryzen 7 7800X3D") },
      { key: "memory", label: L("Memory / capacity", "Memori / kapasitas"), type: "number", unit: "GB" },
      { key: "interface", label: L("Interface / socket", "Antarmuka / soket"), type: "text", placeholder: L("e.g. PCIe 4.0 x16 / AM5", "mis. PCIe 4.0 x16 / AM5") },
      { key: "tdp", label: L("TDP / wattage", "TDP / daya"), type: "number", unit: "W" },
      {
        key: "usage",
        label: L("Usage history", "Riwayat pemakaian"),
        type: "select",
        options: ["Gaming / personal", "Workstation", "Mining", "Unknown"],
        optionLabels: {
          "Gaming / personal": L("Gaming / personal", "Gaming / pribadi"),
          Mining: L("Mining", "Penambangan kripto"),
          Unknown: L("Unknown", "Tidak diketahui"),
        },
        required: true,
      },
    ],
    checks: [
      { key: "physical", label: L("Physical condition", "Kondisi fisik"), hint: L("PCB, bent pins, damaged traces", "PCB, pin bengkok, jalur rusak") },
      { key: "connectors", label: L("Connectors / pins", "Konektor / pin") },
      { key: "fans", label: L("Fans & cooling", "Kipas & pendingin"), when: isType("componentType", "GPU", "PSU", "Cooling", "Case") },
      { key: "stressTest", label: L("Stress test (30 min+)", "Uji stres (30+ menit)"), when: isType("componentType", "GPU", "CPU", "RAM", "Motherboard", "PSU") },
      { key: "thermals", label: L("Temperatures within spec", "Suhu sesuai spesifikasi"), when: isType("componentType", "GPU", "CPU", "Cooling") },
      { key: "artifacts", label: L("Errors / artifacting", "Error / artefak"), when: isType("componentType", "GPU", "RAM") },
      {
        key: "driveHealth",
        label: L("Drive health (SMART)", "Kesehatan drive (SMART)"),
        hint: L("Health %, reallocated sectors, hours", "Persentase kesehatan, sektor realokasi, jam pemakaian"),
        when: isType("componentType", "Storage"),
      },
    ],
  },
  {
    slug: "audio",
    name: L("Audio", "Audio"),
    singular: L("Audio device", "Perangkat audio"),
    description: L(
      "Headphones, earbuds, speakers and DACs with driver, battery and pairing checks.",
      "Headphone, earbud, speaker, dan DAC dengan pengecekan driver, baterai, dan pairing.",
    ),
    hasBattery: hasFeature("wireless"),
    specFields: [
      { key: "type", label: L("Type", "Jenis"), type: "select", options: ["Over-ear", "On-ear", "In-ear", "Speaker", "DAC / Amp", "Other"], optionLabels: OTHER, required: true },
      { key: "wireless", label: L("Wireless", "Nirkabel"), type: "boolean" },
      { key: "anc", label: L("Active noise cancelling", "Peredam bising aktif (ANC)"), type: "boolean" },
      { key: "color", label: L("Color", "Warna"), type: "text" },
    ],
    checks: [
      { key: "drivers", label: L("Sound output (left / right)", "Keluaran suara (kiri / kanan)") },
      { key: "anc", label: L("Noise cancelling", "Peredam bising"), when: hasFeature("anc") },
      { key: "pairing", label: L("Pairing & connectivity", "Pairing & konektivitas"), when: hasFeature("wireless") },
      { key: "charging", label: L("Charging / case", "Pengisian daya / casing"), when: hasFeature("wireless") },
      { key: "padding", label: L("Ear pads / tips", "Bantalan telinga / ear tip"), when: isType("type", "Over-ear", "On-ear", "In-ear") },
      ...COMMON_COSMETIC,
    ],
  },
  {
    slug: "gaming",
    name: L("Gaming", "Gaming"),
    singular: L("Console", "Konsol"),
    description: L(
      "Pre-owned consoles, handhelds and controllers — tested for drift, disc drives and storage.",
      "Konsol, handheld, dan controller bekas — diuji untuk drift, disc drive, dan penyimpanan.",
    ),
    hasBattery: false,
    specFields: [
      {
        key: "type",
        label: L("Type", "Jenis"),
        type: "select",
        options: ["Home console", "Handheld / hybrid", "Controller"],
        optionLabels: { "Home console": L("Home console", "Konsol rumahan"), "Handheld / hybrid": L("Handheld / hybrid", "Handheld / hibrida") },
        required: true,
      },
      { key: "platform", label: L("Platform", "Platform"), type: "text", required: true, placeholder: L("e.g. PlayStation 5", "mis. PlayStation 5") },
      { key: "edition", label: L("Edition", "Edisi"), type: "text", placeholder: L("e.g. Digital / Disc", "mis. Digital / Disc") },
      { key: "storage", label: L("Storage", "Penyimpanan"), type: "number", unit: "GB" },
      { key: "controllers", label: L("Controllers included", "Controller yang disertakan"), type: "number" },
    ],
    checks: [
      { key: "boots", label: L("Powers on & boots", "Menyala & booting"), when: isNotType("type", "Controller") },
      { key: "screen", label: L("Display & touch", "Layar & sentuh"), when: isType("type", "Handheld / hybrid") },
      { key: "video", label: L("Video output", "Keluaran video"), when: isNotType("type", "Controller") },
      {
        key: "drive",
        label: L("Disc drive / cartridge slot", "Disc drive / slot kartrid"),
        hint: L("N/A for digital editions", "Tidak berlaku untuk edisi digital"),
        when: isNotType("type", "Controller"),
      },
      { key: "controllers", label: L("Controllers (drift, buttons)", "Controller (drift, tombol)") },
      { key: "fans", label: L("Fan noise", "Suara kipas"), when: isNotType("type", "Controller") },
      { key: "ports", label: L("Ports", "Port") },
      ...COMMON_COSMETIC,
    ],
  },
  {
    slug: "smartwatches",
    name: L("Smartwatches", "Jam Tangan Pintar"),
    singular: L("Smartwatch", "Jam tangan pintar"),
    description: L(
      "Pre-owned smartwatches with battery health, display and sensor checks.",
      "Jam tangan pintar bekas dengan pengecekan kesehatan baterai, layar, dan sensor.",
    ),
    hasBattery: true,
    specFields: [
      { key: "caseSize", label: L("Case size", "Ukuran casing"), type: "number", unit: "mm" },
      { key: "connectivity", label: L("Connectivity", "Konektivitas"), type: "select", options: ["GPS", "GPS + Cellular"], optionLabels: { "GPS + Cellular": L("GPS + Cellular", "GPS + Seluler") } },
      { key: "material", label: L("Case material", "Material casing"), type: "text" },
      { key: "band", label: L("Band included", "Tali yang disertakan"), type: "text" },
    ],
    checks: [
      { key: "screen", label: L("Display & touch", "Layar & sentuh") },
      { key: "sensors", label: L("Heart-rate & health sensors", "Sensor detak jantung & kesehatan") },
      { key: "crown", label: L("Crown & buttons", "Crown & tombol") },
      { key: "charging", label: L("Charging", "Pengisian daya") },
      { key: "cellular", label: L("Cellular", "Seluler"), when: isType("connectivity", "GPS + Cellular") },
      ...COMMON_COSMETIC,
    ],
  },
];

/** The checks that apply to an item, given its specs (type, features). */
export function applicableChecks(category: Category, specs: Specs): ConditionCheck[] {
  return category.checks.filter((c) => !c.when || c.when(specs));
}

/** Whether battery health must be reported for this item. */
export function needsBattery(category: Category, specs: Specs): boolean {
  return typeof category.hasBattery === "function" ? category.hasBattery(specs) : category.hasBattery;
}

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export function getCategory(slug: string): Category | undefined {
  return BY_SLUG.get(slug);
}

export function categoryName(slug: string, locale: Locale): string {
  const category = BY_SLUG.get(slug);
  return category ? pick(category.name, locale) : slug;
}

/** Display text for a stored select option. */
export function optionLabel(field: SpecField, value: string, locale: Locale): string {
  const label = field.optionLabels?.[value];
  return label ? pick(label, locale) : value;
}

/** Category names in every language, for search text ("kamera" and "camera" both match). */
export function categorySearchTerms(slug: string): string[] {
  const category = BY_SLUG.get(slug);
  return category ? [...new Set(Object.values(category.name))] : [slug];
}

const YES_NO: Record<Locale, [string, string]> = { en: ["Yes", "No"], id: ["Ya", "Tidak"] };

export function formatSpecValue(field: SpecField | undefined, value: unknown, locale: Locale): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return YES_NO[locale][value ? 0 : 1];
  if (field?.key === "storage" || field?.key === "memory") {
    const n = Number(value);
    if (field.unit === "GB" && n >= 1024 && n % 1024 === 0) return `${n / 1024} TB`;
  }
  if (field?.type === "select") return optionLabel(field, String(value), locale);
  return field?.unit ? `${value} ${field.unit}` : String(value);
}
