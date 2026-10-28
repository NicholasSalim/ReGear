import "server-only";
import { randomBytes } from "node:crypto";
import sharp, { type Metadata as SharpMetadata } from "sharp";
import { en } from "@/i18n/dictionaries/en";
import { env } from "@/lib/env";
import { createFileStore } from "@/lib/file-store";

// Uploaded images. Public images (listing photos) are served by
// /media/[...key]; identity documents are only streamed to admins. The bytes
// live under STORAGE_DIR, or in Supabase Storage when it is configured.

const store = createFileStore({ dir: env.STORAGE_DIR, supabaseUrl: env.SUPABASE_URL, supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY });

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 50_000_000;
const MAX_DIMENSION = 1600;

type ImageErrorCode = keyof typeof en.uploads.image;

/** A rejected upload. The message is English; the code picks the text shown to the uploader. */
export class InvalidImageError extends Error {
  readonly code: ImageErrorCode;
  constructor(code: ImageErrorCode) {
    super(en.uploads.image[code]);
    this.name = "InvalidImageError";
    this.code = code;
  }
}

function newKey(ext: "webp" | "jpg") {
  const name = randomBytes(16).toString("hex");
  return `${name.slice(0, 2)}/${name}.${ext}`;
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
    throw new InvalidImageError("notImage");
  }
  if (!meta.format || !["jpeg", "png", "webp", "avif", "heif"].includes(meta.format)) {
    throw new InvalidImageError("format");
  }
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) {
    throw new InvalidImageError("tooSmall");
  }
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidImageError("process");
  }
}

export async function savePublicImage(input: Buffer) {
  const { data, info } = await processImage(input, 82);
  const key = newKey("webp");
  await store.put("public", key, data);
  return { key, width: info.width, height: info.height, bytes: data.length };
}

export async function savePrivateDocument(input: Buffer) {
  const { data } = await processImage(input, 88);
  const key = newKey("webp");
  await store.put("private", key, data);
  return { key };
}

export async function readPublicImage(key: string): Promise<Buffer | null> {
  return store.get("public", key);
}

export async function readPrivateDocument(key: string): Promise<Buffer | null> {
  return store.get("private", key);
}

// Deleting is clean-up: a file that can't be removed now is logged, not an error for the caller.
export async function deletePublicImage(key: string) {
  await store.remove("public", key).catch((err) => console.error("could not delete image", key, err));
}

export async function deletePrivateDocument(key: string) {
  await store.remove("private", key).catch((err) => console.error("could not delete document", key, err));
}
