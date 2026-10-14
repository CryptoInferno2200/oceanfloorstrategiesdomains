import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

// Files arrive in raw binary chunks so large videos, archives, and datasets stay under the function body limit.
export const CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_FILE_BYTES = { member: 500 * 1024 * 1024, guest: 50 * 1024 * 1024 };
export const CHUNK_LIMIT_PER_HOUR = { member: 800, guest: 60 };

export type UploadManifest = {
  id: string;
  owner: string;
  name: string;
  type: string;
  size: number;
  parts: number;
  complete: boolean;
  createdAt: string;
};

export async function identityHash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requesterKey(context: Context) {
  const user = await getUser();
  const identity = await identityHash(String(user?.email || context.ip || "unknown").trim().toLowerCase());
  return { identity, member: Boolean(user) };
}

export function uploadStore() {
  return getStore({ name: "chat-uploads", consistency: "strong" });
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function loadManifest(id: string, owner: string) {
  if (!ID_PATTERN.test(id)) return null;
  const manifest = (await uploadStore().get(`${id}/manifest`, { type: "json" })) as UploadManifest | null;
  return manifest && manifest.owner === owner ? manifest : null;
}

export async function readUpload(manifest: UploadManifest) {
  const store = uploadStore();
  const bytes = new Uint8Array(manifest.size);
  let offset = 0;
  for (let part = 0; part < manifest.parts; part++) {
    const chunk = await store.get(`${manifest.id}/part-${part}`, { type: "arrayBuffer" });
    if (!chunk) throw new Error("Upload is missing data.");
    bytes.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
