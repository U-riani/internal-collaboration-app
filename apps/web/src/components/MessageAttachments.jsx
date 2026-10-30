import { useEffect, useRef, useState } from "react";
import { Download, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { downloadFile, fetchImagePreview } from "../lib/api.js";
import { isInlineImage } from "../lib/image-preview.js";
import { Attachments, Modal } from "./UI.jsx";
import "./message-image-preview.css";

function ImageAttachment({ file }) {
  const containerRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Only fetch thumbnails when they approach the viewport. Abort requests and
  // revoke short-lived blob URLs as soon as a message leaves the component tree.
  useEffect(() => {
    const controller = new AbortController();
    let observer;
    let url;
    let disposed = false;
    const load = async () => {
      try {
        const blob = await fetchImagePreview(file.id, { signal: controller.signal });
        if (disposed) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
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
      if (url) URL.revokeObjectURL(url);
    };
  }, [file.id]);

  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadFile(file.id, file.originalName);
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
        disabled={!showImage}
        onClick={() => setExpanded(true)}
        aria-label={"Open image " + file.originalName}
        title={showImage ? "Open full-size image" : file.originalName}
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
      </button>
      <div className="message-image-info">
        <span className="message-image-name" title={file.originalName}>{file.originalName}</span>
        <button
          type="button"
          className="message-image-download"
          onClick={download}
          disabled={downloading}
          aria-label={"Download " + file.originalName}
          title="Download image"
        >
          {downloading ? <LoaderCircle size={16} className="message-image-loading" /> : <Download size={16} />}
        </button>
      </div>
      {downloadError && <p className="message-image-error" role="alert">{downloadError}</p>}
      {expanded && showImage && (
        <Modal
          title={file.originalName}
          wide
          className="chat-image-lightbox"
          onClose={() => setExpanded(false)}
        >
          <div className="chat-image-lightbox-content">
            <img src={src} alt={file.originalName} />
            <button
              type="button"
              className="btn-primary chat-image-lightbox-download"
              onClick={download}
              disabled={downloading}
            >
              <Download size={16} />
              {downloading ? "Downloading…" : "Download image"}
            </button>
            {downloadError && <p className="message-image-error" role="alert">{downloadError}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Opt-in for Messages. Other modules still use the shared download-only Attachments. */
export default function MessageAttachments({ items = [] }) {
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
          {images.map((file) => <ImageAttachment key={file.id} file={file} />)}
        </div>
      )}
      {files.length > 0 && <Attachments items={files} />}
    </div>
  );
}
