const values = new Map();
const timers = new Map();

function clearTimer(key) {
  const timer = timers.get(key);
  if (timer) clearTimeout(timer);
  timers.delete(key);
}

// Single-process development presence store. It keeps the existing Redis-shaped
// API so the realtime code does not need to change, but no Redis server is
// required for local development.
export const redis = {
  async set(key, value, mode, ttlSeconds) {
    clearTimer(key);
    values.set(key, value);
    if (mode === "EX" && Number(ttlSeconds) > 0) {
      const timer = setTimeout(() => {
        values.delete(key);
        timers.delete(key);
      }, Number(ttlSeconds) * 1000);
      timer.unref?.();
      timers.set(key, timer);
    }
    return "OK";
  },
  async get(key) {
    return values.get(key) ?? null;
  },
  async del(key) {
    clearTimer(key);
    return values.delete(key) ? 1 : 0;
  },
  async ping() {
    return "PONG";
  },
  async quit() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    values.clear();
    return "OK";
  },
};
