// Appearance preferences are intentionally independent of React providers.
// Only the authenticated workspace reads these preferences.
export const ACCENT_OPTIONS = Object.freeze([
  { id: "indigo", label: "Luminous Indigo", color: "#8179ff" },
  { id: "cyan", label: "Cyan Glaze", color: "#35c6de" },
  { id: "violet", label: "Electric Violet", color: "#c890f4" },
  { id: "sky", label: "Nordic Sky", color: "#9adff1" },
]);

export const THEME_OPTIONS = Object.freeze([
  { id: "midnight", label: "Dark Midnight" },
  { id: "oled", label: "OLED Pure Black" },
  { id: "slate", label: "Deep Slate" },
]);
export const THEME_EVENT = "collab:theme-preference-changed";
const themeIds = new Set(THEME_OPTIONS.map(({ id }) => id));
const DEFAULT_THEME = "midnight";

export function themeStorageKey(userId) {
  return `collab:theme:v1:${userId}`;
}

export function getThemePreference(userId) {
  if (!userId) return DEFAULT_THEME;
  try {
    const saved = window.localStorage.getItem(themeStorageKey(userId));
    return themeIds.has(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveThemePreference(userId, theme) {
  if (!userId || !themeIds.has(theme)) return false;
  try {
    window.localStorage.setItem(themeStorageKey(userId), theme);
  } catch {
    // Match accent behavior: preferences still apply for this session.
  }
  window.dispatchEvent(
    new CustomEvent(THEME_EVENT, { detail: { userId, theme } }),
  );
  return true;
}

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
