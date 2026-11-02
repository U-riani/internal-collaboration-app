// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Avatar } from "../src/components/UI.jsx";
import { clearAvatarImageCache, invalidateUserAvatarCache } from "../src/lib/avatar-cache.js";
import { fetchAvatarImage } from "../src/lib/api.js";

vi.mock("../src/lib/api.js", () => ({
  downloadFile: vi.fn(),
  fetchAvatarImage: vi.fn(),
}));

const personId = "af46bebe-a963-4eb0-a54e-7e7f9792b31f";
const profileUrl = "/api/v1/users/" + personId + "/avatar?v=0";

beforeEach(() => {
  vi.clearAllMocks();
  clearAvatarImageCache();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:avatar-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.mocked(fetchAvatarImage).mockResolvedValue(new Blob(["photo"], { type: "image/png" }));
});

describe("shared user avatars", () => {
  it("loads a colleague photo by ID and shares the authenticated response across rows", async () => {
    const { container } = render(
      <>
        <Avatar name="Alice Smith" userId={personId} />
        <Avatar name="Alice Smith" userId={personId} small />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll(".avatar-image")).toHaveLength(2));
    expect(fetchAvatarImage).toHaveBeenCalledTimes(1);
    expect(fetchAvatarImage).toHaveBeenCalledWith(profileUrl);
  });

  it("keeps initials if the colleague has no uploaded photo", async () => {
    const missing = Object.assign(new Error("Missing"), { status: 404 });
    vi.mocked(fetchAvatarImage).mockRejectedValue(missing);
    const { container } = render(<Avatar name="Alice Smith" userId={personId} />);
    expect(screen.getByText("AS")).not.toBeNull();
    await waitFor(() => expect(fetchAvatarImage).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".avatar-image")).toBeNull();
  });

  it("does not request a photo when the API explicitly reports none", async () => {
    const { container } = render(<Avatar name="Alice Smith" userId={personId} photoUrl={null} />);
    expect(screen.getByText("AS")).not.toBeNull();
    expect(container.querySelector(".avatar-image")).toBeNull();
    expect(fetchAvatarImage).not.toHaveBeenCalled();
  });

  it("reloads the avatar when the current user changes their photo", async () => {
    const { container } = render(<Avatar name="Alice Smith" userId={personId} />);
    await waitFor(() => expect(container.querySelector(".avatar-image")).not.toBeNull());
    invalidateUserAvatarCache(personId);
    window.dispatchEvent(new CustomEvent("collab:avatar-updated", { detail: { userId: personId } }));
    await waitFor(() => expect(fetchAvatarImage).toHaveBeenCalledTimes(2));
  });
});
