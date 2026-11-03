// Keep popovers inside the visible viewport, regardless of their scroll container.
export function getEmojiMenuPosition(anchor, menuHeight, viewport, align = "left") {
  const margin = 12;
  const gap = 8;
  const width = Math.min(352, Math.max(0, viewport.width - margin * 2));
  const height = Math.min(menuHeight, Math.max(0, viewport.height - margin * 2));
  const above = anchor.top - gap - margin;
  const below = viewport.height - anchor.bottom - gap - margin;
  const openBelow = below >= height || below > above;
  const desiredTop = openBelow
    ? anchor.bottom + gap
    : anchor.top - gap - height;

  return {
    top: Math.max(margin, Math.min(desiredTop, viewport.height - height - margin)),
    left: Math.max(
      margin,
      Math.min(
        align === "right" ? anchor.right - width : anchor.left,
        viewport.width - width - margin,
      ),
    ),
    width,
    placement: openBelow ? "bottom" : "top",
  };
}
