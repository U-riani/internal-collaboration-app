import { Check, CheckCircle2, Moon, Palette } from "lucide-react";
import { ACCENT_OPTIONS, useAppearance } from "../context/AppearanceContext.jsx";

const themeOptions = [
  {
    id: "midnight",
    title: "Dark Midnight",
    description: "Atmospheric glass with deep navy backdrops.",
  },
  {
    id: "oled",
    title: "OLED Pure Black",
    description: "Zero-luminance contrast for low-light use.",
  },
  {
    id: "slate",
    title: "Deep Slate",
    description: "Neutral charcoal and graphite tones.",
  },
  {
    id: "system",
    title: "System Sync",
    description: "Follow your device's light and dark appearance.",
  },
];

export default function AccountAppearance() {
  const { theme, accent, setAccent } = useAppearance();

  return (
    <div className="account-appearance-grid">
      <section className="account-settings-card account-appearance-workspace" aria-labelledby="appearance-workspace-heading">
        <div className="account-card-heading">
          <span className="account-card-icon account-card-icon--violet" aria-hidden="true">
            <Moon size={20} />
          </span>
          <div>
            <h2 id="appearance-workspace-heading">Workspace Appearance</h2>
            <p>Manage environmental luminosity and visual density</p>
          </div>
        </div>
        <div className="account-appearance-theme-grid" role="group" aria-label="Workspace themes">
          {themeOptions.map((option) => {
            const active = option.id === theme;
            const available = option.id === "midnight";
            return (
              <div
                key={option.id}
                className={`account-appearance-theme-card ${active ? "is-active" : ""} ${!available ? "is-upcoming" : ""}`}
                aria-label={option.title + (available ? ", active" : ", coming soon")}
              >
                <div className="account-appearance-theme-title">
                  <strong>{option.title}</strong>
                  {active ? <CheckCircle2 size={16} aria-label="Selected" /> : <span className="account-appearance-theme-radio" aria-hidden="true" />}
                </div>
                <div className={`account-appearance-theme-preview preview-${option.id}`} aria-hidden="true">
                  <div className="account-theme-preview-row">
                    <span className="account-theme-preview-dot" />
                    <span className="account-theme-preview-line" />
                  </div>
                  <div className="account-theme-preview-footer">
                    <span className="account-theme-preview-primary" />
                    <span className="account-theme-preview-secondary" />
                  </div>
                </div>
                <p>{option.description}</p>
                {!available && <span className="account-theme-coming-soon">Coming soon</span>}
              </div>
            );
          })}
        </div>
        <p className="account-appearance-note">
          Dark Midnight is available now. Other workspace palettes will be enabled after cross-module visual testing.
        </p>
      </section>
      <section className="account-settings-card account-appearance-accents" aria-labelledby="appearance-accent-heading">
        <div className="account-appearance-accent-heading">
          <h2 id="appearance-accent-heading">Accent Color</h2>
          <p>Sets the primary navigation, active tabs, button and focus highlight spectrum.</p>
        </div>
        <div className="account-accent-options" role="radiogroup" aria-label="Accent Color">
          {ACCENT_OPTIONS.map((option) => {
            const selected = accent === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`account-accent-option ${selected ? "is-selected" : ""}`}
                onClick={() => setAccent(option.id)}
              >
                <span className="account-accent-swatch" style={{ backgroundColor: option.swatch }} aria-hidden="true" />
                <span>{option.label}</span>
                {selected && <><span className="account-accent-active-label">Active</span><Check size={17} aria-hidden="true" /></>}
              </button>
            );
          })}
        </div>
        <p className="account-appearance-note">
          Your accent is saved for this account in this browser. Error, success and warning colors stay consistent.
        </p>
      </section>
    </div>
  );
}
