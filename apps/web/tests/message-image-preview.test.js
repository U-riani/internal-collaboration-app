import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isInlineImage, safeImageMimeType } from "../src/lib/image-preview.js";

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
    expect(imageComponent).toContain("images.map((file)");
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
});
