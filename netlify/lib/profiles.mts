import { createHash } from "node:crypto";

export const AVATAR_STORE = "profile-avatars";

// Blob keys are hashed so account emails never appear in storage paths.
export function avatarKey(email: string) {
  return createHash("sha256").update("ofs-avatar:" + email).digest("hex") + "/avatar";
}

// The version query busts browser caches whenever a new photo is uploaded.
export function avatarUrl(row: { avatar_key?: unknown; avatar_updated_at?: unknown } | undefined) {
  if (!row?.avatar_key) return null;
  const at = row.avatar_updated_at ? new Date(String(row.avatar_updated_at)).getTime() : 0;
  return "/api/profile/avatar?v=" + (at || 1);
}
