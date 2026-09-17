import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { MessageSquareText } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-slate-950 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-blue-700 to-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-3 text-xl font-bold">
          <MessageSquareText /> Workspace
        </div>
        <div>
          <h1 className="max-w-xl text-5xl font-bold leading-tight">
            Communication, tasks, and approvals under your control.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-blue-100">
            A focused internal workspace designed around the workflows your
            organization actually uses.
          </p>
        </div>
        <p className="text-sm text-blue-200">
          A shared space for your team’s daily work.
        </p>
      </div>
      <div className="grid place-items-center p-6">
        <form onSubmit={submit} className="card w-full max-w-md p-8">
          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to your organization workspace.
          </p>
          {error && (
            <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <label className="mt-6 block text-sm font-semibold">
            Email
            <input
              className="input mt-2"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="mt-4 block text-sm font-semibold">
            Password
            <input
              className="input mt-2"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn-primary mt-6 w-full" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-5 text-center text-xs text-slate-400">
            Need an account? Contact your workspace administrator.
          </p>
        </form>
      </div>
    </div>
  );
}
