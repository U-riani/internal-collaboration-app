import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, LoaderCircle, Minus, Plus, RotateCcw } from "lucide-react";
import { api, downloadFile, fetchImagePreview } from "../lib/api.js";
import { adjacentDriveImage, driveFolderImages, driveGalleryPath } from "../lib/drive-image-gallery.js";
import {
  IMAGE_ZOOM_STEP, INITIAL_IMAGE_VIEW, MAX_IMAGE_SCALE, MIN_IMAGE_SCALE,
  clampImageView, panImageBy, pinchImageFrom, zoomImageAt,
} from "../lib/drive-image-zoom.js";
import { Modal } from "./UI.jsx";
import "./message-image-preview.css";
import "./drive-image-gallery.css";

function DriveGalleryPhoto({ item }) {
  const [preview, setPreview] = useState({ url: null, error: "" });
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState(INITIAL_IMAGE_VIEW);
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);

  const dimensions = () => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image || !loaded) return null;
    const frame = viewport.getBoundingClientRect();
    return {
      frame,
      viewportWidth: frame.width,
      viewportHeight: frame.height,
      imageWidth: image.clientWidth,
      imageHeight: image.clientHeight,
    };
  };

  const center = (frame, clientX, clientY) => ({
    x: clientX - frame.left - frame.width / 2,
    y: clientY - frame.top - frame.height / 2,
  });

  const zoomTo = (nextScale, clientX, clientY) => {
    const size = dimensions();
    if (!size) return;
    const origin = clientX == null
      ? { x: 0, y: 0 }
      : center(size.frame, clientX, clientY);
    setView((previous) => zoomImageAt(previous, nextScale, origin, size));
  };

  // React's delegated wheel listener can be passive. The native non-passive
  // listener prevents scrolling the dialog while zooming over the picture.
  useEffect(() => {
    const viewport = viewportRef.current;
    const onWheel = (event) => {
      const size = dimensions();
      if (!size) return;
      event.preventDefault();
      const origin = center(size.frame, event.clientX, event.clientY);
      const pixels = event.deltaY * (event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 120 : 1);
      const delta = Math.max(-160, Math.min(160, pixels));
      setView((previous) => zoomImageAt(previous, previous.scale * Math.exp(-delta * .003), origin, size));
    };
    viewport?.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport?.removeEventListener("wheel", onWheel);
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    const onResize = () => {
      const size = dimensions();
      if (size) setView((previous) => clampImageView(previous, size));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [loaded]);

  // A window focus change can interrupt a drag without delivering pointerup.
  // Never carry that stale gesture into the next mouse press.
  useEffect(() => {
    const cancelGesture = () => {
      pointersRef.current.clear();
      gestureRef.current = null;
    };
    window.addEventListener("blur", cancelGesture);
    return () => window.removeEventListener("blur", cancelGesture);
  }, []);

  const pointerDown = (event) => {
    if (!loaded || (event.pointerType === "mouse" && event.button !== 0)) return;
    const pointers = pointersRef.current;
    // Mouse devices reuse the same pointer ID for every drag. A lost pointerup
    // must never leave a previous session active when a new one begins.
    if (event.pointerType === "mouse") {
      pointers.clear();
      gestureRef.current = null;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gestureRef.current = {
        type: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        startView: view,
      };
    } else if (pointers.size === 1 && view.scale > MIN_IMAGE_SCALE) {
      gestureRef.current = { type: "pan", last: { x: event.clientX, y: event.clientY } };
    }
  };

  const pointerMove = (event) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    // A button release outside the viewer can miss pointerup if capture was
    // interrupted; stop dragging as soon as the browser reports no button.
    if (event.pointerType === "mouse" && event.buttons === 0) {
      pointerEnd(event);
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const size = dimensions();
    if (!size) return;
    const gesture = gestureRef.current;
    if (pointers.size === 2 && gesture?.type === "pinch") {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nextScale = gesture.startView.scale * distance / gesture.distance;
      setView(pinchImageFrom(
        gesture.startView,
        center(size.frame, gesture.midpoint.x, gesture.midpoint.y),
        center(size.frame, midpoint.x, midpoint.y),
        nextScale,
        size,
      ));
    } else if (pointers.size === 1 && gesture?.type === "pan") {
      const dx = event.clientX - gesture.last.x;
      const dy = event.clientY - gesture.last.y;
      gesture.last = { x: event.clientX, y: event.clientY };
      setView((previous) => panImageBy(previous, dx, dy, size));
    }
  };

  const pointerEnd = (event, release = true) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (release && event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const remaining = [...pointers.values()];
    gestureRef.current = remaining.length === 1
      ? { type: "pan", last: remaining[0] }
      : null;
  };

  // Keep only the currently viewed file in memory. Navigation aborts an
  // unfinished request and releases its blob URL before fetching the next.
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let objectUrl = null;
    setPreview({ url: null, error: "" });
    fetchImagePreview(item.file.id, { signal: controller.signal })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, error: "" });
      })
      .catch((error) => {
        if (!disposed && error.name !== "AbortError")
          setPreview({ url: null, error: error.message || "Could not load this image" });
      });
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.file.id]);

  return (
    <>
      <div ref={viewportRef} className={`drive-gallery-viewport${view.scale > 1 ? " is-zoomed" : ""}`}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
        onLostPointerCapture={(event) => pointerEnd(event, false)}
        onDragStart={(event) => event.preventDefault()}
        onDoubleClick={(event) => {
          if (view.scale > MIN_IMAGE_SCALE) setView({ ...INITIAL_IMAGE_VIEW });
          else zoomTo(2, event.clientX, event.clientY);
        }}>
        {preview.url ? (
          <img ref={imageRef} className="drive-gallery-zoom-image"
            src={preview.url} alt={item.name} draggable={false}
            style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setPreview({ url: null, error: "This image could not be displayed" });
            }}
          />
        ) : (
          <div className="chat-image-gallery-placeholder" role="status">
            {preview.error ? <ImageIcon size={26} /> : <LoaderCircle size={26} className="message-image-loading" />}
            <span>{preview.error || "Loading image…"}</span>
          </div>
        )}
      </div>
      <div className="drive-gallery-zoom-controls" role="group" aria-label="Image zoom controls">
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={!loaded || view.scale <= MIN_IMAGE_SCALE}
          onClick={() => zoomTo(view.scale - IMAGE_ZOOM_STEP)}><Minus size={17} /></button>
        <output className="drive-gallery-zoom-value" aria-label="Zoom level" aria-live="off">
          {Math.round(view.scale * 100)}%
        </output>
        <button type="button" aria-label="Zoom in" title="Zoom in" disabled={!loaded || view.scale >= MAX_IMAGE_SCALE}
          onClick={() => zoomTo(view.scale + IMAGE_ZOOM_STEP)}><Plus size={17} /></button>
        <span className="drive-gallery-zoom-divider" aria-hidden="true" />
        <button type="button" aria-label="Reset zoom" title="Reset zoom" disabled={!loaded || view.scale <= MIN_IMAGE_SCALE}
          onClick={() => setView({ ...INITIAL_IMAGE_VIEW })}><RotateCcw size={17} /></button>
      </div>
    </>
  );
}

export default function DriveImageGallery({ selected, visibleItems, section, search, onClose }) {
  const [activeId, setActiveId] = useState(selected.id);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const directory = useQuery({
    queryKey: ["drive-gallery", section, selected.spaceId, selected.parentId],
    queryFn: () => api(driveGalleryPath(section, selected)),
    // Opening a file while searching should still show all siblings, not just
    // search matches. Ordinary folder views already contain the full listing.
    enabled: Boolean(search),
    retry: false,
  });

  const images = useMemo(
    () => driveFolderImages(search && directory.data ? directory.data.data : visibleItems, selected),
    [directory.data, search, visibleItems, selected],
  );
  const activeIndex = Math.max(0, images.findIndex((item) => item.id === activeId));
  const active = images[activeIndex];

  const move = (direction) => {
    setDownloadError("");
    const next = adjacentDriveImage(images, active.id, direction);
    if (next) setActiveId(next.id);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [images, active.id]);

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadFile(active.file.id, active.name);
    } catch (error) {
      setDownloadError(error.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal title={active.name} wide className="chat-image-lightbox drive-image-lightbox" onClose={onClose}>
      <div className="chat-image-lightbox-content">
        <div className="chat-image-gallery-stage">
          {images.length > 1 && (
            <button type="button" className="chat-image-gallery-arrow is-previous"
              aria-label="Previous image" disabled={activeIndex === 0} onClick={() => move(-1)}>
              <ChevronLeft size={23} />
            </button>
          )}
          <DriveGalleryPhoto key={active.file.id} item={active} />
          {images.length > 1 && (
            <button type="button" className="chat-image-gallery-arrow is-next"
              aria-label="Next image" disabled={activeIndex === images.length - 1} onClick={() => move(1)}>
              <ChevronRight size={23} />
            </button>
          )}
        </div>
        <div className="chat-image-gallery-footer">
          <span className="chat-image-gallery-counter" aria-live="polite">
            {activeIndex + 1} / {images.length}
          </span>
          <button type="button" className="btn-primary chat-image-lightbox-download"
            disabled={downloading} onClick={download}>
            <Download size={16} />{downloading ? "Downloading…" : "Download image"}
          </button>
        </div>
        {search && directory.isPending && <p className="drive-gallery-notice" role="status">Finding other images in this folder…</p>}
        {search && directory.isError && <p className="drive-gallery-notice" role="status">Could not load the full folder. Showing available images only.</p>}
        {downloadError && <p className="message-image-error" role="alert">{downloadError}</p>}
      </div>
    </Modal>
  );
}
