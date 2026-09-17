import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { Field, ErrorBox } from "../components/UI.jsx";
export default function AccountPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => logout(),
  });
  return (
    <>
      <PageHeader title="My account" description={user.email} />
      <form
        className="card p-6 max-w-lg"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-semibold">Change password</h2>
        <p className="text-sm text-slate-500 mt-2 mb-5">
          Use at least 12 characters. After saving, sign in again with your new
          password on each device.
        </p>
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        {confirmation && newPassword !== confirmation && (
          <p className="text-xs text-red-600 mt-2">Passwords do not match.</p>
        )}
        <ErrorBox error={save.error} />
        <button
          className="btn-primary mt-5"
          disabled={save.isPending || newPassword !== confirmation}
        >
          Save password
        </button>
      </form>
    </>
  );
}
