import { describe, expect, it } from "vitest";
import {
  INITIAL_IMAGE_VIEW, MAX_IMAGE_SCALE, MIN_IMAGE_SCALE,
  panImageBy, pinchImageFrom, zoomImageAt,
} from "../src/lib/drive-image-zoom.js";

const size = { viewportWidth: 600, viewportHeight: 400, imageWidth: 600, imageHeight: 300 };

describe("Drive image zoom geometry", () => {
  it("starts fitted, clamps between 100% and 400%, and resets offsets at 100%", () => {
    expect(zoomImageAt(INITIAL_IMAGE_VIEW, .2, { x: 0, y: 0 }, size)).toEqual(INITIAL_IMAGE_VIEW);
    const enlarged = zoomImageAt(INITIAL_IMAGE_VIEW, 9, { x: 0, y: 0 }, size);
    expect(enlarged.scale).toBe(MAX_IMAGE_SCALE);
    expect(zoomImageAt(enlarged, MIN_IMAGE_SCALE, { x: 100, y: -20 }, size)).toEqual(INITIAL_IMAGE_VIEW);
  });

  it("keeps the pointer position anchored where possible", () => {
    const zoomed = zoomImageAt(INITIAL_IMAGE_VIEW, 2, { x: 100, y: 20 }, size);
    expect(zoomed).toEqual({ scale: 2, x: -100, y: -20 });
    expect(zoomImageAt(zoomed, 3, { x: 100, y: 20 }, size)).toEqual({ scale: 3, x: -200, y: -40 });
  });

  it("constrains panning in both directions even at maximum zoom", () => {
    const view = zoomImageAt(INITIAL_IMAGE_VIEW, 2, { x: 0, y: 0 }, size);
    expect(panImageBy(view, 1000, -1000, size)).toEqual({ scale: 2, x: 300, y: -100 });
    expect(panImageBy(view, -1000, 1000, size)).toEqual({ scale: 2, x: -300, y: 100 });
  });

  it("supports pinch-to-zoom and simultaneous midpoint movement", () => {
    expect(pinchImageFrom(INITIAL_IMAGE_VIEW, { x: 40, y: 0 }, { x: 60, y: 10 }, 2, size))
      .toEqual({ scale: 2, x: -20, y: 10 });
  });
});
