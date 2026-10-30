import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        Loading application…
      </div>
    );
  if (!user && window.location.pathname.startsWith("/mobile/sheets/")) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center text-slate-600">
        Session unavailable. Return to the app and sign in again.
      </div>
    );
  }
  if (!user) return (
    <Navigate to="/login" replace state={{
      from: location.pathname + location.search + location.hash,
    }} />
  );
  return children;
}
