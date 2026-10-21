import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { getCategory } from "../src/lib/catalog";
import { functionalScore, type ConditionCheckEntry } from "../src/lib/condition";
import type { CheckStatus, ConditionGrade } from "../src/lib/constants";
import { calculateFees, generateOrderNumber } from "../src/lib/orders/state";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const STORAGE = path.resolve(process.env.STORAGE_DIR ?? "./storage");
const DEMO_PASSWORD = "Password123";

const GRADE_RANK: Record<ConditionGrade, number> = { LIKE_NEW: 0, EXCELLENT: 1, GOOD: 2, FAIR: 3, FOR_PARTS: 4 };
const PALETTES = [
  ["#5b6474", "#c9d2e3"],
  ["#2b3a55", "#9fb3d9"],
  ["#8a5a44", "#e7c2a8"],
  ["#4d4a6b", "#c4c0e8"],
  ["#3f5e50", "#b5d3c2"],
  ["#9aa1ad", "#e3e6eb"],
];

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Generate a clean placeholder product photo (no external assets needed). */
async function makeImage(dir: "public" | "private", title: string, subtitle: string, paletteIndex: number, variant: number, category = "phones") {
  // Studio-style product shot: flat neutral plate, soft floor shadow, device in its own colour.
  const [dark, light] = PALETTES[paletteIndex % PALETTES.length];
  const shapes: Record<string, string> = {
    phone: `<rect x="455" y="150" width="290" height="560" rx="46" fill="${dark}"/><rect x="472" y="168" width="256" height="524" rx="32" fill="#10141c"/><rect x="560" y="186" width="80" height="18" rx="9" fill="${dark}"/>`,
    tablet: `<rect x="360" y="170" width="480" height="540" rx="36" fill="${dark}"/><rect x="380" y="190" width="440" height="500" rx="18" fill="#10141c"/>`,
    watch: `<rect x="530" y="150" width="140" height="590" rx="40" fill="${dark}" opacity="0.6"/><rect x="460" y="300" width="280" height="300" rx="70" fill="${dark}"/><rect x="480" y="320" width="240" height="260" rx="54" fill="#10141c"/>`,
    laptop: `<rect x="300" y="240" width="600" height="380" rx="20" fill="#10141c"/><rect x="316" y="256" width="568" height="348" rx="10" fill="${light}" opacity="0.55"/><path d="M230 640 h740 l-40 34 h-660 z" fill="${dark}"/>`,
    camera: `<rect x="380" y="290" width="440" height="290" rx="36" fill="${dark}"/><circle cx="600" cy="435" r="118" fill="#10141c"/><circle cx="600" cy="435" r="76" fill="${light}" opacity="0.5"/><rect x="430" y="255" width="120" height="44" rx="10" fill="${dark}"/>`,
    gpu: `<rect x="250" y="320" width="700" height="230" rx="22" fill="${dark}"/><circle cx="440" cy="435" r="90" fill="#10141c"/><circle cx="760" cy="435" r="90" fill="#10141c"/><circle cx="440" cy="435" r="22" fill="${light}"/><circle cx="760" cy="435" r="22" fill="${light}"/><rect x="300" y="550" width="380" height="26" fill="#c9a227"/>`,
    headphones: `<path d="M400 520 V420 a200 200 0 0 1 400 0 V520" fill="none" stroke="${dark}" stroke-width="36"/><rect x="350" y="480" width="110" height="190" rx="44" fill="#10141c"/><rect x="740" y="480" width="110" height="190" rx="44" fill="#10141c"/>`,
    console: `<rect x="330" y="300" width="540" height="300" rx="40" fill="${dark}"/><circle cx="460" cy="450" r="50" fill="#10141c"/><circle cx="740" cy="420" r="22" fill="#10141c"/><circle cx="790" cy="470" r="22" fill="#10141c"/>`,
  };
  const SHAPE_FOR: Record<string, string> = { phones: "phone", tablets: "tablet", wearables: "watch", laptops: "laptop", cameras: "camera", "pc-components": "gpu", audio: "headphones", gaming: "console" };
  const shape = shapes[SHAPE_FOR[category] ?? "phone"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="#eceef2"/>
    <ellipse cx="600" cy="740" rx="330" ry="26" fill="#1a2233" opacity="0.10"/>
    <g transform="${variant === 0 ? "" : `translate(600 450) scale(${variant === 1 ? 0.82 : 1.08}) translate(-600 -450)`}">${shape}</g>
    <text x="56" y="840" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#8a93a3">${esc(title)}, ${esc(subtitle.toLowerCase())}, photo ${variant + 1}</text>
  </svg>`;
  const data = await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer();
  const name = randomBytes(16).toString("hex");
  const key = `${name.slice(0, 2)}/${name}.webp`;
  const full = path.join(STORAGE, dir, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return { key, width: 1200, height: 900, bytes: data.length };
}

type SeedListing = {
  seller: string;
  category: string;
  title: string;
  brand: string;
  model: string;
  price: number;
  original?: number;
  shipping?: number;
  grade: ConditionGrade;
  specs: Record<string, string | number | boolean>;
  battery?: number;
  cosmetic: number;
  issues?: Record<string, [CheckStatus, string]>;
  accessories: string[];
  knownIssues?: string;
  warranty?: ["SELLER" | "MANUFACTURER", number, string];
  returns?: number;
  description: string;
};

const LISTINGS: SeedListing[] = [
  { seller: "techhaven", category: "phones", title: "iPhone 14 Pro 256GB Deep Purple — Unlocked", brand: "Apple", model: "iPhone 14 Pro", price: 699, original: 1099, grade: "EXCELLENT", specs: { storage: 256, ram: 6, chipset: "A16 Bionic", screenSize: 6.1, color: "Deep Purple", network: "5G", simLock: "Unlocked", dualSim: true }, battery: 89, cosmetic: 9, accessories: ["USB-C to Lightning cable", "Clear case"], warranty: ["SELLER", 6, "Covers hardware faults not caused by drops or liquid. Ship to us for repair or replacement."], returns: 14, description: "Used for 14 months with a screen protector and case from day one. Face ID, cameras and all buttons work perfectly. Factory reset and removed from iCloud." },
  { seller: "techhaven", category: "phones", title: "Samsung Galaxy S23 Ultra 512GB Phantom Black", brand: "Samsung", model: "Galaxy S23 Ultra", price: 749, original: 1379, grade: "GOOD", specs: { storage: 512, ram: 12, chipset: "Snapdragon 8 Gen 2", screenSize: 6.8, color: "Phantom Black", network: "5G", simLock: "Unlocked", dualSim: true }, battery: 86, cosmetic: 7, issues: { body: ["MINOR", "Light scuffs on the bottom frame near the S Pen slot"] }, accessories: ["S Pen", "USB-C cable"], warranty: ["SELLER", 3, "Seller warranty against functional defects."], returns: 7, description: "Daily driver for one year. S Pen included and works flawlessly. Some light frame scuffs, screen is pristine." },
  { seller: "pcparts", category: "phones", title: "Google Pixel 7 128GB Snow — carrier locked", brand: "Google", model: "Pixel 7", price: 249, grade: "FAIR", specs: { storage: 128, ram: 8, chipset: "Tensor G2", screenSize: 6.3, color: "Snow", network: "5G", simLock: "Locked", dualSim: false }, battery: 78, cosmetic: 5, issues: { screen: ["MINOR", "Small scratch in upper left, invisible when screen is on"], backGlass: ["MINOR", "Hairline crack on the camera bar corner"] }, accessories: [], knownIssues: "Locked to Verizon. Battery drains faster than new.", returns: 3, description: "Works perfectly but shows its age. Great budget phone or backup. Locked to Verizon." },
  { seller: "techhaven", category: "laptops", title: "MacBook Air M2 13\" 16GB / 512GB Midnight", brand: "Apple", model: "MacBook Air M2", price: 949, original: 1499, grade: "LIKE_NEW", specs: { cpu: "Apple M2 8-core", gpu: "10-core GPU", ram: 16, storage: 512, storageType: "NVMe SSD", screenSize: 13.6, resolution: "2560×1664", os: "macOS Sequoia", year: 2023, batteryCycles: 41 }, battery: 99, cosmetic: 10, accessories: ["35W dual USB-C charger", "MagSafe cable", "Original box"], warranty: ["MANUFACTURER", 4, "Remaining AppleCare+ coverage, transferable to the buyer."], returns: 14, description: "Barely used work laptop, 41 battery cycles. No scratches or marks, kept in a sleeve. Comes in the original box with all accessories." },
  { seller: "techhaven", category: "laptops", title: "Lenovo ThinkPad X1 Carbon Gen 10 i7 16GB 1TB", brand: "Lenovo", model: "ThinkPad X1 Carbon Gen 10", price: 819, original: 2100, grade: "EXCELLENT", specs: { cpu: "Intel Core i7-1260P", gpu: "Intel Iris Xe", ram: 16, storage: 1024, storageType: "NVMe SSD", screenSize: 14, resolution: "1920×1200", os: "Windows 11 Pro", year: 2022, batteryCycles: 212 }, battery: 88, cosmetic: 9, accessories: ["65W USB-C charger"], warranty: ["SELLER", 6, "Six-month warranty on all components except battery wear."], returns: 14, description: "Corporate lease return, professionally cleaned and tested. Keyboard is excellent. Fresh Windows 11 Pro install." },
  { seller: "pcparts", category: "laptops", title: "ASUS ROG Zephyrus G14 RTX 3060 Ryzen 9", brand: "ASUS", model: "ROG Zephyrus G14 (2021)", price: 699, grade: "GOOD", specs: { cpu: "AMD Ryzen 9 5900HS", gpu: "NVIDIA RTX 3060 6GB", ram: 16, storage: 1024, storageType: "NVMe SSD", screenSize: 14, resolution: "2560×1440", os: "Windows 11 Home", year: 2021, batteryCycles: 380 }, battery: 81, cosmetic: 7, issues: { keyboard: ["MINOR", "W and A keycaps slightly shiny"], hinge: ["PASS", ""] }, accessories: ["180W charger"], returns: 7, description: "Great portable gaming laptop. Repasted 3 months ago, thermals are great. Some shine on WASD keys." },
  { seller: "techhaven", category: "tablets", title: "iPad Air 5th Gen 64GB Wi-Fi Blue", brand: "Apple", model: "iPad Air (5th generation)", price: 399, original: 599, grade: "EXCELLENT", specs: { storage: 64, screenSize: 10.9, chipset: "Apple M1", connectivity: "Wi-Fi", color: "Blue", stylusSupport: true }, battery: 92, cosmetic: 9, accessories: ["USB-C cable"], returns: 14, description: "Used mainly for reading and notes. Always had a screen protector. Supports Apple Pencil 2 (not included)." },
  { seller: "camerabay", category: "cameras", title: "Sony A7 III Body — 18k shutter count", brand: "Sony", model: "Alpha 7 III", price: 1099, original: 1999, grade: "EXCELLENT", specs: { type: "Mirrorless", mount: "Sony E", sensor: "Full frame", megapixels: 24.2, shutterCount: 18240 }, cosmetic: 9, accessories: ["2× NP-FZ100 batteries", "Charger", "Strap", "Body cap"], warranty: ["SELLER", 6, "Sensor and shutter covered for 6 months."], returns: 14, description: "Hobbyist owned, never used professionally. Sensor professionally cleaned last month. Shutter count verified by app (screenshot available)." },
  { seller: "camerabay", category: "cameras", title: "Canon RF 24-105mm f/4 L IS USM Lens", brand: "Canon", model: "RF 24-105mm f/4L IS USM", price: 749, original: 1299, grade: "LIKE_NEW", specs: { type: "Lens", mount: "Canon RF", sensor: "Full frame", focalLength: "24-105mm f/4" }, cosmetic: 10, issues: { shutter: ["NA", ""], screen: ["NA", ""], battery: ["NA", ""] }, accessories: ["Front & rear caps", "Lens hood EW-83N", "Pouch"], returns: 14, description: "Bought as kit lens and barely used. No dust, haze or fungus. Glass is flawless; focus and IS are smooth and silent." },
  { seller: "camerabay", category: "cameras", title: "Fujifilm X-T4 Silver Body", brand: "Fujifilm", model: "X-T4", price: 899, grade: "GOOD", specs: { type: "Mirrorless", mount: "Fujifilm X", sensor: "APS-C", megapixels: 26.1, shutterCount: 41200 }, cosmetic: 7, issues: { body: ["MINOR", "Brassing on the top plate edges"], controls: ["MINOR", "Exposure comp dial slightly loose"] }, accessories: ["Battery", "Charger"], returns: 7, description: "Well loved street photography camera. Some brassing adds character. All functions work, images are perfect." },
  { seller: "pcparts", category: "pc-components", title: "NVIDIA GeForce RTX 3080 10GB Founders Edition", brand: "NVIDIA", model: "RTX 3080 FE", price: 399, original: 699, grade: "GOOD", specs: { componentType: "GPU", chipset: "RTX 3080", memory: 10, interface: "PCIe 4.0 x16", tdp: 320, usage: "Gaming / personal" }, cosmetic: 8, issues: { fans: ["MINOR", "Slight fan bearing noise at 100% speed only"] }, accessories: ["Original box", "12-pin adapter"], returns: 7, description: "Used for gaming only, never mined. Passed 1h FurMark and 3DMark Time Spy stress tests with stable clocks. Max temp 76°C." },
  { seller: "pcparts", category: "pc-components", title: "AMD Ryzen 7 5800X3D CPU", brand: "AMD", model: "Ryzen 7 5800X3D", price: 249, original: 449, grade: "EXCELLENT", specs: { componentType: "CPU", chipset: "Ryzen 7 5800X3D", interface: "AM4", tdp: 105, usage: "Gaming / personal" }, cosmetic: 9, accessories: ["Original box"], returns: 7, description: "Upgraded to AM5. No bent pins, cleaned of thermal paste. Ran stock with a 360mm AIO." },
  { seller: "techhaven", category: "pc-components", title: "Corsair Vengeance 32GB (2×16) DDR5-6000", brand: "Corsair", model: "Vengeance DDR5-6000 CL36", price: 89, original: 139, grade: "LIKE_NEW", specs: { componentType: "RAM", chipset: "DDR5-6000 CL36", memory: 32, interface: "DDR5 DIMM", usage: "Gaming / personal" }, cosmetic: 10, issues: { fans: ["NA", ""] }, accessories: ["Original packaging"], warranty: ["MANUFACTURER", 24, "Corsair limited lifetime warranty; receipt provided."], returns: 14, description: "Passed 4 passes of MemTest86 with EXPO enabled. Only used for 3 months." },
  { seller: "techhaven", category: "audio", title: "Sony WH-1000XM5 Noise Cancelling Headphones", brand: "Sony", model: "WH-1000XM5", price: 229, original: 399, grade: "EXCELLENT", specs: { type: "Over-ear", wireless: true, anc: true, color: "Black" }, battery: 93, cosmetic: 9, accessories: ["Carry case", "USB-C cable", "3.5mm cable"], returns: 14, description: "Excellent ANC, ear pads in great shape. Sanitised before shipping." },
  { seller: "pcparts", category: "audio", title: "Apple AirPods Pro (2nd gen) USB-C", brand: "Apple", model: "AirPods Pro 2", price: 139, grade: "GOOD", specs: { type: "In-ear", wireless: true, anc: true, color: "White" }, battery: 84, cosmetic: 7, issues: { charging: ["MINOR", "Case has light scratches; charging works perfectly"] }, accessories: ["Case", "Spare ear tips"], returns: 7, description: "Both buds and case are original and paired from the same set. New tips included." },
  { seller: "techhaven", category: "gaming", title: "PlayStation 5 Disc Edition + 2 controllers", brand: "Sony", model: "PlayStation 5 (CFI-1216A)", price: 379, original: 499, grade: "EXCELLENT", specs: { platform: "PlayStation 5", edition: "Disc", storage: 825, controllers: 2 }, cosmetic: 9, issues: { controllers: ["MINOR", "Second controller has very slight left stick drift"] }, accessories: ["HDMI cable", "Power cable", "2× DualSense"], warranty: ["SELLER", 3, "Covers console hardware failure."], returns: 14, description: "Disc drive reads everything, runs quiet. Cleaned the dust filter. One controller has minimal drift (disclosed)." },
  { seller: "pcparts", category: "gaming", title: "Nintendo Switch OLED White — modded-free, unbanned", brand: "Nintendo", model: "Switch OLED", price: 239, grade: "GOOD", specs: { platform: "Nintendo Switch", edition: "OLED", storage: 64, controllers: 2 }, cosmetic: 7, issues: { body: ["MINOR", "Scuffs on the dock"] }, accessories: ["Dock", "Joy-Cons", "Charger"], returns: 7, description: "Account removed, factory reset. Joy-Cons were replaced last year and have no drift." },
  { seller: "techhaven", category: "wearables", title: "Apple Watch Series 8 45mm GPS Midnight Aluminum", brand: "Apple", model: "Watch Series 8", price: 219, original: 429, grade: "EXCELLENT", specs: { caseSize: 45, connectivity: "GPS", material: "Aluminum", band: "Midnight sport band" }, battery: 90, cosmetic: 9, accessories: ["Magnetic charger"], returns: 14, description: "Worn with a bumper, screen is flawless. Unpaired and activation lock removed." },
  { seller: "camerabay", category: "cameras", title: "GoPro HERO11 Black with Media Mod", brand: "GoPro", model: "HERO11 Black", price: 259, grade: "GOOD", specs: { type: "Action", sensor: "1-inch", megapixels: 27 }, cosmetic: 7, issues: { body: ["MINOR", "Scratches on the housing from mounting"], shutter: ["NA", ""], mount: ["NA", ""] }, accessories: ["Media Mod", "2 batteries", "Mounting buckles"], returns: 7, description: "Used on a few ski trips. Lens cover replaced, so footage is crystal clear." },
  { seller: "pcparts", category: "laptops", title: "Dell XPS 13 9310 — for parts (no display)", brand: "Dell", model: "XPS 13 9310", price: 149, grade: "FOR_PARTS", specs: { cpu: "Intel Core i7-1185G7", ram: 16, storage: 512, storageType: "NVMe SSD", screenSize: 13.4, os: "None" }, cosmetic: 5, issues: { display: ["FAIL", "Display cracked; no image"], webcam: ["FAIL", "Webcam is part of the display assembly"] }, accessories: [], knownIssues: "Display is cracked. Works with an external monitor. Motherboard, keyboard and SSD are good.", returns: 0, description: "Dropped laptop, sold for parts or repair. Everything except the display assembly works when connected to an external monitor." },
];

function buildChecks(category: string, issues: SeedListing["issues"] = {}): ConditionCheckEntry[] {
  return getCategory(category)!.checks.map((c) => {
    const issue = issues[c.key];
    return issue ? { key: c.key, status: issue[0], ...(issue[1] ? { note: issue[1] } : {}) } : { key: c.key, status: "PASS" as const };
  });
}

async function main() {
  console.log("Resetting database…");
  // Children first to satisfy FK constraints.
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.rateLimit.deleteMany(),
    db.disputeMessage.deleteMany(),
    db.dispute.deleteMany(),
    db.review.deleteMany(),
    db.returnRequest.deleteMany(),
    db.orderEvent.deleteMany(),
    db.order.deleteMany(),
    db.favorite.deleteMany(),
    db.upload.deleteMany(),
    db.conditionReport.deleteMany(),
    db.listing.deleteMany(),
    db.verificationRequest.deleteMany(),
    db.sellerProfile.deleteMany(),
    db.session.deleteMany(),
    db.user.deleteMany(),
  ]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const admin = await db.user.create({ data: { email: "admin@regear.test", name: "Ada Admin", role: "ADMIN", passwordHash } });
  const buyer = await db.user.create({ data: { email: "buyer@regear.test", name: "Bima Buyer", passwordHash } });
  const buyer2 = await db.user.create({ data: { email: "dana@regear.test", name: "Dana Rahman", passwordHash } });

  const sellerDefs = [
    { key: "techhaven", email: "techhaven@regear.test", name: "Tara Haven", displayName: "TechHaven Refurb", location: "Jakarta, ID", status: "VERIFIED", bio: "Certified refurbisher since 2016. Every device goes through a 40-point inspection and is factory reset before shipping." },
    { key: "camerabay", email: "camerabay@regear.test", name: "Cahyo Bay", displayName: "CameraBay", location: "Bandung, ID", status: "VERIFIED", bio: "Camera enthusiast selling well-kept gear. Sensors cleaned and shutter counts verified." },
    { key: "pcparts", email: "pcparts@regear.test", name: "Putra Parts", displayName: "Putra's PC Parts", location: "Surabaya, ID", status: "PENDING", bio: "Upgrading constantly — selling tested parts from my own builds." },
  ] as const;

  const sellers: Record<string, { id: string; userId: string }> = {};
  for (const s of sellerDefs) {
    const user = await db.user.create({ data: { email: s.email, name: s.name, passwordHash } });
    const profile = await db.sellerProfile.create({
      data: {
        userId: user.id,
        slug: s.key,
        displayName: s.displayName,
        location: s.location,
        bio: s.bio,
        verificationStatus: s.status,
        verifiedAt: s.status === "VERIFIED" ? new Date(Date.now() - 90 * 86_400_000) : null,
        createdAt: new Date(Date.now() - 400 * 86_400_000),
      },
    });
    sellers[s.key] = { id: profile.id, userId: user.id };
  }

  // A pending verification request with a generated "document" for the admin queue.
  const doc = await makeImage("private", "SAMPLE ID — NOT A REAL DOCUMENT", "Putra Parts · demo verification", 5, 1);
  await db.verificationRequest.create({
    data: {
      sellerId: sellers.pcparts.id,
      legalName: "Putra Pratama",
      phone: "+62 812 0000 0000",
      address: "Jl. Contoh No. 1, Surabaya, Jawa Timur 60111",
      idType: "NATIONAL_ID",
      idNumberLast4: "4821",
      documentKey: doc.key,
    },
  });

  console.log("Creating listings and images…");
  const listingIds: string[] = [];
  for (const [i, l] of LISTINGS.entries()) {
    const seller = sellers[l.seller];
    const checks = buildChecks(l.category, l.issues);
    const publishedAt = new Date(Date.now() - (LISTINGS.length - i) * 7 * 3_600_000);
    const listing = await db.listing.create({
      data: {
        sellerId: seller.id,
        slug: `${l.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)}-${randomBytes(3).toString("hex")}`,
        title: l.title,
        category: l.category,
        brand: l.brand,
        model: l.model,
        description: l.description,
        priceCents: l.price * 100,
        originalPriceCents: l.original ? l.original * 100 : null,
        shippingCents: (l.shipping ?? (l.price > 500 ? 0 : 9)) * 100,
        conditionGrade: l.grade,
        gradeRank: GRADE_RANK[l.grade],
        specs: JSON.stringify(l.specs),
        warrantyType: l.warranty?.[0] ?? "NONE",
        warrantyMonths: l.warranty?.[1] ?? 0,
        warrantyTerms: l.warranty?.[2] ?? "",
        returnWindowDays: l.returns ?? 7,
        location: sellerDefs.find((s) => s.key === l.seller)!.location,
        status: "ACTIVE",
        publishedAt,
        createdAt: publishedAt,
        viewCount: Math.floor(Math.random() * 400),
        searchText: [l.title, l.brand, l.model, getCategory(l.category)!.name, ...Object.values(l.specs).filter((v) => typeof v !== "boolean")].join(" ").toLowerCase(),
        conditionReport: {
          create: {
            batteryHealth: l.battery ?? null,
            cosmeticScore: l.cosmetic,
            functionalScore: functionalScore(checks),
            checks: JSON.stringify(checks),
            includedAccessories: JSON.stringify(l.accessories),
            knownIssues: l.knownIssues ?? "",
            serialVerified: l.grade !== "FOR_PARTS",
            originalBox: l.accessories.some((a) => /box|packaging/i.test(a)),
            inspectedBy: l.seller === "techhaven" ? "REGEAR" : "SELLER",
          },
        },
      },
    });
    for (let v = 0; v < 3; v++) {
      const img = await makeImage("public", `${l.brand} ${l.model}`, getCategory(l.category)!.singular, i, v, l.category);
      await db.upload.create({ data: { ...img, ownerId: seller.userId, listingId: listing.id, position: v, alt: l.title } });
    }
    listingIds.push(listing.id);
  }

  console.log("Creating sample orders…");
  async function order(listingIndex: number, buyerId: string, status: string, extra: { daysAgo: number; events: [string, string][] }) {
    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingIds[listingIndex] }, include: { images: { take: 1, orderBy: { position: "asc" } } } });
    const fees = calculateFees(listing.priceCents, listing.shippingCents, 500);
    const t = (d: number) => new Date(Date.now() - d * 86_400_000);
    const o = await db.order.create({
      data: {
        number: generateOrderNumber(Date.now() - extra.daysAgo * 86_400_000),
        buyerId,
        sellerId: listing.sellerId,
        listingId: listing.id,
        priceCents: listing.priceCents,
        shippingCents: listing.shippingCents,
        platformFeeCents: fees.platformFeeCents,
        totalCents: fees.totalCents,
        status,
        returnWindowDays: listing.returnWindowDays,
        shippingAddress: JSON.stringify({ fullName: "Bima Buyer", phone: "+62 811 1111 1111", line1: "Jl. Merdeka No. 10", line2: "", city: "Jakarta", region: "DKI Jakarta", postalCode: "10110", country: "Indonesia" }),
        listingSnapshot: JSON.stringify({ title: listing.title, slug: listing.slug, conditionGrade: listing.conditionGrade, imageKey: listing.images[0]?.key ?? null, warrantyType: listing.warrantyType, warrantyMonths: listing.warrantyMonths, warrantyTerms: listing.warrantyTerms }),
        paymentRef: `sim_ch_${randomBytes(6).toString("hex")}`,
        paidAt: t(extra.daysAgo),
        shippedAt: ["SHIPPED", "DELIVERED", "COMPLETED", "DISPUTED"].includes(status) ? t(extra.daysAgo - 1) : null,
        carrier: ["SHIPPED", "DELIVERED", "COMPLETED", "DISPUTED"].includes(status) ? "JNE" : null,
        trackingNumber: ["SHIPPED", "DELIVERED", "COMPLETED", "DISPUTED"].includes(status) ? `JNE${randomBytes(5).toString("hex").toUpperCase()}` : null,
        deliveredAt: ["DELIVERED", "COMPLETED", "DISPUTED"].includes(status) ? t(extra.daysAgo - 3) : null,
        completedAt: status === "COMPLETED" ? t(extra.daysAgo - 5) : null,
        createdAt: t(extra.daysAgo),
        events: { create: extra.events.map(([type, message], i) => ({ type, message, createdAt: t(extra.daysAgo - i) })) },
      },
    });
    await db.listing.update({ where: { id: listing.id }, data: { status: status === "COMPLETED" ? "SOLD" : "RESERVED" } });
    return o;
  }

  const completed = await order(12, buyer.id, "COMPLETED", {
    daysAgo: 20,
    events: [["PAID", "Payment received and held securely by ReGear."], ["SHIPPED", "Shipped with JNE."], ["DELIVERED", "Buyer confirmed delivery."], ["COMPLETED", "Buyer accepted the item. Payment released to the seller."]],
  });
  await db.review.create({ data: { orderId: completed.id, sellerId: sellers.techhaven.id, buyerId: buyer.id, rating: 5, comment: "Exactly as described — the condition report was spot on. Fast shipping too!" } });
  await db.sellerProfile.update({ where: { id: sellers.techhaven.id }, data: { ratingAvg: 5, ratingCount: 1, salesCount: 1 } });

  await order(7, buyer.id, "SHIPPED", { daysAgo: 2, events: [["PAID", "Payment received and held securely by ReGear."], ["SHIPPED", "Shipped with JNE."]] });
  await order(14, buyer2.id, "PAID", { daysAgo: 1, events: [["PAID", "Payment received and held securely by ReGear."]] });

  const disputed = await order(10, buyer2.id, "DISPUTED", {
    daysAgo: 6,
    events: [["PAID", "Payment received."], ["SHIPPED", "Shipped with JNE."], ["DELIVERED", "Buyer confirmed delivery."], ["DISPUTE_OPENED", "Buyer opened a dispute. Payment is frozen until ReGear resolves it."]],
  });
  await db.dispute.create({
    data: {
      orderId: disputed.id,
      openedById: buyer2.id,
      reason: "NOT_AS_DESCRIBED",
      description: "The fan noise is much louder than described — it rattles at around 60% fan speed, not only at 100% as the report said.",
      messages: {
        create: [
          { authorId: buyer2.id, authorRole: "BUYER", body: "The fan noise is much louder than described — it rattles at around 60% fan speed, not only at 100% as the report said." },
          { authorId: sellers.pcparts.userId, authorRole: "SELLER", body: "Sorry to hear that. It was only audible at full speed when I tested it. Happy to offer a partial refund for a fan replacement." },
        ],
      },
    },
  });

  await db.favorite.createMany({ data: [listingIds[0], listingIds[3], listingIds[7]].map((listingId) => ({ userId: buyer.id, listingId })) });

  console.log("\nSeed complete. Demo accounts (password for all: %s)", DEMO_PASSWORD);
  console.table([
    { role: "Admin", email: admin.email },
    { role: "Buyer", email: buyer.email },
    { role: "Buyer (dispute)", email: buyer2.email },
    { role: "Seller (verified)", email: "techhaven@regear.test" },
    { role: "Seller (verified)", email: "camerabay@regear.test" },
    { role: "Seller (pending verification)", email: "pcparts@regear.test" },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
