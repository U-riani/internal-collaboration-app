import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { api, downloadFile, fetchImagePreview } from "../lib/api.js";
import { adjacentDriveImage, driveFolderImages, driveGalleryPath } from "../lib/drive-image-gallery.js";
import { Modal } from "./UI.jsx";
import "./message-image-preview.css";
import "./drive-image-gallery.css";

function DriveGalleryPhoto({ item }) {
  const [preview, setPreview] = useState({ url: null, error: "" });

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

  return preview.url ? (
    <img
      src={preview.url}
      alt={item.name}
      onError={() => setPreview({ url: null, error: "This image could not be displayed" })}
    />
  ) : (
    <div className="chat-image-gallery-placeholder" role="status">
      {preview.error ? <ImageIcon size={26} /> : <LoaderCircle size={26} className="message-image-loading" />}
      <span>{preview.error || "Loading image…"}</span>
    </div>
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
