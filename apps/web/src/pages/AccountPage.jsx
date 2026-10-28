import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  KeyRound,
  Mail,
  MonitorCog,
  Play,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Avatar, ErrorBox, Field } from "../components/UI.jsx";
import {
  pushSupported,
  isIosHomeScreenRequired,
  pushPreferenceEnabled,
  getWebPushConfiguration,
  browserPushStatus,
  sendTestPush,
  enableBrowserPush,
  disableBrowserPush,
} from "../lib/pushNotifications.js";
import {
  getNotificationSoundsEnabled,
  setNotificationSoundsEnabled,
  previewNotificationSound,
} from "../lib/notificationSounds.js";
import "./account-page.css";

const tabs = [
  { id: "notifications", label: "Notifications", icon: BellRing },
  { id: "profile", label: "Profile", icon: ClipboardList },
  { id: "appearance", label: "Appearance & Theme", icon: MonitorCog },
  { id: "security", label: "Security", icon: KeyRound },
];

const soundOptions = [
  { category: "messages", label: "Messages", accent: "cyan" },
  { category: "tasks", label: "Tasks", accent: "lavender" },
  { category: "approvals", label: "Approvals", accent: "purple" },
  { category: "system", label: "System", accent: "sky" },
];

function roleLabel(roles = []) {
  const value = roles[0];
  if (value === "SYSTEM_ADMIN") return "IT Admin";
  if (value === "MANAGER") return "Manager";
  if (value === "AUDITOR") return "Auditor";
  if (value === "STORE") return "Store";
  return value ? value.replaceAll("_", " ").toLowerCase() : "Employee";
}

function PushStatusRow({ name, value, positive, loading }) {
  return (
    <div className="account-push-status-row">
      <span>{name}:</span>
      <span className={positive ? "account-push-ok" : "account-push-neutral"}>
        {loading ? (
          <span className="account-push-status-loading">Checking…</span>
        ) : positive ? (
          <CheckCircle2 size={12} aria-hidden="true" />
        ) : (
          <CircleAlert size={12} aria-hidden="true" />
        )}
        {loading ? "" : value}
      </span>
    </div>
  );
}

function AccountSecurity() {
  const { logout } = useAuth();
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
    <section className="account-settings-card account-security-card">
      <div className="account-card-heading">
        <span className="account-card-icon account-card-icon--violet"><ShieldCheck size={20} /></span>
        <div>
          <h2>Change password</h2>
          <p>Manage the security of your account</p>
        </div>
      </div>
      <p className="account-settings-description">
        Use at least 12 characters. After saving, sign in again with your new password on each device.
      </p>
      <form
        className="account-password-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!save.isPending && newPassword === confirmation) save.mutate();
        }}
      >
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <Field
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
          value={newPassword}
          onChange={(event) => setNew(event.target.value)}
        />
        <Field
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {confirmation && newPassword !== confirmation && (
          <p className="account-validation-error">Passwords do not match.</p>
        )}
        <ErrorBox error={save.error} />
        <button className="btn-primary account-save-password" disabled={save.isPending || newPassword !== confirmation}>
          {save.isPending ? "Saving…" : "Save password"}
        </button>
      </form>
    </section>
  );
}

function AccountNotifications({ userId }) {
  const [soundsEnabled, setSoundsEnabled] = useState(() => getNotificationSoundsEnabled(userId));
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
  const permission = push.supported ? Notification.permission : "unavailable";

  useEffect(() => {
    setSoundsEnabled(getNotificationSoundsEnabled(userId));
  }, [userId]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!pushSupported()) {
        if (active) setPush((previous) => ({ ...previous, loading: false }));
        return;
      }
      try {
        const config = await getWebPushConfiguration();
        let status = { browserSubscribed: false, linked: false };
        try {
          status = await browserPushStatus(userId);
        } catch {
          // The API can be temporarily unavailable. Show the browser status safely.
        }
        if (active) {
          setPush((previous) => ({
            ...previous,
            configured: config.enabled,
            publicKey: config.publicKey,
            registered: status.browserSubscribed,
            linked: status.linked,
            subscribed: status.browserSubscribed && pushPreferenceEnabled(userId),
            loading: false,
          }));
        }
      } catch (error) {
        if (active) setPush((previous) => ({ ...previous, loading: false, error: error.message }));
      }
    }
    void load();
    return () => { active = false; };
  }, [userId]);

  function updateSoundPreference(checked) {
    setSoundsEnabled(checked);
    setNotificationSoundsEnabled(userId, checked);
  }

  async function enablePush() {
    setPush((previous) => ({ ...previous, busy: true, error: "", result: "" }));
    try {
      // Request permission inside the click handler; Safari requires a user gesture.
      await enableBrowserPush(userId, push.publicKey);
      const status = await browserPushStatus(userId);
      setPush((previous) => ({
        ...previous,
        registered: true,
        linked: status.linked,
        subscribed: true,
        busy: false,
        result: status.linked
          ? "Push enabled and saved on the server. You can send a test notification."
          : "Browser subscribed, but server registration could not be verified.",
      }));
    } catch (error) {
      setPush((previous) => ({ ...previous, busy: false, error: error.message }));
    }
  }

  async function disablePush() {
    setPush((previous) => ({ ...previous, busy: true, error: "", result: "" }));
    try {
      await disableBrowserPush(userId);
      setPush((previous) => ({
        ...previous, subscribed: false, registered: false, linked: false,
        busy: false, result: "Push disabled on this browser.",
      }));
    } catch (error) {
      setPush((previous) => ({ ...previous, busy: false, error: error.message }));
    }
  }

  async function testPush() {
    setPush((previous) => ({ ...previous, busy: true, error: "", result: "" }));
    try {
      const result = await sendTestPush(userId);
      setPush((previous) => ({
        ...previous, busy: false,
        result: `Gateway accepted the push (HTTP ${result.status}). Check your device's notification center for delivery.`,
      }));
    } catch (error) {
      setPush((previous) => ({ ...previous, busy: false, error: error.message }));
    }
  }

  return (
    <div className="account-notifications-grid">
      <section className="account-settings-card account-sounds-card" aria-labelledby="account-sounds-title">
        <div className="account-card-heading">
          <span className="account-card-icon account-card-icon--violet"><Volume2 size={20} /></span>
          <div>
            <h2 id="account-sounds-title">Notification sounds</h2>
            <p>Real-time telemetry and chime events</p>
          </div>
          <label className="account-sounds-toggle">
            <input
              type="checkbox"
              aria-label="Enable notification sounds"
              checked={soundsEnabled}
              onChange={(event) => updateSoundPreference(event.target.checked)}
            />
            <span>{soundsEnabled ? "On" : "Off"}</span>
          </label>
        </div>
        <p className="account-settings-description">
          Play a distinct sound when a new message, task, approval, or system notification arrives.
          This preference is saved for this account in this browser.
        </p>
        <div className="account-soundboard">
          <p className="account-eyebrow">AUDIO SOUNDBOARD TRIGGERS</p>
          <div className="account-sound-grid">
            {soundOptions.map(({ category, label, accent }) => (
              <button
                key={category}
                type="button"
                className="btn-secondary account-sound-preview"
                disabled={!soundsEnabled}
                onClick={() => previewNotificationSound(category)}
                aria-label={`Preview ${label} sound`}
              >
                <Play size={13} fill="currentColor" className={`account-sound--${accent}`} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="account-settings-card account-push-card" aria-labelledby="account-push-title">
        <div className="account-card-heading">
          <span className="account-card-icon account-card-icon--cyan"><BellRing size={20} /></span>
          <div><h2 id="account-push-title">Web push notifications</h2></div>
        </div>
        <p className="account-settings-description">
          Receive desktop and mobile system notifications when the website is in the background
          or closed. Each browser must be enabled separately.
        </p>

        <div className="account-push-status" role="status" aria-label="Web push diagnostics">
          <PushStatusRow name="Browser support" value={push.supported ? "Supported" : "Unavailable"} positive={push.supported} />
          <PushStatusRow name="Permission" value={permission} positive={permission === "granted"} />
          <PushStatusRow name="Backend VAPID" value={push.configured ? "Valid" : "Unavailable"} positive={push.configured} loading={push.loading} />
          <PushStatusRow name="Browser subscription" value={push.registered ? "Present" : "Not registered"} positive={push.registered} loading={push.loading} />
          <PushStatusRow name="Current account/session" value={push.linked ? "Linked" : "Not linked"} positive={push.linked} loading={push.loading} />
        </div>

        {iphoneNeedsInstall && (
          <p className="account-push-warning">
            iPhone: open this site in Safari, choose Share → Add to Home Screen, then
            enable notifications inside the installed web app.
          </p>
        )}
        {!push.supported && !iphoneNeedsInstall && (
          <p className="account-push-warning">Web Push requires a supported browser and a secure connection.</p>
        )}
        {push.supported && !push.loading && !push.configured && !push.error && (
          <p className="account-push-warning">Web Push is not configured on the connected API.</p>
        )}
        {push.supported && permission === "denied" && (
          <p className="account-push-warning">Notifications are blocked. Update this site's browser permissions.</p>
        )}
        {push.subscribed && !push.linked && (
          <p className="account-push-warning">
            This browser has a subscription that is not linked to the current session.
            Disable and re-enable push, then try again.
          </p>
        )}
        {push.error && <p className="account-push-error" role="alert">{push.error}</p>}
        {push.result && <p className="account-push-result" role="status">{push.result}</p>}

        <div className="account-push-actions">
          <button
            type="button"
            className={`btn-secondary account-push-action ${push.subscribed ? "account-push-disable" : "account-push-enable"}`}
            disabled={
              push.loading || push.busy || !push.supported ||
              (!push.subscribed && (!push.configured || iphoneNeedsInstall || permission === "denied"))
            }
            onClick={push.subscribed ? disablePush : enablePush}
          >
            {push.subscribed ? <VolumeX size={15} /> : <BellRing size={15} />}
            {push.busy ? "Working…" : push.subscribed ? "Disable push notifications" : "Enable push notifications"}
          </button>
          {push.subscribed && (
            <button
              type="button"
              className="btn-secondary account-push-action account-push-test"
              disabled={push.busy || !push.linked}
              onClick={testPush}
            >
              <Play size={13} /> Send test notification
            </button>
          )}
        </div>
        <p className="account-push-footnote">
          The test sends a real push through the browser gateway. System notification sounds
          depend on device settings; custom in-app sounds remain active for Socket.IO events.
        </p>
      </section>
    </div>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("notifications");
  const displayName = user.displayName || user.firstName || user.email || "Workspace member";
  const role = roleLabel(user.roles);
  const photoUrl = user.avatarUrl || user.photoUrl;

  return (
    <div className="account-page">
      <header className="account-hero">
        <div className="account-identity">
          <div className="account-hero-avatar">
            {photoUrl ? (
              <img src={photoUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            ) : (
              <Avatar name={displayName} />
            )}
          </div>
          <div className="account-identity-copy">
            <div className="account-identity-title">
              <h1>{displayName}</h1>
              <span className="account-role-badge">{role}</span>
            </div>
            <p className="account-email"><Mail size={14} /> {user.email}</p>
            <p className="account-workspace-name"><span aria-hidden="true">✦</span> GTEX Workspace Enterprise</p>
          </div>
        </div>
        <nav className="account-tabs" aria-label="Account settings">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`account-tab ${activeTab === id ? "is-active" : ""}`}
              type="button"
              aria-current={activeTab === id ? "page" : undefined}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {activeTab === "notifications" && <AccountNotifications userId={user.id} />}
      {activeTab === "security" && <AccountSecurity />}
      {activeTab === "profile" && (
        <section className="account-settings-card account-pending-card">
          <div className="account-card-heading">
            <span className="account-card-icon account-card-icon--violet"><ClipboardList size={20} /></span>
            <div><h2>Profile</h2><p>Your account details</p></div>
          </div>
          <dl>
            <div><dt>Name</dt><dd>{displayName}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Role</dt><dd>{role}</dd></div>
          </dl>
          <p className="account-settings-description">Additional profile settings will be designed in the next phase.</p>
        </section>
      )}
      {activeTab === "appearance" && (
        <section className="account-settings-card account-pending-card">
          <div className="account-card-heading">
            <span className="account-card-icon account-card-icon--violet"><MonitorCog size={20} /></span>
            <div><h2>Appearance &amp; Theme</h2><p>Workspace display preferences</p></div>
          </div>
          <p className="account-settings-description">
            Appearance settings will be designed in the next phase. Your existing application theme remains unchanged.
          </p>
        </section>
      )}
    </div>
  );
}
