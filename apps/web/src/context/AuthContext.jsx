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
