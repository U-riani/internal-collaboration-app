// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Avatar } from "../src/components/UI.jsx";
import { clearAvatarImageCache, invalidateUserAvatarCache } from "../src/lib/avatar-cache.js";
import { api, fetchAvatarImage } from "../src/lib/api.js";

vi.mock("../src/lib/api.js", () => ({
  api: vi.fn(),
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
  vi.mocked(api).mockResolvedValue({ data: { [personId]: profileUrl } });
  vi.mocked(fetchAvatarImage).mockResolvedValue(new Blob(["photo"], { type: "image/png" }));
});

describe("shared user avatars", () => {
  it("loads known colleague photos once and shares the authenticated response across rows", async () => {
    const { container } = render(
      <>
        <Avatar name="Alice Smith" userId={personId} />
        <Avatar name="Alice Smith" userId={personId} small />
      </>,
    );
    await waitFor(() => expect(container.querySelectorAll(".avatar-image")).toHaveLength(2));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/users/avatars");
    expect(fetchAvatarImage).toHaveBeenCalledTimes(1);
    expect(fetchAvatarImage).toHaveBeenCalledWith(profileUrl);
  });

  it("keeps initials without requesting a missing photo when the manifest has no entry", async () => {
    vi.mocked(api).mockResolvedValue({ data: {} });
    const { container } = render(<Avatar name="Alice Smith" userId={personId} />);
    expect(screen.getByText("AS")).not.toBeNull();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".avatar-image")).toBeNull();
    expect(fetchAvatarImage).not.toHaveBeenCalled();
  });

  it("does not request a manifest or a photo when the API explicitly reports none", async () => {
    const { container } = render(<Avatar name="Alice Smith" userId={personId} photoUrl={null} />);
    expect(screen.getByText("AS")).not.toBeNull();
    expect(container.querySelector(".avatar-image")).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(fetchAvatarImage).not.toHaveBeenCalled();
  });

  it("falls back to initials if the avatar manifest is temporarily unavailable", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Unable to load avatars"));
    const { container } = render(<Avatar name="Alice Smith" userId={personId} />);
    expect(screen.getByText("AS")).not.toBeNull();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(container.querySelector(".avatar-image")).toBeNull();
    expect(fetchAvatarImage).not.toHaveBeenCalled();
  });

  it("reloads the manifest and image when the current user changes their photo", async () => {
    const updatedUrl = "/api/v1/users/" + personId + "/avatar?v=1";
    vi.mocked(api)
      .mockResolvedValueOnce({ data: { [personId]: profileUrl } })
      .mockResolvedValueOnce({ data: { [personId]: updatedUrl } });

    const { container } = render(<Avatar name="Alice Smith" userId={personId} />);
    await waitFor(() => expect(container.querySelector(".avatar-image")).not.toBeNull());
    invalidateUserAvatarCache(personId);
    window.dispatchEvent(new CustomEvent("collab:avatar-updated", { detail: { userId: personId } }));
    await waitFor(() => expect(fetchAvatarImage).toHaveBeenCalledWith(updatedUrl));
    expect(fetchAvatarImage).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
