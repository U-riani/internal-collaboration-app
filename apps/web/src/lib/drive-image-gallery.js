import { isInlineImage, stepGalleryIndex } from "./image-preview.js";

// A gallery never crosses a folder or a shared space, even when Drive search
// returns results from multiple folders. Keep the server's authorized order.
export function driveFolderImages(items, selected) {
  if (!selected || !isInlineImage(selected.file)) return [];
  const images = (items || []).filter((item) =>
    item.kind === "FILE" &&
    item.spaceId === selected.spaceId &&
    (item.parentId || null) === (selected.parentId || null) &&
    isInlineImage(item.file),
  );
  return images.some((item) => item.id === selected.id)
    ? images
    : [selected, ...images];
}

// Search is space-wide; the gallery needs the full unfiltered directory.
export function driveGalleryPath(section, selected) {
  const params = new URLSearchParams();
  if (section === "shared-with-me") params.set("view", "shared-with-me");
  else params.set("spaceId", selected.spaceId);
  if (selected.parentId) params.set("parentId", selected.parentId);
  return `/drive?${params.toString()}`;
}

export function adjacentDriveImage(images, activeId, direction) {
  const index = images.findIndex((item) => item.id === activeId);
  if (index < 0) return null;
  return images[stepGalleryIndex(index, direction, images.length)] || null;
}
