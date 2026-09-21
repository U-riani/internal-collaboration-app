let accessToken = null;
localStorage.removeItem("collab_access_token");
let refreshPromise = null;

const SESSION_ENDED_CODES = new Set([
  "AUTH_REFRESH_REQUIRED",
  "AUTH_REFRESH_INVALID",
  "AUTH_REFRESH_USED",
  "AUTH_ACCOUNT_DISABLED",
  "AUTH_SESSION_EXPIRED",
]);

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

function sessionError(message, response, body = {}) {
  const error = new Error(message);
  error.status = response?.status;
  error.code = body.error?.code;
  error.details = body.error?.details;
  error.sessionEnded =
    response?.status === 401 && SESSION_ENDED_CODES.has(error.code);
  return error;
}

export async function refreshSession() {
  if (!refreshPromise) {
    const requestRefresh = () =>
      fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });

    // Serialize refresh-cookie rotation across tabs when Web Locks is available.
    refreshPromise = (
      navigator.locks
        ? navigator.locks.request("collab-refresh", requestRefresh)
        : requestRefresh()
    )
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw sessionError(
            body.error?.message || "Could not refresh session",
            response,
            body,
          );
        }
        setAccessToken(body.data.accessToken);
        return body.data;
      })
      .catch((error) => {
        if (error.sessionEnded) {
          setAccessToken(null);
          window.dispatchEvent(new Event("collab:session-ended"));
        }
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined)
    headers.set("content-type", "application/json");
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    await refreshSession();
    return api(path, options, false);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || "Request failed");
    error.code = body.error?.code;
    error.details = body.error?.details;
    throw error;
  }
  return body;
}

export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  return (await api("/files", { method: "POST", body: form })).data;
}

export async function downloadFile(id, filename) {
  async function get() {
    return fetch(`/api/v1/files/${id}/download`, {
      headers: { authorization: `Bearer ${getAccessToken()}` },
      credentials: "include",
    });
  }
  let response = await get();
  if (response.status === 401) {
    await refreshSession();
    response = await get();
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error?.message || "Download failed");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "download";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
