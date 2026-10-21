import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata as SharpMetadata } from "sharp";
import { env } from "@/lib/env";

// File storage on local disk. Public images live under <STORAGE_DIR>/public
// and are served by /media/[...key]; identity documents live under
// <STORAGE_DIR>/private and are only streamed to admins.
// Swap these functions for an S3/R2 implementation in multi-node deployments.

const ROOT = path.resolve(env.STORAGE_DIR);
const PUBLIC_DIR = path.join(ROOT, "public");
const PRIVATE_DIR = path.join(ROOT, "private");

const KEY_RE = /^[a-f0-9]{2}\/[a-f0-9]{32}\.(webp|jpg)$/;

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_DIMENSION = 1600;

export class InvalidImageError extends Error {}

function newKey(ext: "webp" | "jpg") {
  const name = randomBytes(16).toString("hex");
  return `${name.slice(0, 2)}/${name}.${ext}`;
}

function resolveKey(base: string, key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
  const full = path.join(base, key);
  if (!full.startsWith(base + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/**
 * Decode, validate and re-encode an untrusted image. Re-encoding strips EXIF
 * (GPS location, device serials), neutralises polyglot files and normalises
 * orientation. Anything sharp cannot decode as a real raster image is rejected.
 */
async function processImage(input: Buffer, quality: number) {
  let meta: SharpMetadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new InvalidImageError("File is not a valid image");
  }
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) {
    throw new InvalidImageError("Use JPEG, PNG, WebP or AVIF images");
  }
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) {
    throw new InvalidImageError("Images must be at least 200×200 pixels");
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError("Could not process image");
  }
}

export async function savePublicImage(input: Buffer) {
  const { data, info } = await processImage(input, 82);
  const key = newKey("webp");
  const full = resolveKey(PUBLIC_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { flag: "wx" });
  return { key, width: info.width, height: info.height, bytes: data.length };
}

export async function savePrivateDocument(input: Buffer) {
  const { data } = await processImage(input, 88);
  const key = newKey("webp");
  const full = resolveKey(PRIVATE_DIR, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data, { flag: "wx", mode: 0o600 });
  return { key };
}

export async function readPublicImage(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveKey(PUBLIC_DIR, key));
  } catch {
    return null;
  }
}

export async function readPrivateDocument(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolveKey(PRIVATE_DIR, key));
  } catch {
    return null;
  }
}

export async function deletePublicImage(key: string) {
  try {
    await unlink(resolveKey(PUBLIC_DIR, key));
  } catch {
    /* already gone */
  }
}
