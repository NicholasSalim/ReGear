// Category catalogue: each category defines the structured specification
// fields sellers must fill in and the condition checklist an item is graded on.
// Keeping this in code gives us type-safety and zero DB round-trips.

export type SpecField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  unit?: string;
  options?: readonly string[];
  required?: boolean;
  placeholder?: string;
};

export type ConditionCheck = { key: string; label: string; hint?: string };

export type Category = {
  slug: string;
  name: string;
  singular: string;
  description: string;
  hasBattery: boolean;
  specFields: readonly SpecField[];
  checks: readonly ConditionCheck[];
};

const COMMON_COSMETIC: ConditionCheck[] = [
  { key: "body", label: "Body / housing", hint: "Dents, cracks, scratches" },
];

export const CATEGORIES: readonly Category[] = [
  {
    slug: "phones",
    name: "Phones",
    singular: "Phone",
    description: "Pre-owned smartphones with verified battery health, IMEI checks and full functional reports.",
    hasBattery: true,
    specFields: [
      { key: "storage", label: "Storage", type: "number", unit: "GB", required: true },
      { key: "ram", label: "RAM", type: "number", unit: "GB" },
      { key: "chipset", label: "Chipset", type: "text", placeholder: "e.g. A16 Bionic" },
      { key: "screenSize", label: "Screen size", type: "number", unit: "in" },
      { key: "color", label: "Color", type: "text" },
      { key: "network", label: "Network", type: "select", options: ["4G", "5G"] },
      { key: "simLock", label: "Carrier lock", type: "select", options: ["Unlocked", "Locked"], required: true },
      { key: "dualSim", label: "Dual SIM", type: "boolean" },
    ],
    checks: [
      { key: "screen", label: "Display", hint: "Dead pixels, burn-in, touch response" },
      ...COMMON_COSMETIC,
      { key: "backGlass", label: "Back glass" },
      { key: "cameras", label: "Cameras (front & rear)" },
      { key: "biometrics", label: "Face ID / fingerprint" },
      { key: "audio", label: "Speakers & microphone" },
      { key: "charging", label: "Charging port & wireless charging" },
      { key: "buttons", label: "Buttons & switches" },
      { key: "connectivity", label: "Cellular, Wi-Fi & Bluetooth" },
    ],
  },
  {
    slug: "laptops",
    name: "Laptops",
    singular: "Laptop",
    description: "Second-hand laptops with tested keyboards, displays, battery cycles and full component specs.",
    hasBattery: true,
    specFields: [
      { key: "cpu", label: "Processor", type: "text", required: true, placeholder: "e.g. Apple M2 / Intel i7-1260P" },
      { key: "gpu", label: "Graphics", type: "text" },
      { key: "ram", label: "RAM", type: "number", unit: "GB", required: true },
      { key: "storage", label: "Storage", type: "number", unit: "GB", required: true },
      { key: "storageType", label: "Storage type", type: "select", options: ["NVMe SSD", "SATA SSD", "HDD", "eMMC"] },
      { key: "screenSize", label: "Screen size", type: "number", unit: "in" },
      { key: "resolution", label: "Resolution", type: "text", placeholder: "e.g. 2560×1600" },
      { key: "os", label: "Operating system", type: "text" },
      { key: "year", label: "Release year", type: "number" },
      { key: "batteryCycles", label: "Battery cycles", type: "number" },
    ],
    checks: [
      { key: "display", label: "Display", hint: "Dead pixels, backlight bleed, delamination" },
      { key: "keyboard", label: "Keyboard" },
      { key: "trackpad", label: "Trackpad" },
      { key: "ports", label: "Ports" },
      { key: "hinge", label: "Hinge" },
      { key: "webcam", label: "Webcam & microphone" },
      { key: "speakers", label: "Speakers" },
      ...COMMON_COSMETIC,
      { key: "charger", label: "Charger" },
      { key: "thermals", label: "Thermals under load" },
    ],
  },
  {
    slug: "tablets",
    name: "Tablets",
    singular: "Tablet",
    description: "Used tablets and e-readers, graded with battery health and display checks.",
    hasBattery: true,
    specFields: [
      { key: "storage", label: "Storage", type: "number", unit: "GB", required: true },
      { key: "screenSize", label: "Screen size", type: "number", unit: "in" },
      { key: "chipset", label: "Chipset", type: "text" },
      { key: "connectivity", label: "Connectivity", type: "select", options: ["Wi-Fi", "Wi-Fi + Cellular"] },
      { key: "color", label: "Color", type: "text" },
      { key: "stylusSupport", label: "Stylus support", type: "boolean" },
    ],
    checks: [
      { key: "screen", label: "Display & touch" },
      ...COMMON_COSMETIC,
      { key: "cameras", label: "Cameras" },
      { key: "audio", label: "Speakers & microphone" },
      { key: "charging", label: "Charging port" },
      { key: "buttons", label: "Buttons" },
      { key: "connectivity", label: "Wi-Fi & Bluetooth" },
    ],
  },
  {
    slug: "cameras",
    name: "Cameras & Lenses",
    singular: "Camera",
    description: "Pre-owned cameras and lenses with shutter counts, sensor inspection and optics checks.",
    hasBattery: false,
    specFields: [
      { key: "type", label: "Type", type: "select", options: ["Mirrorless", "DSLR", "Compact", "Lens", "Action", "Film"], required: true },
      { key: "mount", label: "Lens mount", type: "text", placeholder: "e.g. Sony E" },
      { key: "sensor", label: "Sensor format", type: "select", options: ["Full frame", "APS-C", "Micro Four Thirds", "1-inch", "Medium format", "Other"] },
      { key: "megapixels", label: "Resolution", type: "number", unit: "MP" },
      { key: "shutterCount", label: "Shutter count", type: "number" },
      { key: "focalLength", label: "Focal length (lenses)", type: "text", placeholder: "e.g. 24-70mm f/2.8" },
    ],
    checks: [
      { key: "sensor", label: "Sensor / optics", hint: "Dust, fungus, haze, scratches" },
      { key: "shutter", label: "Shutter / aperture" },
      { key: "autofocus", label: "Autofocus & stabilisation" },
      { key: "mount", label: "Lens mount & contacts" },
      { key: "screen", label: "LCD / viewfinder" },
      { key: "controls", label: "Dials & buttons" },
      ...COMMON_COSMETIC,
      { key: "battery", label: "Battery & door" },
    ],
  },
  {
    slug: "pc-components",
    name: "PC Components",
    singular: "Component",
    description: "Used GPUs, CPUs, RAM, motherboards and storage — stress tested with usage history disclosed.",
    hasBattery: false,
    specFields: [
      { key: "componentType", label: "Component", type: "select", options: ["GPU", "CPU", "RAM", "Motherboard", "Storage", "PSU", "Cooling", "Case", "Other"], required: true },
      { key: "chipset", label: "Chipset / model", type: "text", required: true, placeholder: "e.g. RTX 4070 / Ryzen 7 7800X3D" },
      { key: "memory", label: "Memory / capacity", type: "number", unit: "GB" },
      { key: "interface", label: "Interface / socket", type: "text", placeholder: "e.g. PCIe 4.0 x16 / AM5" },
      { key: "tdp", label: "TDP / wattage", type: "number", unit: "W" },
      { key: "usage", label: "Usage history", type: "select", options: ["Gaming / personal", "Workstation", "Mining", "Unknown"], required: true },
    ],
    checks: [
      { key: "physical", label: "Physical condition", hint: "PCB, bent pins, damaged traces" },
      { key: "connectors", label: "Connectors / pins" },
      { key: "fans", label: "Fans & cooling" },
      { key: "stressTest", label: "Stress test (30 min+)" },
      { key: "thermals", label: "Temperatures within spec" },
      { key: "artifacts", label: "Errors / artifacting" },
    ],
  },
  {
    slug: "audio",
    name: "Audio",
    singular: "Audio device",
    description: "Headphones, earbuds, speakers and DACs with driver, battery and pairing checks.",
    hasBattery: true,
    specFields: [
      { key: "type", label: "Type", type: "select", options: ["Over-ear", "On-ear", "In-ear", "Speaker", "DAC / Amp", "Other"], required: true },
      { key: "wireless", label: "Wireless", type: "boolean" },
      { key: "anc", label: "Active noise cancelling", type: "boolean" },
      { key: "color", label: "Color", type: "text" },
    ],
    checks: [
      { key: "drivers", label: "Drivers (left / right)" },
      { key: "anc", label: "Noise cancelling" },
      { key: "pairing", label: "Pairing & connectivity" },
      { key: "charging", label: "Charging / case" },
      { key: "padding", label: "Ear pads / tips" },
      ...COMMON_COSMETIC,
    ],
  },
  {
    slug: "gaming",
    name: "Gaming",
    singular: "Console",
    description: "Pre-owned consoles, handhelds and controllers — tested for drift, disc drives and storage.",
    hasBattery: false,
    specFields: [
      { key: "platform", label: "Platform", type: "text", required: true, placeholder: "e.g. PlayStation 5" },
      { key: "edition", label: "Edition", type: "text", placeholder: "e.g. Digital / Disc" },
      { key: "storage", label: "Storage", type: "number", unit: "GB" },
      { key: "controllers", label: "Controllers included", type: "number" },
    ],
    checks: [
      { key: "boots", label: "Powers on & boots" },
      { key: "video", label: "Video output" },
      { key: "drive", label: "Disc drive / cartridge slot" },
      { key: "controllers", label: "Controllers (drift, buttons)" },
      { key: "fans", label: "Fan noise" },
      { key: "ports", label: "Ports" },
      ...COMMON_COSMETIC,
    ],
  },
  {
    slug: "wearables",
    name: "Wearables",
    singular: "Wearable",
    description: "Smartwatches and fitness trackers with battery health and sensor checks.",
    hasBattery: true,
    specFields: [
      { key: "caseSize", label: "Case size", type: "number", unit: "mm" },
      { key: "connectivity", label: "Connectivity", type: "select", options: ["GPS", "GPS + Cellular"] },
      { key: "material", label: "Case material", type: "text" },
      { key: "band", label: "Band included", type: "text" },
    ],
    checks: [
      { key: "screen", label: "Display & touch" },
      { key: "sensors", label: "Heart-rate & health sensors" },
      { key: "crown", label: "Crown & buttons" },
      { key: "charging", label: "Charging" },
      ...COMMON_COSMETIC,
    ],
  },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];

export function getCategory(slug: string): Category | undefined {
  return BY_SLUG.get(slug);
}

export function categoryName(slug: string): string {
  return BY_SLUG.get(slug)?.name ?? slug;
}

export function formatSpecValue(field: SpecField | undefined, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field?.key === "storage" || field?.key === "memory") {
    const n = Number(value);
    if (field.unit === "GB" && n >= 1024 && n % 1024 === 0) return `${n / 1024} TB`;
  }
  return field?.unit ? `${value} ${field.unit}` : String(value);
}
