import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken, refreshSession } from "../lib/api.js";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;

    // The Flutter WebView is authenticated by its native secure-storage session,
    // not by the browser refresh cookie. The token is transferred only through
    // the in-memory JS bridge on our own HTTPS origin (never via a URL).
    if (window.location.pathname.startsWith("/mobile/sheets/")) {
      const handleMobileSession = async (event) => {
        const token = event.detail?.token;
        if (!token || !active) {
          if (active) setLoading(false);
          return;
        }
        setAccessToken(token);
        try {
          // Establish a dedicated WebView refresh cookie so editing stays
          // authenticated even after the native access token expires.
          const result = await api("/auth/mobile-webview-session", {
            method: "POST",
          }, false);
          setAccessToken(result.data.accessToken);
          if (active) setUser(result.data.user);
        } catch {
          setAccessToken(null);
          if (active) setUser(null);
        } finally {
          if (active) setLoading(false);
        }
      };
      window.addEventListener("collab-mobile-session", handleMobileSession);
      window.CollaborationFlutter?.postMessage(JSON.stringify({ type: "ready" }));
      return () => {
        active = false;
        window.removeEventListener("collab-mobile-session", handleMobileSession);
      };
    }

    refreshSession()
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) setAccessToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const end = () => {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("collab:session-ended", end);
    return () => window.removeEventListener("collab:session-ended", end);
  }, [queryClient]);
  const value = useMemo(
    () => ({
      user,
      loading,
      async login(email, password) {
        const result = await api(
          "/auth/login",
          { method: "POST", body: JSON.stringify({ email, password }) },
          false,
        );
        queryClient.clear();
        setAccessToken(result.data.accessToken);
        setUser(result.data.user);
      },
      async logout() {
        try {
          await api("/auth/logout", { method: "POST" });
        } finally {
          setAccessToken(null);
          setUser(null);
          queryClient.clear();
        }
      },
      hasRole(role) {
        return user?.roles.includes(role);
      },
      hasPermission(permission) {
        return (
          user?.roles.includes("SYSTEM_ADMIN") ||
          user?.permissions.includes(permission)
        );
      },
    }),
    [user, loading, queryClient],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  return useContext(AuthContext);
}
