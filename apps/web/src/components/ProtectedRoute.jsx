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
  if (!user) return (
    <Navigate to="/login" replace state={{
      from: location.pathname + location.search + location.hash,
    }} />
  );
  return children;
}
