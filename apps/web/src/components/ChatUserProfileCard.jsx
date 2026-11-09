import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Mail, Phone, X } from "lucide-react";
import { api } from "../lib/api.js";
import { Avatar } from "./UI.jsx";

const cardWidth = 362;
function cardPosition(bounds) {
  const width = Math.min(cardWidth, window.innerWidth - 20);
  const left = Math.max(10, Math.min(bounds.left, window.innerWidth - width - 10));
  const below = bounds.bottom + 9;
  const top = below + 305 > window.innerHeight && bounds.top > 320
    ? Math.max(10, bounds.top - 314)
    : Math.min(below, Math.max(10, window.innerHeight - 70));
  return { left, top, width };
}

function roleLabel(profile) {
  // Job title is the more precise role description shown on the reference card.
  if (profile?.jobTitle) return profile.jobTitle;
  const code = profile?.roles?.[0];
  return code ? code.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not provided";
}

function ContactRow({ Icon, title, value }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [value]);
  const copy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="chat-user-profile-contact">
      <span className="chat-user-profile-contact-icon"><Icon size={17} aria-hidden="true" /></span>
      <div className="chat-user-profile-contact-info">
        <span className="chat-user-profile-contact-label">{title}</span>
        <span className="chat-user-profile-contact-value">{value || "Not provided"}</span>
      </div>
      {value && (
        <button type="button" className="chat-user-profile-copy" aria-label={`Copy ${title.toLowerCase()}`} onClick={copy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

export default function ChatUserProfileCard({ userId, fallbackName, anchorRef, onClose }) {
  const cardRef = useRef(null);
  const [position, setPosition] = useState(null);
  const profile = useQuery({
    queryKey: ["chat-user-profile", userId],
    enabled: Boolean(userId),
    queryFn: () => api(`/users/${userId}`).then((response) => response.data),
    staleTime: 60_000,
    retry: false,
  });

  useLayoutEffect(() => {
    const reposition = () => {
      if (!anchorRef.current) return;
      setPosition(cardPosition(anchorRef.current.getBoundingClientRect()));
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const dismiss = (event) => {
      if (cardRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    };
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchorRef, onClose]);

  const person = profile.data;
  const name = person?.displayName || fallbackName;
  const root = anchorRef.current?.closest(".app-theme-dark") || document.body;
  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`${name} profile information`}
      className="chat-user-profile-card"
      style={{ ...position, visibility: position ? "visible" : "hidden" }}
    >
      <button type="button" className="chat-user-profile-close" aria-label="Close user profile" onClick={onClose}>
        <X size={17} />
      </button>
      <div className="chat-user-profile-heading">
        <Avatar className="chat-user-profile-avatar" name={name} userId={userId} photoUrl={person?.avatarUrl} />
        <div className="chat-user-profile-heading-name">{name}</div>
      </div>
      {profile.isPending ? (
        <p className="chat-user-profile-state" role="status">Loading profile…</p>
      ) : profile.isError ? (
        <p className="chat-user-profile-state" role="alert">Profile information could not be loaded.</p>
      ) : (
        <>
          <div className="chat-user-profile-fields">
            <div><span>Role</span><strong>{roleLabel(person)}</strong></div>
            <div><span>Department</span><strong>{person?.department?.name || "Not provided"}</strong></div>
          </div>
          <h3 className="chat-user-profile-section-title">Contact information</h3>
          <ContactRow Icon={Phone} title="Mobile Number" value={person?.phone} />
          <ContactRow Icon={Mail} title="Email Address" value={person?.email} />
        </>
      )}
    </div>,
    root,
  );
}
