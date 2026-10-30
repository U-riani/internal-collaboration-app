import { Readable } from "node:stream";

// Dependency-free ZIP64 STORE stream. Images are already compressed: ZIP
// compression adds CPU load but almost no savings. Only tiny entry metadata
// is kept in memory; original images are streamed directly from storage.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let i = 0; i < 8; i++)
    value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
function crc32(crc, bytes) {
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}
function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}
function zip64Extra(values) {
  const bytes = Buffer.alloc(4 + values.length * 8);
  bytes.writeUInt16LE(1, 0);
  bytes.writeUInt16LE(values.length * 8, 2);
  values.forEach((value, index) => bytes.writeBigUInt64LE(BigInt(value), 4 + index * 8));
  return bytes;
}

// No folders, path traversal, control characters or duplicate archive entries.
export function uniqueImageNames(entries) {
  const seen = new Set();
  return entries.map((entry) => {
    let name = String(entry.originalName || "image").replaceAll("\\", "/").split("/").pop()
      .replace(/[\x00-\x1f\x7f]/g, "").trim();
    if (!name || name === "." || name === "..") name = "image";
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : "";
    let candidate = name;
    for (let number = 2; seen.has(candidate.toLocaleLowerCase()); number++)
      candidate = stem + " (" + number + ")" + extension;
    seen.add(candidate.toLocaleLowerCase());
    return { ...entry, archiveName: candidate };
  });
}

export function createImageZipStream(entries) {
  const named = uniqueImageNames(entries);
  async function* generate() {
    let position = 0n;
    const central = [];
    for (const entry of named) {
      const filename = Buffer.from(entry.archiveName, "utf8");
      if (filename.length > 65535) throw new Error("Archive filename too long");
      const start = position;
      const size = BigInt(entry.sizeBytes);
      if (size < 0n) throw new Error("Invalid file size");
      const extra = zip64Extra([size, size]);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(45, 4); // ZIP64
      local.writeUInt16LE(0x0808, 6); // UTF-8 + streamed CRC descriptor
      local.writeUInt16LE(0, 8); // STORE
      local.writeUInt16LE(0x21, 12); // 1980-01-01
      local.writeUInt32LE(0xffffffff, 18);
      local.writeUInt32LE(0xffffffff, 22);
      local.writeUInt16LE(filename.length, 26);
      local.writeUInt16LE(extra.length, 28);
      yield local;
      yield filename;
      yield extra;
      position += BigInt(local.length + filename.length + extra.length);

      let crc = 0xffffffff;
      let bytesRead = 0n;
      const input = await entry.open();
      try {
        for await (const piece of input) {
          const data = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
          bytesRead += BigInt(data.length);
          if (bytesRead > size) throw new Error("Image size changed during archive creation");
          crc = crc32(crc, data);
          yield data;
          position += BigInt(data.length);
        }
      } finally {
        input.destroy?.();
      }
      if (bytesRead !== size) throw new Error("Image size changed during archive creation");
      crc = (crc ^ 0xffffffff) >>> 0;
      const descriptor = Buffer.alloc(24);
      descriptor.writeUInt32LE(0x08074b50, 0);
      descriptor.writeUInt32LE(crc, 4);
      descriptor.writeBigUInt64LE(size, 8);
      descriptor.writeBigUInt64LE(size, 16);
      yield descriptor;
      position += BigInt(descriptor.length);
      central.push({ filename, crc, size, start });
    }

    const cdStart = position;
    for (const entry of central) {
      const extra = zip64Extra([entry.size, entry.size, entry.start]);
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(45, 4); // made by
      record.writeUInt16LE(45, 6); // extract version
      record.writeUInt16LE(0x0808, 8);
      record.writeUInt16LE(0x21, 14);
      record.writeUInt32LE(entry.crc, 16);
      record.writeUInt32LE(0xffffffff, 20);
      record.writeUInt32LE(0xffffffff, 24);
      record.writeUInt16LE(entry.filename.length, 28);
      record.writeUInt16LE(extra.length, 30);
      record.writeUInt32LE(0xffffffff, 42);
      yield record;
      yield entry.filename;
      yield extra;
      position += BigInt(record.length + entry.filename.length + extra.length);
    }
    const cdSize = position - cdStart;
    const zip64Offset = position;
    const eocd64 = Buffer.alloc(56);
    eocd64.writeUInt32LE(0x06064b50, 0);
    eocd64.writeBigUInt64LE(44n, 4);
    eocd64.writeUInt16LE(45, 12);
    eocd64.writeUInt16LE(45, 14);
    eocd64.writeBigUInt64LE(BigInt(central.length), 24);
    eocd64.writeBigUInt64LE(BigInt(central.length), 32);
    eocd64.writeBigUInt64LE(cdSize, 40);
    eocd64.writeBigUInt64LE(cdStart, 48);
    yield eocd64;

    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(zip64Offset, 8);
    locator.writeUInt32LE(1, 16);
    yield locator;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(Math.min(central.length, 65535), 8);
    eocd.writeUInt16LE(Math.min(central.length, 65535), 10);
    eocd.writeUInt32LE(Number(cdSize > 0xffffffffn ? 0xffffffffn : cdSize), 12);
    eocd.writeUInt32LE(Number(cdStart > 0xffffffffn ? 0xffffffffn : cdStart), 16);
    yield eocd;
  }
  return Readable.from(generate());
}
