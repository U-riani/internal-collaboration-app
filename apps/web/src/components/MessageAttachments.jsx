import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { downloadFile, downloadMessageImages, fetchImagePreview } from "../lib/api.js";
import { isInlineImage, stepGalleryIndex } from "../lib/image-preview.js";
import { Attachments, Modal } from "./UI.jsx";
import "./message-image-preview.css";

function GalleryImage({ file, thumbnailUrl }) {
  const [preview, setPreview] = useState({ url: thumbnailUrl, error: "" });

  // Only the selected photo is fetched. The first photo can reuse its thumbnail
  // object URL, which remains owned by ImageAttachment until the message unmounts.
  useEffect(() => {
    if (thumbnailUrl) {
      setPreview({ url: thumbnailUrl, error: "" });
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    let objectUrl = null;
    setPreview({ url: null, error: "" });
    fetchImagePreview(file.id, { signal: controller.signal })
      .then((blob) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, error: "" });
      })
      .catch((error) => {
        if (!disposed && error.name !== "AbortError")
          setPreview({ url: null, error: error.message || "Image preview failed" });
      });
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, thumbnailUrl]);

  return preview.url ? (
    <img
      src={preview.url}
      alt={file.originalName}
      onError={() => setPreview({ url: null, error: "This image could not be displayed" })}
    />
  ) : (
    <div className="chat-image-gallery-placeholder" role="status">
      {preview.error ? <ImageIcon size={26} /> : <LoaderCircle size={26} className="message-image-loading" />}
      <span>{preview.error || "Loading image…"}</span>
    </div>
  );
}

function ImageGallery({ images, thumbnailUrl, conversationId, messageId, onClose }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const selected = images[activeIndex];
  const count = images.length;

  const move = (direction) => {
    setDownloadError("");
    setActiveIndex((index) => stepGalleryIndex(index, direction, count));
  };

  // The shared Modal handles Escape. Arrow keys only move inside this gallery.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const tag = event.target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [count]);

  const download = async () => {
    setDownloadError("");
    setDownloading(true);
    try {
      await downloadFile(selected.id, selected.originalName);
    } catch (error) {
      setDownloadError(error.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const downloadAll = async () => {
    setDownloadError("");
    setDownloadingAll(true);
    try {
      await downloadMessageImages(conversationId, messageId);
    } catch (error) {
      setDownloadError(error.message || "Could not download all photos");
    } finally {
      setDownloadingAll(false);
    }
  };

  return (
    <Modal title={selected.originalName} wide className="chat-image-lightbox" onClose={onClose}>
      <div className="chat-image-lightbox-content">
        <div className="chat-image-gallery-stage">
          {count > 1 && (
            <button
              type="button"
              className="chat-image-gallery-arrow is-previous"
              onClick={() => move(-1)}
              disabled={activeIndex === 0}
              aria-label="Previous image"
            >
              <ChevronLeft size={23} />
            </button>
          )}
          <GalleryImage
            key={selected.id}
            file={selected}
            thumbnailUrl={activeIndex === 0 ? thumbnailUrl : null}
          />
          {count > 1 && (
            <button
              type="button"
              className="chat-image-gallery-arrow is-next"
              onClick={() => move(1)}
              disabled={activeIndex === count - 1}
              aria-label="Next image"
            >
              <ChevronRight size={23} />
            </button>
          )}
        </div>
        <div className="chat-image-gallery-footer">
          <span className="chat-image-gallery-counter" aria-live="polite">
            {activeIndex + 1} / {count}
          </span>
          <div className="chat-image-gallery-downloads">
            <button
              type="button"
              className="btn-primary chat-image-lightbox-download"
              onClick={download}
              disabled={downloading || downloadingAll}
            >
              <Download size={16} />
              {downloading ? "Downloading…" : "Download image"}
            </button>
            {count > 1 && (
              <button
                type="button"
                className="btn-secondary chat-image-lightbox-download-all"
                onClick={downloadAll}
                disabled={downloadingAll || downloading}
              >
                <Download size={16} />
                {downloadingAll ? "Preparing ZIP…" : "Download All"}
              </button>
            )}
          </div>
        </div>
        {downloadError && <p className="message-image-error" role="alert">{downloadError}</p>}
      </div>
    </Modal>
  );
}

function ImageAttachment({ images, conversationId, messageId }) {
  const file = images[0];
  const remainingCount = images.length - 1;
  const containerRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Load only the first photo near the viewport. All remaining photos load
  // only if the user visits them inside the full-size gallery.
  useEffect(() => {
    const controller = new AbortController();
    let observer;
    let objectUrl;
    let disposed = false;
    const load = async () => {
      try {
        const blob = await fetchImagePreview(file.id, { signal: controller.signal });
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (error) {
        if (!disposed && error.name !== "AbortError")
          setLoadError(error.message || "Unable to preview this image");
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            load();
          }
        },
        { rootMargin: "200px" },
      );
      if (containerRef.current) observer.observe(containerRef.current);
      else load();
    }
    return () => {
      disposed = true;
      observer?.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id]);

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      if (images.length > 1) await downloadMessageImages(conversationId, messageId);
      else await downloadFile(file.id, file.originalName);
    } catch (error) {
      setDownloadError(error.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const showImage = Boolean(src && !loadError);
  return (
    <div className="message-image-attachment" ref={containerRef}>
      <button
        type="button"
        className="message-image-thumbnail"
        disabled={!showImage && remainingCount === 0}
        onClick={() => setExpanded(true)}
        aria-label={remainingCount > 0
          ? "Open image gallery, " + images.length + " photos"
          : "Open image " + file.originalName}
        title={remainingCount > 0 ? "View all " + images.length + " photos" : "Open full-size image"}
      >
        {showImage ? (
          <img
            src={src}
            alt={file.originalName}
            onError={() => setLoadError("This image could not be displayed")}
          />
        ) : (
          <span className="message-image-placeholder">
            {loadError ? <ImageIcon size={20} /> : <LoaderCircle size={20} className="message-image-loading" />}
            <span>{loadError || "Loading image…"}</span>
          </span>
        )}
        {remainingCount > 0 && (
          <span className="message-image-count" aria-hidden="true">+{remainingCount}</span>
        )}
      </button>
      <div className="message-image-info">
        <span className="message-image-name" title={file.originalName}>{file.originalName}</span>
        <button
          type="button"
          className="message-image-download"
          onClick={download}
          disabled={downloading}
          aria-label={remainingCount > 0 ? "Download all " + images.length + " images" : "Download " + file.originalName}
          title={remainingCount > 0 ? "Download all photos as ZIP" : "Download image"}
        >
          {downloading ? <LoaderCircle size={16} className="message-image-loading" /> : <Download size={16} />}
        </button>
      </div>
      {downloadError && <p className="message-image-error" role="alert">{downloadError}</p>}
      {expanded && (
        <ImageGallery
          images={images}
          thumbnailUrl={showImage ? src : null}
          conversationId={conversationId}
          messageId={messageId}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

/** Opt-in for Messages; other modules retain the shared download-only Attachments. */
export default function MessageAttachments({ items = [], conversationId, messageId }) {
  const images = [];
  const files = [];
  for (const item of items) {
    const file = item.file || item;
    if (isInlineImage(file)) images.push(file);
    else files.push(item);
  }
  return (
    <div className="message-attachments">
      {images.length > 0 && (
        <div className="message-images-grid">
          <ImageAttachment key={images[0].id} images={images} conversationId={conversationId} messageId={messageId} />
        </div>
      )}
      {files.length > 0 && <Attachments items={files} />}
    </div>
  );
}
