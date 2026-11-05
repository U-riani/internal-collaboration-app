// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { api, downloadDriveArchive } = vi.hoisted(() => ({
  api: vi.fn(),
  downloadDriveArchive: vi.fn(),
}));
vi.mock("../src/lib/api.js", () => ({
  api,
  downloadDriveArchive,
  downloadFile: vi.fn(),
}));

import DriveArchiveModal from "../src/components/DriveArchiveModal.jsx";

const scope = { view: "shared", spaceId: "shops", parentId: "december" };
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  api.mockResolvedValue({ data: {
    totalFiles: 4,
    types: [
      { id: "images", label: "Images", extensions: "JPG, PNG", count: 3 },
      { id: "pdf", label: "PDF documents", extensions: "PDF", count: 1 },
    ],
  } });
  downloadDriveArchive.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Drive archive selection modal", () => {
  it("defaults to all file types and allows downloading just selected groups", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const close = vi.fn();
    render(<QueryClientProvider client={client}>
      <DriveArchiveModal scope={scope} locationName="December 2026" onClose={close} />
    </QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("4 files selected")).toBeTruthy());
    expect(screen.getByText("ZIP")).toBeTruthy();
    expect(screen.getByText("Folder context:")).toBeTruthy();
    expect(screen.getByText("December 2026")).toBeTruthy();
    expect(screen.getByText("Every file stored in this directory")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/drive/archive/options?view=shared&spaceId=shops&parentId=december");
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.checked)).toBe(true);
    fireEvent.click(screen.getByText("Images"));
    expect(screen.getByText("1 file selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download ZIP" }));
    await waitFor(() => expect(downloadDriveArchive).toHaveBeenCalledWith(scope, ["pdf"], "December 2026"));
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it("disables download when every type is deselected", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <DriveArchiveModal scope={scope} locationName="Shops" onClose={() => {}} />
    </QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("4 files selected")).toBeTruthy());
    fireEvent.click(screen.getByText("All files"));
    expect(screen.getByText("0 files selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download ZIP" }).disabled).toBe(true);
  });
});
