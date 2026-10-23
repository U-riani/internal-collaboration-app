import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { BellRing, Play, Volume2 } from "lucide-react";
import {
  pushSupported, isIosHomeScreenRequired, pushPreferenceEnabled,
  getWebPushConfiguration, browserHasPushSubscription,
  enableBrowserPush, disableBrowserPush,
} from "../lib/pushNotifications.js";
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
  const [push, setPush] = useState({
    supported: pushSupported(),
    loading: true,
    configured: false,
    publicKey: null,
    subscribed: false,
    busy: false,
    error: "",
  });
  const iphoneNeedsInstall = push.supported && isIosHomeScreenRequired();

  useEffect(() => {
    let active = true;
    if (!pushSupported()) {
      setPush((old) => ({ ...old, loading: false }));
      return;
    }
    Promise.all([
      getWebPushConfiguration(),
      browserHasPushSubscription(),
    ]).then(([config, subscribed]) => {
      if (active) setPush((old) => ({
        ...old,
        configured: config.enabled,
        publicKey: config.publicKey,
        subscribed: subscribed && pushPreferenceEnabled(user.id),
        loading: false,
      }));
    }).catch((error) => {
      if (active) setPush((old) => ({
        ...old, loading: false, error: error.message,
      }));
    });
    return () => { active = false; };
  }, [user.id]);

  async function enablePush() {
    setPush((old) => ({ ...old, busy: true, error: "" }));
    try {
      // Keep the native permission prompt inside the user's click gesture.
      await enableBrowserPush(user.id, push.publicKey);
      setPush((old) => ({ ...old, subscribed: true, busy: false }));
    } catch (error) {
      setPush((old) => ({ ...old, busy: false, error: error.message }));
    }
  }

  async function disablePush() {
    setPush((old) => ({ ...old, busy: true, error: "" }));
    try {
      await disableBrowserPush(user.id);
      setPush((old) => ({ ...old, subscribed: false, busy: false }));
    } catch (error) {
      setPush((old) => ({
        ...old, subscribed: false, busy: false, error: error.message,
      }));
    }
  }

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
      <section className="card mb-5 max-w-lg p-6" aria-labelledby="web-push-heading">
        <h2 id="web-push-heading" className="flex items-center gap-2 font-semibold">
          <BellRing size={18} /> Web push notifications
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Receive message, task, approval and system alerts on this device,
          even after closing the website. Browser permission is required.
          Each browser must be enabled separately.
        </p>
        {iphoneNeedsInstall && (
          <p className="mt-3 text-sm text-amber-700">
            On iPhone, open this website in Safari, choose Share → Add to Home
            Screen, then launch GTEX Collaboration from the Home Screen to
            enable notifications.
          </p>
        )}
        {!push.supported && (
          <p className="mt-3 text-sm text-amber-700">
            This browser does not support Web Push here. Use a compatible browser
            over HTTPS, or localhost for desktop development.
          </p>
        )}
        {push.supported && !push.loading && !push.configured && (
          <p className="mt-3 text-sm text-amber-700">
            Web Push is not configured on this server. An administrator must
            configure the VAPID keys first.
          </p>
        )}
        {push.supported && Notification.permission === "denied" && (
          <p className="mt-3 text-sm text-amber-700">
            Browser notifications are blocked. Allow them in this site's
            browser permissions before enabling push.
          </p>
        )}
        {push.error && (
          <p role="alert" className="mt-3 text-sm text-red-600">{push.error}</p>
        )}
        {push.subscribed && (
          <p className="mt-3 text-sm text-green-700">
            Web Push is enabled on this browser.
          </p>
        )}
        <button
          type="button"
          className="btn-secondary mt-4"
          disabled={push.loading || push.busy || !push.supported ||
            (!push.subscribed && (!push.configured || iphoneNeedsInstall ||
              Notification.permission === "denied"))}
          onClick={push.subscribed ? disablePush : enablePush}
        >
          {push.busy ? "Updating…" : push.subscribed
            ? "Disable push notifications" : "Enable push notifications"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          While this tab is active, existing real-time notifications and custom
          sounds remain in use. Background sounds depend on device settings.
        </p>
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
