// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { adjacentDriveImage, driveFolderImages, driveGalleryPath } from "../src/lib/drive-image-gallery.js";

const { getImage, getDirectory, download } = vi.hoisted(() => ({
  getImage: vi.fn(),
  getDirectory: vi.fn(),
  download: vi.fn(),
}));
vi.mock("../src/lib/api.js", () => ({
  fetchImagePreview: getImage,
  api: getDirectory,
  downloadFile: download,
}));

import DriveImageGallery from "../src/components/DriveImageGallery.jsx";

const item = (id, parentId, mimeType = "image/jpeg", spaceId = "shops") => ({
  id,
  name: `${id}.jpg`,
  kind: "FILE",
  parentId,
  spaceId,
  file: { id: `file-${id}`, mimeType },
});

const selected = item("third", "december");
const items = [
  item("first", "december"),
  item("pdf", "december", "application/pdf"),
  item("second", "january"),
  selected,
  item("other-space", "december", "image/jpeg", "different"),
];

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  URL.createObjectURL = vi.fn(() => "blob:image");
  URL.revokeObjectURL = vi.fn();
  getImage.mockResolvedValue(new Blob(["image"], { type: "image/jpeg" }));
  download.mockResolvedValue(undefined);
  getDirectory.mockResolvedValue({ data: items });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function showGallery(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DriveImageGallery selected={selected} visibleItems={items} section="shared" search="" onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe("Drive folder-scoped image previews", () => {
  it("excludes other folders, other spaces, PDFs and unsupported image formats", () => {
    expect(driveFolderImages(items, selected).map(({ id }) => id)).toEqual(["first", "third"]);
    expect(driveFolderImages([item("vector", "december", "image/svg+xml")], selected)).toEqual([selected]);
    expect(driveFolderImages([], null)).toEqual([]);
  });

  it("resolves the containing directory when search spans several folders", () => {
    expect(driveGalleryPath("shared", selected)).toBe("/drive?spaceId=shops&parentId=december");
    expect(driveGalleryPath("shared-with-me", selected)).toBe("/drive?view=shared-with-me&parentId=december");
    expect(driveGalleryPath("personal", item("root", null))).toBe("/drive?spaceId=shops");
    expect(adjacentDriveImage([items[0], selected], "third", 1).id).toBe("third");
    expect(adjacentDriveImage([items[0], selected], "third", -1).id).toBe("first");
  });

  it("fetches the selected picture only, and releases its URL on navigation and close", async () => {
    const view = showGallery();
    expect(screen.getByText("2 / 2")).toBeTruthy();
    await waitFor(() => expect(getImage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("img", { name: "third.jpg" })).toBeTruthy());
    expect(getImage.mock.calls[0][0]).toBe("file-third");
    expect(getDirectory).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Next image" }).disabled).toBe(true);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() => expect(getImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("img", { name: "first.jpg" })).toBeTruthy());
    expect(getImage.mock.calls[1][0]).toBe("file-first");
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("loads unfiltered siblings on demand when opened from Drive search", async () => {
    showGallery({ visibleItems: [selected, items[2]], search: "third" });
    expect(screen.getByText("1 / 1")).toBeTruthy();
    await waitFor(() => expect(getDirectory).toHaveBeenCalledWith("/drive?spaceId=shops&parentId=december"));
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeTruthy());
    expect(getImage).toHaveBeenCalledTimes(1);
  });

  it("preserves the existing single-image download endpoint", async () => {
    showGallery();
    fireEvent.click(screen.getByRole("button", { name: "Download image" }));
    await waitFor(() => expect(download).toHaveBeenCalledWith("file-third", "third.jpg"));
  });

  it("zooms with controls, resets, and starts each next image fitted", async () => {
    showGallery();
    await waitFor(() => expect(screen.getByRole("img", { name: "third.jpg" })).toBeTruthy());
    fireEvent.load(screen.getByRole("img", { name: "third.jpg" }));
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.doubleClick(document.querySelector(".drive-gallery-viewport"), { clientX: 0, clientY: 0 });
    expect(screen.getByText("200%")).toBeTruthy();
    fireEvent.doubleClick(document.querySelector(".drive-gallery-viewport"), { clientX: 0, clientY: 0 });
    expect(screen.getByText("100%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("img", { name: "first.jpg" })).toBeTruthy());
    expect(screen.getByText("100%")).toBeTruthy();
  });

  it("keeps zoom limited to the image viewer, without changing keyboard navigation", async () => {
    showGallery();
    await waitFor(() => expect(screen.getByRole("img", { name: "third.jpg" })).toBeTruthy());
    fireEvent.load(screen.getByRole("img", { name: "third.jpg" }));
    fireEvent.wheel(document.querySelector(".drive-gallery-viewport"), { deltaY: -100, clientX: 0, clientY: 0 });
    expect(screen.queryByText("100%")).toBeNull();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByRole("img", { name: "first.jpg" })).toBeTruthy());
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("allows repeated mouse drags and blocks the browser's native image drag", async () => {
    showGallery();
    const image = await screen.findByRole("img", { name: "third.jpg" });
    const viewport = document.querySelector(".drive-gallery-viewport");
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
    Object.defineProperty(image, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(image, "clientHeight", { configurable: true, value: 300 });
    fireEvent.load(image);
    for (let index = 0; index < 4; index++)
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("200%")).toBeTruthy();

    fireEvent.pointerDown(viewport, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(viewport, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 230, clientY: 150 });
    fireEvent.pointerUp(viewport, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 230, clientY: 150 });
    expect(image.style.transform).toContain("translate3d(30px, 0px, 0)");

    fireEvent.pointerDown(viewport, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 230, clientY: 150 });
    fireEvent.pointerMove(viewport, { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 260, clientY: 150 });
    fireEvent.pointerUp(viewport, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 0, clientX: 260, clientY: 150 });
    expect(image.style.transform).toContain("translate3d(60px, 0px, 0)");

    expect(image.draggable).toBe(false);
    const nativeDrag = new Event("dragstart", { bubbles: true, cancelable: true });
    image.dispatchEvent(nativeDrag);
    expect(nativeDrag.defaultPrevented).toBe(true);
  });

  it("recovers when pointer capture is lost between drags", async () => {
    showGallery();
    const image = await screen.findByRole("img", { name: "third.jpg" });
    const viewport = document.querySelector(".drive-gallery-viewport");
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
    Object.defineProperty(image, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(image, "clientHeight", { configurable: true, value: 300 });
    fireEvent.load(image);
    for (let index = 0; index < 4; index++)
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    fireEvent.pointerDown(viewport, { pointerId: 4, pointerType: "mouse", button: 0, buttons: 1, clientX: 200, clientY: 150 });
    fireEvent.lostPointerCapture(viewport, { pointerId: 4, pointerType: "mouse" });
    fireEvent.pointerDown(viewport, { pointerId: 4, pointerType: "mouse", button: 0, buttons: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(viewport, { pointerId: 4, pointerType: "mouse", buttons: 1, clientX: 240, clientY: 150 });
    expect(image.style.transform).toContain("translate3d(40px, 0px, 0)");
  });
});
