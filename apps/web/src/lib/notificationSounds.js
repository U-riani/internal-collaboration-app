// Sounds are synthesized in the browser so no audio downloads or dependencies are needed.
const preferenceKey = (userId) => `collab:notification-sounds:${userId}`;

const patterns = {
  messages: {
    waveform: "sine",
    volume: 0.045,
    notes: [[880, 0, 0.10], [1174.66, 0.12, 0.13]],
  },
  tasks: {
    waveform: "triangle",
    volume: 0.035,
    notes: [[659.25, 0, 0.11], [783.99, 0.12, 0.14]],
  },
  approvals: {
    waveform: "sine",
    volume: 0.04,
    notes: [[523.25, 0, 0.10], [659.25, 0.11, 0.10], [783.99, 0.22, 0.16]],
  },
  system: {
    waveform: "triangle",
    volume: 0.035,
    notes: [[587.33, 0, 0.20]],
  },
};

let context = null;
const seenNotifications = new Set();
const MAX_SEEN_NOTIFICATIONS = 400;

export function notificationSoundCategory(type) {
  if (type === "MESSAGE" || type === "MESSAGE_REACTION" || type === "MENTION")
    return "messages";
  if (typeof type === "string" && type.startsWith("TASK_")) return "tasks";
  if (typeof type === "string" && type.startsWith("APPROVAL_"))
    return "approvals";
  return "system";
}

export function getNotificationSoundsEnabled(userId) {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(preferenceKey(userId)) !== "off";
  } catch {
    return true;
  }
}

export function setNotificationSoundsEnabled(userId, enabled) {
  if (!userId) return;
  try {
    window.localStorage.setItem(preferenceKey(userId), enabled ? "on" : "off");
  } catch {
    // The control still works for the current page if storage is blocked.
  }
}

function audioContext() {
  if (context) return context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    context = new AudioContextClass();
    return context;
  } catch {
    return null;
  }
}

// A real user gesture unlocks audio in browsers that restrict autoplay.
// We never replay notifications missed before audio became available.
export function installNotificationAudioUnlock() {
  const unlock = () => {
    const audio = audioContext();
    if (!audio) return;
    if (audio.state === "running") {
      removeListeners();
      return;
    }
    audio.resume().then(() => {
      if (audio.state === "running") removeListeners();
    }).catch(() => {});
  };
  const removeListeners = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return removeListeners;
}

function play(category) {
  const audio = audioContext();
  if (!audio || audio.state !== "running") return false;
  const pattern = patterns[category] || patterns.system;
  const startTime = audio.currentTime + 0.012;
  try {
    for (const [frequency, offset, duration] of pattern.notes) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const begins = startTime + offset;
      oscillator.type = pattern.waveform;
      oscillator.frequency.setValueAtTime(frequency, begins);
      gain.gain.setValueAtTime(0.0001, begins);
      gain.gain.exponentialRampToValueAtTime(pattern.volume, begins + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, begins + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(begins);
      oscillator.stop(begins + duration + 0.015);
    }
    return true;
  } catch {
    // Unsupported or blocked audio must never interrupt notifications.
    return false;
  }
}

export async function previewNotificationSound(category) {
  const audio = audioContext();
  if (!audio) return false;
  if (audio.state !== "running") {
    try {
      await audio.resume();
    } catch {
      return false;
    }
  }
  return play(category);
}

// Only the application's global socket listener should call this function.
// Fetching the notification history or marking notifications read stays silent.
export function handleNotificationCreated(notification, userId) {
  if (!userId || !notification?.id) return false;
  const identifier = `${userId}:${notification.id}`;
  if (seenNotifications.has(identifier)) return false;
  seenNotifications.add(identifier);
  if (seenNotifications.size > MAX_SEEN_NOTIFICATIONS)
    seenNotifications.delete(seenNotifications.values().next().value);
  if (notification.isRead || !getNotificationSoundsEnabled(userId)) return false;
  return play(notificationSoundCategory(notification.type));
}
