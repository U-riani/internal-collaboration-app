import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getAccessToken, refreshSession } from "../lib/api.js";
let shared;
let count = 0;
let renewing = false;
function connection() {
  if (!shared) {
    shared = io({
      path: "/socket.io",
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    const renew = async () => {
      if (renewing || !getAccessToken()) return;
      renewing = true;
      try {
        await refreshSession();
        if (count && shared) shared.connect();
      } catch {
        window.dispatchEvent(new Event("collab:session-ended"));
      } finally {
        renewing = false;
      }
    };
    shared.on("disconnect", (reason) => {
      if (reason === "io server disconnect") renew();
    });
    shared.on("connect_error", (error) => {
      if (error.message === "Unauthorized") renew();
    });
  }
  return shared;
}
export function useSocket(handlers = {}) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const socketRef = useRef(null);
  useEffect(() => {
    if (!getAccessToken()) return;
    count++;
    const socket = connection();
    socketRef.current = socket;
    const handler = (event, ...args) => ref.current[event]?.(...args);
    const connected = () => ref.current.connect?.();
    socket.onAny(handler);
    socket.on("connect", connected);
    const heartbeat = setInterval(
      () => socket.emit("presence:heartbeat"),
      30000,
    );
    return () => {
      clearInterval(heartbeat);
      socket.offAny(handler);
      socket.off("connect", connected);
      count--;
      if (!count) {
        const old = shared;
        shared = null;
        old.disconnect();
      }
    };
  }, []);
  return socketRef;
}
