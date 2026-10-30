import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isInlineImage, isImageOnlyMessage, safeImageMimeType, stepGalleryIndex } from "../src/lib/image-preview.js";

const imageComponent = readFileSync(new URL("../src/components/MessageAttachments.jsx", import.meta.url), "utf8");
const imageStyles = readFileSync(new URL("../src/components/message-image-preview.css", import.meta.url), "utf8");
const chat = readFileSync(new URL("../src/pages/ChatPage.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");

describe("Messages inline images", () => {
  it("previews only browser-safe raster MIME types", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"])
      expect(isInlineImage({ id: "id", mimeType: type })).toBe(true);
    expect(safeImageMimeType("IMAGE/PNG; charset=utf-8")).toBe("image/png");
    for (const type of ["image/svg+xml", "text/html", "application/pdf", "application/octet-stream", "image/heic"]) {
      expect(isInlineImage({ id: "id", mimeType: type })).toBe(false);
    }
    expect(isInlineImage({ mimeType: "image/png" })).toBe(false);
    expect(isInlineImage(null)).toBe(false);
  });

  it("switches only the message bubbles to media-aware rendering", () => {
    expect(chat).toContain('import MessageAttachments from "../components/MessageAttachments.jsx"');
    expect(chat).toContain("<MessageAttachments items={m.attachments} />");
    expect(chat).toContain("<Attachments items={[{ file: result.file }]} />");
    expect(imageComponent).toContain("isInlineImage(file)");
    expect(imageComponent).toContain("<Attachments items={files} />");
    expect(imageComponent).toContain("<ImageAttachment key={images[0].id} images={images} />");
  });

  it("uses authenticated requests, supports retrying expired access tokens and aborts offscreen loads", () => {
    expect(api).toContain('export async function fetchImagePreview(id, { signal } = {})');
    expect(api).toContain("getAccessToken()");
    expect(api).toContain("await refreshSession()");
    expect(api).toContain("response.blob()");
    expect(imageComponent).toContain("new IntersectionObserver(");
    expect(imageComponent).toContain("controller.abort()");
    expect(imageComponent).toContain("URL.createObjectURL(blob)");
    expect(imageComponent).toContain("URL.revokeObjectURL(url)");
  });

  it("opens a full-size viewer and preserves image downloads", () => {
    expect(imageComponent).toContain("setExpanded(true)");
    expect(imageComponent).toContain("className=\"chat-image-lightbox\"");
    expect(imageComponent).toContain("downloadFile(file.id, file.originalName)");
    expect(imageComponent).toContain("onError={() => setLoadError");
    expect(imageComponent).toContain("Download image");
    expect(imageStyles).toContain("var(--app-surface");
    expect(imageStyles).toContain("var(--app-interactive-selected)");
    expect(imageStyles).toContain("prefers-reduced-motion");
  });

  it("removes the bubble for image-only messages but retains it for text and mixed attachments", () => {
    const picture = { file: { id: "image-1", mimeType: "image/png" } };
    const photo2 = { file: { id: "image-2", mimeType: "image/webp" } };
    const document = { file: { id: "doc-1", mimeType: "application/pdf" } };
    expect(isImageOnlyMessage({ content: "", attachments: [picture] })).toBe(true);
    expect(isImageOnlyMessage({ content: "   ", attachments: [picture, photo2] })).toBe(true);
    expect(isImageOnlyMessage({ content: "Look at this", attachments: [picture] })).toBe(false);
    expect(isImageOnlyMessage({ content: "", attachments: [picture, document] })).toBe(false);
    expect(isImageOnlyMessage({ content: "", attachments: [document] })).toBe(false);
    expect(isImageOnlyMessage({ content: "", attachments: [] })).toBe(false);
    expect(isImageOnlyMessage({ content: "", attachments: [picture], deletedAt: "2026-10-30" })).toBe(false);
    expect(isImageOnlyMessage({ content: "", attachments: [picture], replyToMessage: { id: "reply" } })).toBe(false);
    expect(isImageOnlyMessage(null)).toBe(false);
  });

  it("renders photo-only content without an empty text paragraph or extra top margin", () => {
    expect(chat).toContain('const imageOnly = isImageOnlyMessage(m);');
    expect(chat).toContain('imageOnly ? "chat-image-only-bubble" : ""');
    expect(chat).toContain('{!imageOnly && (');
    expect(chat).toContain('className={imageOnly ? "" : "mt-2"}');
    expect(imageStyles).toContain('.chat-message-bubble.chat-image-only-bubble');
    expect(imageStyles).toContain('background: transparent;');
    expect(imageStyles).toContain('background-image: none;');
    expect(imageStyles).toContain('box-shadow: none;');
    expect(imageStyles).toContain('.chat-image-only-bubble .message-image-attachment');
  });

  it("keeps exactly one thumbnail in the chat and shows +N for additional images", () => {
    expect(imageComponent).toContain("<ImageAttachment key={images[0].id} images={images} />");
    expect(imageComponent).toContain("const remainingCount = images.length - 1;");
    expect(imageComponent).toContain("{remainingCount > 0 && (");
    expect(imageComponent).toContain('className="message-image-count"');
    expect(imageComponent).toContain('aria-hidden="true">+{remainingCount}');
    expect(imageComponent).not.toContain("images.map((file) => <ImageAttachment");
    expect(imageStyles).toContain(".message-image-count {");
    expect(imageStyles).toContain("background: rgba(9, 14, 29, .43)");
    expect(imageStyles).toContain("display: block;");
  });

  it("bounds gallery navigation at both ends for one, six and twenty photos", () => {
    expect(stepGalleryIndex(0, -1, 6)).toBe(0);
    expect(stepGalleryIndex(0, 1, 6)).toBe(1);
    expect(stepGalleryIndex(4, 1, 6)).toBe(5);
    expect(stepGalleryIndex(5, 1, 6)).toBe(5);
    expect(stepGalleryIndex(5, -1, 6)).toBe(4);
    expect(stepGalleryIndex(19, 1, 20)).toBe(19);
    expect(stepGalleryIndex(0, 1, 1)).toBe(0);
    expect(stepGalleryIndex(0, 1, 0)).toBe(0);
  });

  it("opens previous/next controls, a counter, keyboard arrows and on-demand image fetches", () => {
    expect(imageComponent).toContain('aria-label="Previous image"');
    expect(imageComponent).toContain('aria-label="Next image"');
    expect(imageComponent).toContain("activeIndex === 0");
    expect(imageComponent).toContain("activeIndex === count - 1");
    expect(imageComponent).toContain('className="chat-image-gallery-counter"');
    expect(imageComponent).toContain("{activeIndex + 1} / {count}");
    expect(imageComponent).toContain('event.key === "ArrowLeft" || event.key === "ArrowRight"');
    expect(imageComponent).toContain('document.removeEventListener("keydown", handleKeyDown)');
    expect(imageComponent).toContain('key={selected.id}');
    expect(imageComponent).toContain("fetchImagePreview(file.id, { signal: controller.signal })");
    expect(imageComponent).toContain("images={images}");
    expect(imageStyles).toContain(".chat-image-gallery-stage {");
    expect(imageStyles).toContain(".chat-image-gallery-arrow:disabled {");
  });
});
