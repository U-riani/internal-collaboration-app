import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

export const ACCENT_OPTIONS = Object.freeze([
  { id: "indigo", label: "Luminous Indigo", swatch: "#8179ff" },
  { id: "cyan", label: "Cyan Glaze", swatch: "#35c6de" },
  { id: "violet", label: "Electric Violet", swatch: "#c890f4" },
  { id: "sky", label: "Nordic Sky", swatch: "#9adff1" },
]);

const accentIds = new Set(ACCENT_OPTIONS.map((option) => option.id));
const DEFAULT_ACCENT = "indigo";
const AppearanceContext = createContext(null);

export function appearanceStorageKey(userId) {
  return "collab:appearance:v1:" + userId;
}

export function loadAccent(userId) {
  if (!userId) return DEFAULT_ACCENT;
  try {
    const stored = JSON.parse(window.localStorage.getItem(appearanceStorageKey(userId)) || "null");
    return accentIds.has(stored?.accent) ? stored.accent : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function AppearanceProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [chosen, setChosen] = useState(null);
  // A new account never inherits the previous user's in-memory choice.
  const accent = chosen?.userId === userId ? chosen.accent : loadAccent(userId);

  const setAccent = useCallback((nextAccent) => {
    if (!userId || !accentIds.has(nextAccent)) return;
    setChosen({ userId, accent: nextAccent });
    try {
      window.localStorage.setItem(
        appearanceStorageKey(userId),
        JSON.stringify({ accent: nextAccent }),
      );
    } catch {
      // The current session can still use the choice if storage is blocked.
    }
  }, [userId]);

  const value = useMemo(
    () => ({ accent, setAccent, theme: "midnight" }),
    [accent, setAccent],
  );
  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("AppearanceProvider is missing");
  }
  return context;
}
