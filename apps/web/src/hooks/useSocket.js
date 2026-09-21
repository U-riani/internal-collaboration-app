import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getAccessToken, refreshSession } from "../lib/api.js";
let shared;
let count = 0;
let renewing = false;
let renewTimer = null;

function connection() {
  if (!shared) {
    shared = io({
      path: "/socket.io",
      auth: (cb) => cb({ token: getAccessToken() }),
    });

    const scheduleRenew = () => {
      if (renewTimer || !count || !shared || !getAccessToken()) return;
      renewTimer = window.setTimeout(() => {
        renewTimer = null;
        renew();
      }, 2000);
    };

    const renew = async () => {
      if (renewing || !getAccessToken()) return;
      renewing = true;
      try {
        await refreshSession();
        if (count && shared) shared.connect();
      } catch (error) {
        // refreshSession ends the login only for confirmed invalid sessions.
        // Network, server and rate-limit failures should retry instead.
        if (!error.sessionEnded) scheduleRenew();
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
        if (renewTimer) {
          window.clearTimeout(renewTimer);
          renewTimer = null;
        }
        const old = shared;
        shared = null;
        old.disconnect();
      }
    };
  }, []);
  return socketRef;
}
