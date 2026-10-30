// Limit same-origin previews to non-executable raster image formats.
// Keep this list aligned with the server's /files/:id/preview allowlist.
export const PREVIEW_IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export function safeImageMimeType(mimeType) {
  const normalized = typeof mimeType === "string"
    ? mimeType.split(";")[0].trim().toLowerCase()
    : "";
  return PREVIEW_IMAGE_MIME_TYPES.includes(normalized) ? normalized : null;
}

export function isInlineImage(file) {
  return Boolean(file?.id && safeImageMimeType(file?.mimeType));
}

// Keep the standard text bubble whenever a message has a caption, another
// attachment type, a reply quote or is deleted. Only photo-only messages
// should render as standalone media without a colored chat bubble.
export function isImageOnlyMessage(message) {
  return Boolean(
    message &&
      !message.deletedAt &&
      !message.replyToMessage &&
      !message.content?.trim() &&
      Array.isArray(message.attachments) &&
      message.attachments.length > 0 &&
      message.attachments.every((item) => isInlineImage(item?.file || item)),
  );
}
