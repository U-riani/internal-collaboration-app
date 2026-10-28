import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  BellRing,
  BadgeCheck,
  CheckCircle2,
  Circle,
  CircleAlert,
  ClipboardList,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MonitorCog,
  Play,
  Phone,
  RotateCcw,
  Trash2,
  Upload,
  UserRound,
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

function PasswordInput({ label, value, onChange, autoComplete, placeholder, visible, onToggle, minLength, maxLength, disabled }) {
  return (
    <div className="account-password-field">
      <Field label={label}>
        <input
          className="input account-password-input"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      </Field>
      <button
        type="button"
        className="account-password-eye"
        aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        onClick={onToggle}
        disabled={disabled}
      >
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </div>
  );
}

function AccountSecurity() {
  const { logout } = useAuth();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [revealed, setRevealed] = useState({
    current: false,
    next: false,
    confirm: false,
  });
  function toggleVisibility(key) {
    setRevealed((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  // Match the authenticated POST /auth/password schema (12–200 characters;
  // different from current). Confirmation is a frontend safeguard.
  const rules = [
    { id: "minimum", label: "At least 12 characters", met: newPassword.length >= 12 },
    { id: "maximum", label: "No more than 200 characters", met: newPassword.length > 0 && newPassword.length <= 200 },
    { id: "different", label: "Different from current password", met: currentPassword.length > 0 && newPassword.length > 0 && newPassword !== currentPassword },
    { id: "matching", label: "Confirmation matches new password", met: confirmation.length > 0 && newPassword === confirmation },
  ];
  const canSave =
    !save.isPending &&
    currentPassword.length >= 1 &&
    currentPassword.length <= 200 &&
    rules.every((rule) => rule.met);

  const save = useMutation({
    mutationFn: () =>
      api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    onSuccess: () => logout(),
  });

  return (
    <div className="account-security-grid">
      <section className="account-settings-card account-security-card" aria-labelledby="account-security-title">
        <div className="account-card-heading">
          <span className="account-card-icon account-card-icon--violet" aria-hidden="true">
            <RotateCcw size={20} />
          </span>
          <div>
            <h2 id="account-security-title">Change password</h2>
            <p>Credential encryption &amp; renewal</p>
          </div>
        </div>
        <p className="account-settings-description">
          Use at least 12 characters. After saving, sign in again with your new password on each device.
        </p>
        <form
          className="account-password-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          <PasswordInput
            label="Current password"
            placeholder="Enter current password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrent}
            maxLength={200}
            visible={revealed.current}
            onToggle={() => toggleVisibility("current")}
            disabled={save.isPending}
          />
          <PasswordInput
            label="New password"
            placeholder="At least 12 characters"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNew}
            minLength={12}
            maxLength={200}
            visible={revealed.next}
            onToggle={() => toggleVisibility("next")}
            disabled={save.isPending}
          />
          <PasswordInput
            label="Confirm new password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
            maxLength={200}
            visible={revealed.confirm}
            onToggle={() => toggleVisibility("confirm")}
            disabled={save.isPending}
          />
          {confirmation && newPassword !== confirmation && (
            <p className="account-validation-error" role="alert">Passwords do not match.</p>
          )}
          <ErrorBox error={save.error} />
          <button className="btn-primary account-save-password" disabled={!canSave}>
            {save.isPending ? "Saving…" : "Save password"}
          </button>
        </form>
      </section>

      <section className="account-settings-card account-password-policy" aria-labelledby="account-password-policy-title">
        <h2 id="account-password-policy-title">Password Policy Requirements</h2>
        <p>Requirements enforced by the current workspace authentication system.</p>
        <ul className="account-password-rules" aria-label="Password requirements">
          {rules.map((rule) => (
            <li key={rule.id} className={rule.met ? "is-met" : "is-pending"}>
              {rule.met
                ? <CheckCircle2 size={16} aria-hidden="true" />
                : <Circle size={16} aria-hidden="true" />}
              <span>{rule.label}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
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

function AccountProfile({ user, displayName, photoUrl }) {
  const departmentName = user.department?.name || "Not assigned";

  return (
    <div className="account-profile-grid">
      <section className="account-settings-card account-profile-photo-card" aria-labelledby="account-photo-title">
        <div className="account-card-heading">
          <span className="account-card-icon account-card-icon--violet" aria-hidden="true">
            <UserRound size={20} />
          </span>
          <div>
            <h2 id="account-photo-title">Avatar &amp; Badge</h2>
            <p>Public team picture representation</p>
          </div>
        </div>

        <div
          className="account-profile-dropzone"
          aria-disabled="true"
          title="Profile photo uploads are coming soon"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
        >
          <div className="account-profile-portrait" aria-hidden="true">
            <Avatar name={displayName} />
            {photoUrl && (
              <img
                src={photoUrl}
                alt=""
                onError={(event) => { event.currentTarget.style.display = "none"; }}
              />
            )}
          </div>
          <span className="account-profile-dropzone-caption">
            Drop image here or click to browse
          </span>
          <span className="account-profile-dropzone-hint">Photo changes coming soon</span>
        </div>

        <div className="account-profile-photo-actions">
          <button
            type="button"
            className="btn-primary account-profile-upload"
            disabled
            title="Photo upload will be available in a future update"
          >
            <Upload size={15} aria-hidden="true" />
            Upload new photo
          </button>
          <button
            type="button"
            className="btn-secondary account-profile-remove"
            disabled
            title="Photo removal will be available in a future update"
          >
            <Trash2 size={15} aria-hidden="true" />
            Remove
          </button>
        </div>
      </section>

      <section className="account-settings-card account-profile-info-card" aria-labelledby="account-personal-title">
        <div className="account-profile-info-header">
          <h2 id="account-personal-title">Personal Information</h2>
          <p>Details synced across Workspace Organization directories.</p>
        </div>

        <div className="account-profile-fields">
          <div className="account-profile-input-wrap">
            <Field label="Display name (Full name)">
              <input
                className="input account-profile-readonly"
                type="text"
                value={displayName}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <UserRound className="account-profile-input-icon" size={16} aria-hidden="true" />
          </div>

          <div className="account-profile-input-wrap">
            <Field label="Work email address">
              <input
                className="input account-profile-readonly"
                type="email"
                value={user.email || ""}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <BadgeCheck className="account-profile-input-icon account-profile-email-verified" size={18} aria-hidden="true" />
            <p className="account-profile-field-hint">
              Work email is managed by your workspace administrator and cannot be changed here.
            </p>
          </div>

          <div className="account-profile-contact-row">
            <div className="account-profile-input-wrap account-profile-department">
              <Field label="Department">
                <input
                  className="input account-profile-readonly"
                  type="text"
                  value={departmentName}
                  readOnly
                  aria-readonly="true"
                />
              </Field>
            </div>

            <div className="account-profile-input-wrap account-profile-phone">
              <Field label="Mobile phone number">
                <input
                  className="input account-profile-readonly"
                  type="tel"
                  value={user.phone || "Not provided"}
                  readOnly
                  aria-readonly="true"
                />
              </Field>
              <Phone className="account-profile-input-icon" size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
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
            <Avatar name={displayName} />
            {photoUrl && (
              <img src={photoUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
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
        <AccountProfile user={user} displayName={displayName} photoUrl={photoUrl} />
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
