// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountPage from "../src/pages/AccountPage.jsx";
import { previewNotificationSound, setNotificationSoundsEnabled } from "../src/lib/notificationSounds.js";
import { sendTestPush } from "../src/lib/pushNotifications.js";

vi.mock("../src/context/AuthContext.jsx", () => ({
  useAuth: () => ({
    user: {
      id: "profile-1",
      displayName: "Test Employee",
      email: "employee@example.com",
      department: { name: "Information Technology" },
      roles: ["SYSTEM_ADMIN"],
    },
    logout: vi.fn(),
  }),
}));
vi.mock("../src/lib/api.js", () => ({ api: vi.fn() }));
vi.mock("../src/lib/notificationSounds.js", () => ({
  getNotificationSoundsEnabled: vi.fn(() => true),
  setNotificationSoundsEnabled: vi.fn(),
  previewNotificationSound: vi.fn(async () => true),
}));
vi.mock("../src/lib/pushNotifications.js", () => ({
  pushSupported: vi.fn(() => true),
  isIosHomeScreenRequired: vi.fn(() => false),
  pushPreferenceEnabled: vi.fn(() => true),
  getWebPushConfiguration: vi.fn(async () => ({ enabled: true, publicKey: "key" })),
  browserPushStatus: vi.fn(async () => ({ browserSubscribed: true, linked: true })),
  sendTestPush: vi.fn(async () => ({ status: 201 })),
  enableBrowserPush: vi.fn(async () => true),
  disableBrowserPush: vi.fn(async () => true),
}));

function mountAccount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AccountPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Notification", { permission: "granted" });
});

describe("My Account notification design", () => {
  it("renders screenshot-inspired notifications panels and preserves sound controls", async () => {
    const user = userEvent.setup();
    mountAccount();
    expect(screen.getByText("Test Employee")).not.toBeNull();
    expect(screen.getByText("Notification sounds")).not.toBeNull();
    expect(screen.getByText("Web push notifications")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Preview Messages sound" }));
    expect(previewNotificationSound).toHaveBeenCalledWith("messages");
    await user.click(screen.getByRole("checkbox", { name: "Enable notification sounds" }));
    expect(setNotificationSoundsEnabled).toHaveBeenCalledWith("profile-1", false);
    expect(screen.getByRole("button", { name: "Preview Messages sound" }).disabled).toBe(true);
  });

  it("shows live push diagnostics and calls the real test function", async () => {
    const user = userEvent.setup();
    mountAccount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Send test notification" })).not.toBeNull());
    await user.click(screen.getByRole("button", { name: "Send test notification" }));
    await waitFor(() => expect(sendTestPush).toHaveBeenCalledWith("profile-1"));
    expect(screen.getByText(/Gateway accepted the push/)).not.toBeNull();
  });

  it("shows only read-only profile information and inactive photo controls", async () => {
    const user = userEvent.setup();
    mountAccount();
    await user.click(screen.getByRole("button", { name: "Profile" }));

    const name = screen.getByRole("textbox", { name: "Display name (Full name)" });
    const email = screen.getByRole("textbox", { name: "Work email address" });
    const department = screen.getByRole("textbox", { name: "Department" });

    expect(name.value).toBe("Test Employee");
    expect(email.value).toBe("employee@example.com");
    expect(department.value).toBe("Information Technology");
    expect(name.readOnly).toBe(true);
    expect(email.readOnly).toBe(true);
    expect(department.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: "Upload new photo" }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Remove" }).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
    expect(screen.queryByLabelText("Upload profile photo")).toBeNull();
  });

  it("keeps the existing password-change form on the Security tab", async () => {
    const user = userEvent.setup();
    mountAccount();
    await user.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByText("Change password")).not.toBeNull();
    expect(screen.getByText("Current password")).not.toBeNull();
    expect(screen.getByText("Confirm new password")).not.toBeNull();
  });
});
