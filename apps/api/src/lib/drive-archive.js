import path from "node:path";
import { driveAccess, requireDrive, requireDriveSpace } from "./drive-access.js";
import { HttpError } from "./http-error.js";

export const UNIVER_SHEET_MIME = "application/vnd.gtex.univer-sheet+json";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif", "bmp", "tif", "tiff"]);
const EXCEL_EXTENSIONS = new Set(["xls", "xlsx", "xlsm", "csv", "ods"]);
const WORD_EXTENSIONS = new Set(["doc", "docx", "odt"]);
const PRESENTATION_EXTENSIONS = new Set(["ppt", "pptx", "odp"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "7z", "rar", "tar", "gz"]);

const GROUPS = {
  images: { label: "Images", extensions: "JPG, PNG, WEBP, and more" },
  excel: { label: "Excel spreadsheets", extensions: "XLSX, XLS, CSV, ODS" },
  pdf: { label: "PDF documents", extensions: "PDF" },
  word: { label: "Word documents", extensions: "DOC, DOCX, ODT" },
  presentations: { label: "Presentations", extensions: "PPT, PPTX, ODP" },
  archives: { label: "Archives", extensions: "ZIP, 7Z, RAR, and more" },
  text: { label: "Text files", extensions: "TXT, RTF, MD" },
};

export function driveArchiveCategory(item) {
  const mime = item.file?.mimeType?.split(";")[0]?.trim().toLowerCase() || "";
  const ext = path.extname(item.name || item.file?.originalName || "").slice(1).toLowerCase();
  if (mime === UNIVER_SHEET_MIME || EXCEL_EXTENSIONS.has(ext)) return "excel";
  if (mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "images";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (WORD_EXTENSIONS.has(ext)) return "word";
  if (PRESENTATION_EXTENSIONS.has(ext)) return "presentations";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archives";
  if (["txt", "rtf", "md"].includes(ext)) return "text";
  return ext && /^[a-z0-9]{1,12}$/.test(ext) ? `ext:${ext}` : "other";
}

export function driveArchiveTypes(files) {
  const categories = new Map();
  for (const item of files) {
    const id = driveArchiveCategory(item);
    const group = categories.get(id) || {
      id,
      label: GROUPS[id]?.label || (id.startsWith("ext:") ? `${id.slice(4).toUpperCase()} files` : "Other files"),
      extensions: GROUPS[id]?.extensions || (id.startsWith("ext:") ? id.slice(4).toUpperCase() : "Other formats"),
      count: 0,
      sizeBytes: 0,
    };
    group.count += 1;
    group.sizeBytes += item.file?.sizeBytes || 0;
    categories.set(id, group);
  }
  return [...categories.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Mirrors the unfiltered /drive listing's location semantics. A search result
// cannot silently expand an archive to another folder, space, or descendant.
export function archiveItemsInLocation({ tree, user, view, space, folder }) {
  if (folder) {
    requireDrive(user, folder, tree);
    if (folder.kind !== "FOLDER") throw new HttpError(400, "NOT_FOLDER", "Choose a folder");
    if (view === "shared-with-me" && (folder.space.type !== "PERSONAL" || folder.space.ownerUserId === user.id))
      throw new HttpError(403, "DRIVE_ACCESS_DENIED", "This folder is not shared with you");
  } else if (view !== "shared-with-me") {
    requireDriveSpace(user, space);
  }

  const result = [];
  for (const item of tree.values()) {
    if (item.kind !== "FILE" || !item.file) continue;
    const access = driveAccess(user, item, tree);
    if (!access) continue;
    if (view === "shared-with-me") {
      if (item.space.type !== "PERSONAL" || item.space.ownerUserId === user.id) continue;
      if (folder) {
        if (item.parentId !== folder.id) continue;
      } else if (item.parentId && driveAccess(user, tree.get(item.parentId), tree)) {
        continue;
      }
    } else if (item.spaceId !== (folder?.spaceId || space?.id) || item.parentId !== (folder?.id || null)) {
      continue;
    }
    result.push(item);
  }
  return result;
}
