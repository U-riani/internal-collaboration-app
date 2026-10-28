// Appearance preferences are intentionally independent of React providers.
// Only the authenticated workspace reads these preferences.
export const ACCENT_OPTIONS = Object.freeze([
  { id: "indigo", label: "Luminous Indigo", color: "#8179ff" },
  { id: "cyan", label: "Cyan Glaze", color: "#35c6de" },
  { id: "violet", label: "Electric Violet", color: "#c890f4" },
  { id: "sky", label: "Nordic Sky", color: "#9adff1" },
]);

export const ACCENT_EVENT = "collab:accent-preference-changed";
const DEFAULT_ACCENT = "indigo";
const accentIds = new Set(ACCENT_OPTIONS.map(({ id }) => id));

export function accentStorageKey(userId) {
  return `collab:accent:v1:${userId}`;
}

export function getAccentPreference(userId) {
  if (!userId) return DEFAULT_ACCENT;
  try {
    const stored = window.localStorage.getItem(accentStorageKey(userId));
    return accentIds.has(stored) ? stored : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function saveAccentPreference(userId, accent) {
  if (!userId || !accentIds.has(accent)) return false;
  try {
    window.localStorage.setItem(accentStorageKey(userId), accent);
  } catch {
    // Private browsing or blocked storage still allows session-only selection.
  }
  window.dispatchEvent(
    new CustomEvent(ACCENT_EVENT, { detail: { userId, accent } }),
  );
  return true;
}
