import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { createImageZipStream, uniqueImageNames } from "../src/lib/image-zip.js";

test("ZIP64 archive streams original bytes, CRC and central directory", async () => {
  const parts = ["original photo", "second photo"];
  const archive = await buffer(createImageZipStream(parts.map((value, index) => ({
    originalName: "photo.png",
    sizeBytes: Buffer.byteLength(value),
    open: () => Readable.from([Buffer.from(value)]),
  }))));
  assert.equal(archive.readUInt32LE(0), 0x04034b50);
  assert.equal(archive.readUInt16LE(4), 45);
  assert.ok(archive.includes(Buffer.from("photo.png")));
  assert.ok(archive.includes(Buffer.from("photo (2).png")));
  parts.forEach((part) => assert.ok(archive.includes(Buffer.from(part))));
  const centralOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(centralOffset > 0);
  assert.equal(archive.readUInt16LE(centralOffset + 6), 45);
  const directory = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
  assert.ok(directory > centralOffset);
  assert.equal(archive.readBigUInt64LE(directory + 32), 2n);
  assert.equal(archive.readBigUInt64LE(directory + 48), BigInt(centralOffset));
  assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
});

test("archive file names are safe, unique and never contain folder traversal", () => {
  const names = uniqueImageNames([
    { originalName: "../photo.png" },
    { originalName: "photo.png" },
    { originalName: "PHOTO.PNG" },
    { originalName: "..\\nested\\another.jpg" },
    { originalName: "\u0000" },
  ]).map((x) => x.archiveName);
  assert.deepEqual(names, ["photo.png", "photo (2).png", "PHOTO (3).PNG", "another.jpg", "image"]);
});

test("ZIP stream rejects file size mismatches rather than producing corrupt archives", async () => {
  await assert.rejects(
    buffer(createImageZipStream([{ originalName: "bad.png", sizeBytes: 100, open: () => Readable.from([Buffer.from("short")]) }])),
    /size changed/,
  );
});

test("ZIP64 archive can be extracted by a standard ZIP reader", async (t) => {
  if (process.platform !== "linux") return t.skip("Linux interoperability check");
  const run = promisify(execFile);
  try {
    await run("unzip", ["-v"]);
  } catch {
    return t.skip("unzip tool not installed");
  }
  const archive = await buffer(createImageZipStream([
    { originalName: "photo.png", sizeBytes: 5, open: () => Readable.from([Buffer.from("hello")]) },
    { originalName: "photo.png", sizeBytes: 5, open: () => Readable.from([Buffer.from("world")]) },
  ]));
  const directory = await mkdtemp(path.join(os.tmpdir(), "zip64-images-"));
  try {
    const archivePath = path.join(directory, "photos.zip");
    await writeFile(archivePath, archive);
    const first = await run("unzip", ["-p", archivePath, "photo.png"]);
    const second = await run("unzip", ["-p", archivePath, "photo (2).png"]);
    assert.equal(first.stdout, "hello");
    assert.equal(second.stdout, "world");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
