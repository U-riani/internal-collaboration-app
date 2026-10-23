import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Play, Volume2 } from "lucide-react";
import {
  getNotificationSoundsEnabled,
  setNotificationSoundsEnabled,
  previewNotificationSound,
} from "../lib/notificationSounds.js";
import PageHeader from "../components/PageHeader.jsx";
import { Field, ErrorBox } from "../components/UI.jsx";
export default function AccountPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [soundsEnabled, setSoundsEnabled] = useState(() =>
    getNotificationSoundsEnabled(user.id),
  );
  const soundOptions = [
    { category: "messages", label: "Messages" },
    { category: "tasks", label: "Tasks" },
    { category: "approvals", label: "Approvals" },
    { category: "system", label: "System" },
  ];
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
      <section className="card mb-5 max-w-lg p-6" aria-labelledby="notification-sounds-heading">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="notification-sounds-heading" className="flex items-center gap-2 font-semibold">
              <Volume2 size={18} /> Notification sounds
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Play a distinct sound when a new message, task, approval, or system notification arrives.
              This preference is saved for this account in this browser.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={soundsEnabled}
              onChange={(event) => {
                setSoundsEnabled(event.target.checked);
                setNotificationSoundsEnabled(user.id, event.target.checked);
              }}
              aria-label="Enable notification sounds"
              className="h-4 w-4 accent-blue-600"
            />
            {soundsEnabled ? "On" : "Off"}
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {soundOptions.map(({ category, label }) => (
            <button
              key={category}
              type="button"
              className="btn-secondary flex items-center justify-center gap-2"
              disabled={!soundsEnabled}
              onClick={() => previewNotificationSound(category)}
              aria-label={`Preview ${label} sound`}
            >
              <Play size={14} />
              {label}
            </button>
          ))}
        </div>
      </section>
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
