const USER_STORAGE_PREFIX = 'context_health_user:';

const LEGACY_PERSONAL_KEYS = new Set([
  'user_profile',
  'onboarding_completed',
  'ai_goals',
  'diet_custom_foods',
  'diet_recent_foods',
  'weekly_routine',
]);

const LEGACY_PERSONAL_PREFIXES = [
  'coach_msgs_',
  'coach_room_meta_',
  'coaching_insight_',
];

function prefixForUser(uid) {
  return uid ? `${USER_STORAGE_PREFIX}${encodeURIComponent(uid)}:` : '';
}

export function userStorageKey(uid, key) {
  const prefix = prefixForUser(uid);
  return prefix && key ? `${prefix}${key}` : '';
}

export function getUserStorage(uid, key) {
  const storageKey = userStorageKey(uid, key);
  if (!storageKey) return null;
  try { return localStorage.getItem(storageKey); } catch { return null; }
}

export function setUserStorage(uid, key, value) {
  const storageKey = userStorageKey(uid, key);
  if (!storageKey) return false;
  try {
    localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

export function removeUserStorage(uid, key) {
  const storageKey = userStorageKey(uid, key);
  if (!storageKey) return;
  try { localStorage.removeItem(storageKey); } catch {}
}

export function getUserStorageKeys(uid) {
  const prefix = prefixForUser(uid);
  if (!prefix) return [];
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length));
    }
  } catch {}
  return keys;
}

export function clearUserStorage(uid) {
  getUserStorageKeys(uid).forEach(key => removeUserStorage(uid, key));
}

export function clearLegacyPersonalStorage() {
  const keysToRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (LEGACY_PERSONAL_KEYS.has(key) || LEGACY_PERSONAL_PREFIXES.some(prefix => key?.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch {}
}

export function migrateLegacyPersonalStorage(uid) {
  if (!uid) return;
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (LEGACY_PERSONAL_KEYS.has(key) || LEGACY_PERSONAL_PREFIXES.some(prefix => key?.startsWith(prefix))) {
        entries.push([key, localStorage.getItem(key)]);
      }
    }
    entries.forEach(([key, value]) => {
      if (value !== null && getUserStorage(uid, key) === null) setUserStorage(uid, key, value);
      localStorage.removeItem(key);
    });
  } catch {}
}

export function prepareUserStorage(uid, cachedUid) {
  if (!uid) return;
  if (cachedUid === uid) migrateLegacyPersonalStorage(uid);
  else clearLegacyPersonalStorage();
}
