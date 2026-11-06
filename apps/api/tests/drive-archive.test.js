import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { archiveItemsInLocation, driveArchiveCategory, driveArchiveTypes, UNIVER_SHEET_MIME } from "../src/lib/drive-archive.js";
import { createFileZipStream } from "../src/lib/image-zip.js";
import { univerSnapshotToXlsxBuffer } from "../src/lib/univer-xlsx.js";

const member = { id: "manager-a", departmentId: null };
const space = {
  id: "shops", type: "GROUP", ownerUserId: null,
  members: [{ userId: "manager-a", role: "VIEWER" }, { userId: "manager-b", role: "VIEWER" }],
};
function item(id, parentId, name, mimeType = "image/jpeg", permissionMode = "INHERIT") {
  return {
    id, parentId, name, spaceId: space.id, space, permissionMode,
    deletedAt: null, grants: [], kind: mimeType === "FOLDER" ? "FOLDER" : "FILE",
    ...(mimeType === "FOLDER" ? {} : { file: { id: `file-${id}`, mimeType, sizeBytes: 15 } }),
  };
}

test("Drive ZIP uses only accessible direct files in the current folder", () => {
  const folder = item("december", null, "December", "FOLDER");
  const january = item("january", null, "January", "FOLDER");
  const image = item("photo", "december", "sales.jpg");
  const pdf = item("report", "december", "report.pdf", "application/pdf");
  const nested = item("other", "january", "secret.jpg");
  const restricted = item("restricted", "december", "private.docx", "application/msword", "CUSTOM");
  const tree = new Map([folder, january, image, pdf, nested, restricted].map((node) => [node.id, node]));
  const result = archiveItemsInLocation({ tree, user: member, view: "shared", folder, space: null });
  assert.deepEqual(result.map((entry) => entry.id), ["photo", "report"]);
  assert.deepEqual(driveArchiveTypes(result).map(({ id, count }) => [id, count]), [["images", 1], ["pdf", 1]]);
  assert.throws(() => archiveItemsInLocation({
    tree, user: { id: "outsider", departmentId: null }, view: "shared", folder, space: null,
  }), { statusCode: 403 });
});

test("Drive ZIP categorizes uploaded Excel, native spreadsheets, Word, and unknown extensions", () => {
  assert.equal(driveArchiveCategory(item("excel", null, "sales.xlsx", "application/octet-stream")), "excel");
  assert.equal(driveArchiveCategory(item("sheet", null, "Budget", UNIVER_SHEET_MIME)), "excel");
  assert.equal(driveArchiveCategory(item("word", null, "notes.docx", "application/octet-stream")), "word");
  assert.equal(driveArchiveCategory(item("log", null, "system.xyz", "application/octet-stream")), "ext:xyz");
  assert.equal(driveArchiveCategory(item("other", null, "untitled", "application/octet-stream")), "other");
});

test("Shared with me root archives only directly shared accessible files", () => {
  const personal = { id: "personal-owner", type: "PERSONAL", ownerUserId: "owner", members: [] };
  const sharedFile = {
    ...item("shared", null, "receipt.pdf", "application/pdf"),
    space: personal, spaceId: personal.id,
    grants: [{ userId: member.id, scope: "ITEM_ONLY", access: "VIEWER" }],
  };
  const privateFile = {
    ...item("private", null, "private.pdf", "application/pdf"),
    space: personal, spaceId: personal.id, grants: [],
  };
  const sharedFolder = {
    ...item("share-folder", null, "Reports", "FOLDER"),
    space: personal, spaceId: personal.id,
    grants: [{ userId: member.id, scope: "DESCENDANTS", access: "VIEWER" }],
  };
  const nested = {
    ...item("nested", "share-folder", "nested.jpg"),
    space: personal, spaceId: personal.id,
  };
  const tree = new Map([sharedFile, privateFile, sharedFolder, nested].map((node) => [node.id, node]));
  assert.deepEqual(archiveItemsInLocation({ tree, user: member, view: "shared-with-me" }).map((node) => node.id), ["shared"]);
  assert.deepEqual(archiveItemsInLocation({ tree, user: member, view: "shared-with-me", folder: sharedFolder }).map((node) => node.id), ["nested"]);
});

test("Drive ZIP can prepare native spreadsheets lazily while leaving regular bytes unchanged", async () => {
  const snapshot = {
    sheetOrder: ["sheet-1"], sheets: {
      "sheet-1": {
        name: "Sales & Returns",
        cellData: { 0: { 0: { v: "Store" }, 1: { v: 15, s: { n: { pattern: "#,##0.00" } } } }, 1: { 0: { v: true }, 1: { f: "=B1*2" } } },
        mergeData: [{ startRow: 2, startColumn: 0, endRow: 2, endColumn: 1 }],
      },
    },
  };
  const inner = await univerSnapshotToXlsxBuffer(snapshot);
  let prepared = 0;
  const outer = createFileZipStream([
    { originalName: "photo.jpg", sizeBytes: 5, open: () => Readable.from([Buffer.from("photo")]) },
    {
      originalName: "Monthly.xlsx",
      prepare: async () => {
        prepared++;
        return { sizeBytes: inner.length, open: () => Readable.from([inner]) };
      },
    },
  ]);
  assert.equal(prepared, 0);
  const result = await buffer(outer);
  assert.equal(prepared, 1);
  assert.ok(result.includes(Buffer.from("Monthly.xlsx")));

  if (process.platform !== "linux") return;
  const run = promisify(execFile);
  const directory = await mkdtemp(path.join(os.tmpdir(), "drive-archive-test-"));
  try {
    const outerPath = path.join(directory, "drive.zip");
    const innerPath = path.join(directory, "Monthly.xlsx");
    await writeFile(outerPath, result);
    const extracted = await run("unzip", ["-p", outerPath, "Monthly.xlsx"], { encoding: "buffer", maxBuffer: 30 * 1024 * 1024 });
    await writeFile(innerPath, extracted.stdout);
    const { stdout: entryList } = await run("unzip", ["-Z1", innerPath]);
    assert.match(entryList, /xl\/worksheets\/sheet1.xml/);
    assert.match(entryList, /\[Content_Types\]\.xml/);
    assert.match(entryList, /xl\/styles\.xml/);
    const { stdout: worksheet } = await run("unzip", ["-p", innerPath, "xl/worksheets/sheet1.xml"]);
    assert.match(worksheet, /Store/);
    assert.match(worksheet, /<f>B1\*2<\/f>/);
    const { stdout: workbook } = await run("unzip", ["-p", innerPath, "xl/workbook.xml"]);
    assert.match(workbook, /Sales &amp; Returns/);
    const { stdout: style } = await run("unzip", ["-p", innerPath, "xl/styles.xml"]);
    assert.match(style, /#,##0\.00/);
    // Validate with an independent Excel reader when it is installed. CI
    // images without Python/openpyxl can still run the ZIP integrity checks.
    try {
      const { stdout: validated } = await run("python3", [
        "-c",
        "import openpyxl,sys; w=openpyxl.load_workbook(sys.argv[1]); s=w.active; print(s.title, s['A1'].value, s['B1'].value, s['B1'].number_format, s['B2'].value)",
        innerPath,
      ]);
      assert.match(validated, /Sales & Returns Store 15 #,##0\.00 =B1\*2/);
    } catch (error) {
      if (error.code !== "ENOENT" && !String(error.stderr).includes("No module named")) throw error;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
