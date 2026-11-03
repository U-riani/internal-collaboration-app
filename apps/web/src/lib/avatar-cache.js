import { api, fetchAvatarImage } from "./api.js";

// Share authenticated avatar responses across Message, Task and Drive rows.
// Capping stored bytes prevents keeping large original photos indefinitely.
const entries = new Map();
const MAX_ENTRIES = 120;
const MAX_BYTES = 24 * 1024 * 1024;
let cachedBytes = 0;
let avatarManifestPromise = null;
let avatarManifestLoadedAt = 0;
const MANIFEST_MAX_AGE_MS = 2 * 60 * 1000;

// A single authenticated request tells the whole workspace which colleagues
// actually have photos. Bare user IDs no longer trigger expected 404s.
export function cachedAvatarManifest() {
  if (avatarManifestPromise && Date.now() - avatarManifestLoadedAt < MANIFEST_MAX_AGE_MS)
    return avatarManifestPromise;

  const pending = api("/users/avatars").then((response) => response.data || {});
  const wrapped = pending.catch((error) => {
    if (avatarManifestPromise === wrapped) avatarManifestPromise = null;
    throw error;
  });
  avatarManifestPromise = wrapped;
  avatarManifestLoadedAt = Date.now();
  return wrapped;
}


function discard(key) {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  cachedBytes = Math.max(0, cachedBytes - entry.bytes);
}

function trim() {
  while (entries.size > MAX_ENTRIES || cachedBytes > MAX_BYTES) {
    const oldest = entries.keys().next().value;
    if (!oldest) break;
    discard(oldest);
  }
}

export function cachedAvatarImage(url) {
  const cached = entries.get(url);
  if (cached) return cached.promise;

  const entry = { bytes: 0, promise: null };
  entry.promise = fetchAvatarImage(url)
    .then((blob) => {
      if (entries.get(url) === entry) {
        entry.bytes = blob.size;
        cachedBytes += entry.bytes;
        trim();
      }
      return blob;
    })
    .catch((error) => {
      if (error.status === 404) return null;
      if (entries.get(url) === entry) discard(url);
      throw error;
    });
  entries.set(url, entry);
  trim();
  return entry.promise;
}

export function invalidateUserAvatarCache(userId) {
  if (!userId) return;
  avatarManifestPromise = null;
  const prefix = "/api/v1/users/" + userId + "/avatar";
  for (const url of entries.keys()) {
    if (url.startsWith(prefix)) discard(url);
  }
}

export function clearAvatarImageCache() {
  avatarManifestPromise = null;
  entries.clear();
  cachedBytes = 0;
}
