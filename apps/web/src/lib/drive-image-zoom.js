export const MIN_IMAGE_SCALE = 1;
export const MAX_IMAGE_SCALE = 4;
export const IMAGE_ZOOM_STEP = 0.25;
export const INITIAL_IMAGE_VIEW = Object.freeze({ scale: MIN_IMAGE_SCALE, x: 0, y: 0 });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// The fitted image is centered in its viewport before transforms. Do not let
// a drag reveal empty space beyond the image when the scaled image is larger.
export function clampImageView(view, dimensions) {
  const scale = clamp(view.scale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
  const horizontal = Math.max(0, (dimensions.imageWidth * scale - dimensions.viewportWidth) / 2);
  const vertical = Math.max(0, (dimensions.imageHeight * scale - dimensions.viewportHeight) / 2);
  return {
    scale,
    x: clamp(view.x, -horizontal, horizontal),
    y: clamp(view.y, -vertical, vertical),
  };
}

// Keep the point under the mouse/fingers stationary while changing the scale.
// `point` is measured from the center of the viewport, not its top-left.
export function zoomImageAt(view, requestedScale, point, dimensions) {
  const scale = clamp(requestedScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
  if (scale === MIN_IMAGE_SCALE) return { ...INITIAL_IMAGE_VIEW };
  const ratio = scale / view.scale;
  return clampImageView({
    scale,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  }, dimensions);
}

export function panImageBy(view, dx, dy, dimensions) {
  return clampImageView({ ...view, x: view.x + dx, y: view.y + dy }, dimensions);
}

// A two-finger gesture can both scale and move its midpoint at once.
export function pinchImageFrom(startView, startPoint, nextPoint, nextScale, dimensions) {
  const scale = clamp(nextScale, MIN_IMAGE_SCALE, MAX_IMAGE_SCALE);
  if (scale === MIN_IMAGE_SCALE) return { ...INITIAL_IMAGE_VIEW };
  const ratio = scale / startView.scale;
  return clampImageView({
    scale,
    x: nextPoint.x - (startPoint.x - startView.x) * ratio,
    y: nextPoint.y - (startPoint.y - startView.y) * ratio,
  }, dimensions);
}
