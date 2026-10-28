import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Where stored files' bytes live: a folder on local disk, or Supabase Storage
// when it is configured (hosts like Vercel have no lasting disk). Both
// buckets are private; listing photos reach visitors through /media and ID
// documents only through the admin route. No "server-only" import, so the
// seed script can use it too.

export type Area = "public" | "private";

export type FileStore = {
  kind: "disk" | "supabase";
  /** Save a new file. Keys are random, so an existing file is never replaced. */
  put(area: Area, key: string, data: Buffer): Promise<void>;
  /** The file's bytes, or null if there is no such file. */
  get(area: Area, key: string): Promise<Buffer | null>;
  remove(area: Area, key: string): Promise<void>;
};

export type FileStoreConfig = { dir: string; supabaseUrl?: string; supabaseKey?: string };

export function createFileStore(config: FileStoreConfig): FileStore {
  if (config.supabaseUrl && config.supabaseKey) return supabaseStore(config.supabaseUrl, config.supabaseKey);
  return diskStore(config.dir);
}

const KEY_RE = /^[a-f0-9]{2}\/[a-f0-9]{32}\.(webp|jpg)$/;

function checkKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
}

function diskStore(dir: string): FileStore {
  const root = path.resolve(dir);
  const resolve = (area: Area, key: string) => {
    checkKey(key);
    const base = path.join(root, area);
    const full = path.join(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("Invalid storage key");
    return full;
  };
  return {
    kind: "disk",
    async put(area, key, data) {
      const full = resolve(area, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data, { flag: "wx", mode: area === "private" ? 0o600 : 0o644 });
    },
    async get(area, key) {
      try {
        return await readFile(resolve(area, key));
      } catch {
        return null;
      }
    },
    async remove(area, key) {
      try {
        await unlink(resolve(area, key));
      } catch {
        /* already gone */
      }
    },
  };
}

const BUCKETS: Record<Area, string> = { public: "listing-photos", private: "id-documents" };

function supabaseStore(projectUrl: string, key: string): FileStore {
  const base = `${projectUrl.replace(/\/+$/, "")}/storage/v1`;
  // Works for both the legacy service_role JWT and the newer sb_secret_ key.
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const call = (pathname: string, init: RequestInit = {}) =>
    fetch(`${base}${pathname}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(20_000) });
  const objectPath = (area: Area, k: string) => {
    checkKey(k);
    return `/object/${BUCKETS[area]}/${k}`;
  };

  async function createBucket(area: Area) {
    const res = await call("/bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: BUCKETS[area], name: BUCKETS[area], public: false, allowed_mime_types: ["image/webp"] }),
    });
    // Another request may have created it at the same moment.
    if (!res.ok && !(await res.text()).includes("already exists")) throw new Error(`Supabase Storage: creating bucket failed (${res.status})`);
  }

  async function upload(area: Area, k: string, data: Buffer) {
    return call(objectPath(area, k), {
      method: "POST",
      headers: { "Content-Type": "image/webp", "x-upsert": "false", "Cache-Control": "31536000" },
      body: new Uint8Array(data),
    });
  }

  return {
    kind: "supabase",
    async put(area, k, data) {
      let res = await upload(area, k, data);
      // The buckets are created on first use, so a new project needs no setup.
      if (!res.ok && (await res.clone().text()).includes("Bucket not found")) {
        await createBucket(area);
        res = await upload(area, k, data);
      }
      if (!res.ok) throw new Error(`Supabase Storage: upload failed (${res.status})`);
    },
    async get(area, k) {
      const res = await call(objectPath(area, k));
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      // Missing files (and missing buckets) answer 400 or 404; anything else is an outage, not "not found".
      if (res.status === 400 || res.status === 404) return null;
      throw new Error(`Supabase Storage: download failed (${res.status})`);
    },
    async remove(area, k) {
      const res = await call(objectPath(area, k), { method: "DELETE" });
      if (!res.ok && res.status !== 400 && res.status !== 404) throw new Error(`Supabase Storage: delete failed (${res.status})`);
    },
  };
}
