import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

// Files arrive in raw binary chunks so large videos, archives, and datasets stay under the function body limit.
export const CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_FILE_BYTES = { member: 500 * 1024 * 1024, guest: 50 * 1024 * 1024 };
export const CHUNK_LIMIT_PER_HOUR = { member: 800, guest: 60 };
// Guests on one network share a looser ceiling, so clearing cookies doesn't reset the quota.
export const GUEST_IP_CHUNK_LIMIT_PER_HOUR = 180;
export const START_LIMIT_PER_HOUR = { member: 120, guest: 20 };
// Total stored bytes per person; uploads expire after RETENTION_DAYS.
export const MAX_STORED_BYTES = { member: 2 * 1024 * 1024 * 1024, guest: 200 * 1024 * 1024 };
export const RETENTION_DAYS = 14;

const GUEST_COOKIE = "ofs_guest";

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

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// identity owns new uploads; owners lists every key whose uploads this requester may read,
// so a guest keeps their files after signing in on the same browser.
export async function requesterKey(context: Context) {
  const user = await getUser();
  const ip = await identityHash(String(context.ip || "unknown").trim().toLowerCase());
  let guest = context.cookies.get(GUEST_COOKIE) || "";
  if (!ID_PATTERN.test(guest)) guest = "";
  if (user?.email) {
    const identity = await identityHash(String(user.email).trim().toLowerCase());
    const owners = guest ? [identity, await identityHash("guest:" + guest)] : [identity];
    return { identity, owners, ip, member: true };
  }
  if (!guest) {
    guest = crypto.randomUUID();
    context.cookies.set({ name: GUEST_COOKIE, value: guest, path: "/api/", httpOnly: true, secure: true, sameSite: "Lax", maxAge: 60 * 60 * 24 * 30 });
  }
  const identity = await identityHash("guest:" + guest);
  // Older guest uploads were owned by the IP hash.
  return { identity, owners: [identity, ip], ip, member: false };
}

export function uploadStore() {
  return getStore({ name: "chat-uploads", consistency: "strong" });
}

export async function loadManifest(id: string, owners: string | string[]) {
  if (!ID_PATTERN.test(id)) return null;
  const manifest = (await uploadStore().get(`${id}/manifest`, { type: "json" })) as UploadManifest | null;
  return manifest && ([] as string[]).concat(owners).includes(manifest.owner) ? manifest : null;
}

export async function deleteUpload(id: string) {
  const store = uploadStore();
  const { blobs } = await store.list({ prefix: `${id}/` });
  await Promise.all(blobs.map((blob) => store.delete(blob.key)));
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
