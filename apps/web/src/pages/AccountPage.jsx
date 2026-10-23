import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { BellRing, Play, Volume2 } from "lucide-react";
import {
  pushSupported, isIosHomeScreenRequired, pushPreferenceEnabled,
  getWebPushConfiguration, browserPushStatus, sendTestPush,
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
    registered: false,
    linked: false,
    busy: false,
    error: "",
    result: "",
  });
  const iphoneNeedsInstall = isIosHomeScreenRequired();

  useEffect(() => {
    let active = true;
    async function load() {
      if (!pushSupported()) {
        if (active) setPush((old) => ({ ...old, loading: false }));
        return;
      }
      try {
        const config = await getWebPushConfiguration();
        let status = { browserSubscribed: false, linked: false };
        try {
          status = await browserPushStatus(user.id);
        } catch {
          // The status endpoint might be temporarily unavailable.
        }
        if (active) setPush((old) => ({
          ...old,
          configured: config.enabled,
          publicKey: config.publicKey,
          registered: status.browserSubscribed,
          linked: status.linked,
          subscribed: status.browserSubscribed && pushPreferenceEnabled(user.id),
          loading: false,
        }));
      } catch (error) {
        if (active) setPush((old) => ({
          ...old, loading: false, error: error.message,
        }));
      }
    }
    void load();
    return () => { active = false; };
  }, [user.id]);

  async function enablePush() {
    setPush((old) => ({ ...old, busy: true, error: "", result: "" }));
    try {
      // The browser permission prompt occurs directly inside this click event.
      await enableBrowserPush(user.id, push.publicKey);
      const status = await browserPushStatus(user.id);
      setPush((old) => ({
        ...old,
        subscribed: true,
        registered: true,
        linked: status.linked,
        busy: false,
        result: status.linked
          ? "Push enabled and saved on the server. Use Send test notification."
          : "Browser subscribed, but server registration could not be verified.",
      }));
    } catch (error) {
      setPush((old) => ({ ...old, busy: false, error: error.message }));
    }
  }

  async function disablePush() {
    setPush((old) => ({ ...old, busy: true, error: "", result: "" }));
    try {
      await disableBrowserPush(user.id);
      setPush((old) => ({
        ...old, subscribed: false, registered: false, linked: false,
        busy: false, result: "Push disabled on this browser.",
      }));
    } catch (error) {
      setPush((old) => ({
        ...old, subscribed: false, registered: false, linked: false,
        busy: false, error: error.message,
      }));
    }
  }

  async function testPush() {
    setPush((old) => ({ ...old, busy: true, error: "", result: "" }));
    try {
      const result = await sendTestPush(user.id);
      setPush((old) => ({
        ...old, busy: false,
        result: `Gateway accepted push (HTTP ${result.status}). Check your Windows / Android / iPhone notifications. Delivery to the screen is not guaranteed by the gateway.`,
      }));
    } catch (error) {
      setPush((old) => ({ ...old, busy: false, error: error.message }));
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
          Receive desktop and mobile system notifications when the website
          is in the background or closed. Each browser must be enabled separately.
        </p>

        {iphoneNeedsInstall && (
          <p className="mt-3 text-sm text-amber-700">
            iPhone: Open this website in Safari, select Share → Add to Home Screen,
            then open GTEX Collaboration from its Home Screen icon. Enable push
            inside the installed web app, not an ordinary browser tab.
          </p>
        )}
        {!push.supported && !iphoneNeedsInstall && (
          <p className="mt-3 text-sm text-amber-700">
            Web Push is unavailable. Use a compatible browser over HTTPS,
            or localhost for desktop development.
          </p>
        )}
        {push.supported && !push.loading && !push.configured && (
          <p className="mt-3 text-sm text-amber-700">
            The API is missing valid matching VAPID keys. Configure
            PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY, and
            PUSH_VAPID_SUBJECT in the backend environment, then restart it.
          </p>
        )}
        {push.supported && Notification.permission === "denied" && (
          <p className="mt-3 text-sm text-amber-700">
            Notifications are blocked. Allow them in this site's browser
            permissions and in your device's notification settings.
          </p>
        )}

        <div className="mt-4 space-y-1 text-xs text-slate-600" role="status">
          <div>Browser support: {push.supported ? "Supported" : "Unavailable"}</div>
          {push.supported && (
            <>
              <div>Permission: {Notification.permission}</div>
              <div>Backend VAPID: {push.configured ? "Valid" : "Not configured"}</div>
              <div>Browser subscription: {push.registered ? "Present" : "Not registered"}</div>
              <div>Current account/session: {push.linked ? "Linked" : "Not linked"}</div>
            </>
          )}
        </div>

        {push.error && (
          <p role="alert" className="mt-3 text-sm text-red-600">{push.error}</p>
        )}
        {push.result && (
          <p role="status" className="mt-3 text-sm text-blue-700">{push.result}</p>
        )}
        {push.subscribed && !push.linked && (
          <p className="mt-3 text-sm text-amber-700">
            A browser subscription exists but is not linked to your current
            session. Disable and re-enable push, then send a test notification.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={push.loading || push.busy || !push.supported ||
              (!push.subscribed && (!push.configured || iphoneNeedsInstall ||
                Notification.permission === "denied"))}
            onClick={push.subscribed ? disablePush : enablePush}
          >
            {push.busy ? "Working…" : push.subscribed
              ? "Disable push notifications" : "Enable push notifications"}
          </button>
          {push.subscribed && (
            <button
              type="button"
              className="btn-secondary"
              disabled={push.busy || !push.linked}
              onClick={testPush}
            >
              Send test notification
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The test sends a real push through the browser gateway. System
          notification sounds depend on your device settings; custom in-app
          sounds remain active for Socket.IO events.
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
