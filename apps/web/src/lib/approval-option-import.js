// Small browser-native CSV/XLSX importer. No dependency or server upload is needed.
// Excel files are ZIP containers with XML worksheets; only text-like cell values
// are extracted. This importer does not evaluate formulas, links, or macros.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_XML_BYTES = 12 * 1024 * 1024;
const MAX_ROWS = 10000;
const decoder = new TextDecoder("utf-8");

function csvRows(source) {
  const text = source.replace(/^\uFEFF/, "");
  const sample = text.split(/\r?\n/).slice(0, 3).join("\n");
  const counts = [",", ";", "\t"].map((separator) => ({
    separator, count: sample.split(separator).length - 1,
  }));
  counts.sort((a, b) => b.count - a.count);
  const delimiter = counts[0].count ? counts[0].separator : ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      if (rows.length > MAX_ROWS) throw new Error("Too many rows (maximum 10,000).");
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error("The CSV contains an unterminated quoted value.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function xmlDocument(bytes, label) {
  const doc = new DOMParser().parseFromString(decoder.decode(bytes), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML in " + label);
  return doc;
}

function zipEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 65557); pos--) {
    if (view.getUint32(pos, true) === 0x06054b50) { eocd = pos; break; }
  }
  if (eocd < 0) throw new Error("Invalid Excel file (ZIP directory not found).");
  const entries = new Map();
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error("Invalid Excel file (ZIP entry).");
    const method = view.getUint16(cursor + 10, true);
    const flags = view.getUint16(cursor + 8, true);
    const size = view.getUint32(cursor + 20, true);
    const unpacked = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const offset = view.getUint32(cursor + 42, true);
    const end = cursor + 46 + nameLen + extraLen + commentLen;
    if (end > bytes.length) throw new Error("Invalid ZIP entry length.");
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
    if (!entries.has(name)) entries.set(name, { method, flags, size, unpacked, offset });
    cursor = end;
  }
  async function read(name) {
    const entry = entries.get(name);
    if (!entry) return null;
    if (entry.unpacked > MAX_XML_BYTES || entry.size > MAX_FILE_BYTES || entry.flags & 1)
      throw new Error("Excel entry exceeds the safe size limit or is encrypted.");
    if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50)
      throw new Error("Invalid Excel file (ZIP local header).");
    const nameLen = view.getUint16(entry.offset + 26, true);
    const extraLen = view.getUint16(entry.offset + 28, true);
    const start = entry.offset + 30 + nameLen + extraLen;
    if (start + entry.size > bytes.length) throw new Error("Invalid Excel file (ZIP content).");
    const compressed = bytes.slice(start, start + entry.size);
    if (entry.method === 0) return compressed;
    if (entry.method !== 8 || typeof DecompressionStream === "undefined")
      throw new Error("This browser cannot unpack this Excel file. Try a CSV export.");
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const result = new Uint8Array(await new Response(stream).arrayBuffer());
    if (result.length > MAX_XML_BYTES) throw new Error("Excel sheet is too large.");
    return result;
  }
  return { entries, read };
}

function columnIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref || "")?.[0]?.toUpperCase() || "";
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index ? index - 1 : -1;
}
function xmlText(element, tagName) {
  return [...element.getElementsByTagName(tagName)].map((part) => part.textContent).join("");
}
async function xlsxRows(arrayBuffer) {
  const zip = zipEntries(new Uint8Array(arrayBuffer));
  const stringsBytes = await zip.read("xl/sharedStrings.xml");
  let strings = [];
  if (stringsBytes) {
    const shared = xmlDocument(stringsBytes, "shared strings");
    strings = [...shared.getElementsByTagName("si")].map((item) => xmlText(item, "t"));
  }
  let sheetPath = [...zip.entries.keys()]
    .filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name))
    .sort()[0];
  const workbookBytes = await zip.read("xl/workbook.xml");
  const relBytes = await zip.read("xl/_rels/workbook.xml.rels");
  if (workbookBytes && relBytes) {
    const workbook = xmlDocument(workbookBytes, "workbook");
    const rels = xmlDocument(relBytes, "workbook relationships");
    const sheet = workbook.getElementsByTagName("sheet")[0];
    const rid = sheet?.getAttribute("r:id");
    const rel = [...rels.getElementsByTagName("Relationship")]
      .find((item) => item.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) {
      const resolved = target.startsWith("/") ? target.slice(1) :
        "xl/" + target.replace(/^\.\//, "");
      // Spreadsheet relationships cannot read outside the actual archive.
      if (zip.entries.has(resolved)) sheetPath = resolved;
    }
  }
  if (!sheetPath) throw new Error("No worksheet found in this Excel file.");
  const sheetBytes = await zip.read(sheetPath);
  const doc = xmlDocument(sheetBytes, "worksheet");
  const rows = [];
  for (const rowElement of doc.getElementsByTagName("row")) {
    const row = [];
    let nextColumn = 0;
    for (const cell of rowElement.getElementsByTagName("c")) {
      const found = columnIndex(cell.getAttribute("r"));
      const column = found >= 0 ? found : nextColumn;
      if (column >= 100) throw new Error("Only the first 100 columns can be imported.");
      nextColumn = column + 1;
      const type = cell.getAttribute("t");
      const raw = cell.getElementsByTagName("v")[0]?.textContent ?? "";
      let value = "";
      if (type === "s") value = strings[Number(raw)] ?? "";
      else if (type === "inlineStr") value = xmlText(cell, "t");
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else value = raw;
      row[column] = value;
    }
    if (row.some((value) => String(value ?? "").trim())) rows.push(row);
    if (rows.length > MAX_ROWS) throw new Error("Too many rows (maximum 10,000).");
  }
  return rows;
}

export async function parseOptionSpreadsheet(file) {
  if (!file || file.size > MAX_FILE_BYTES)
    throw new Error("Choose a CSV or XLSX file no larger than 5 MB.");
  const name = file.name?.toLowerCase() || "";
  let rows;
  if (name.endsWith(".csv")) {
    rows = csvRows(await file.text());
  } else if (name.endsWith(".xlsx")) {
    rows = await xlsxRows(await file.arrayBuffer());
  } else {
    throw new Error("Please use an .xlsx or .csv file.");
  }
  if (!rows.length) throw new Error("This spreadsheet has no non-empty rows.");
  return rows;
}

export function prepareOptionImport(rows, { column = 0, hasHeader = true, mode = "append", current = [] } = {}) {
  const items = rows.slice(hasHeader ? 1 : 0).map((row) => String(row[column] ?? "").trim()).filter(Boolean);
  if (!items.length) throw new Error("No values found in the selected column.");
  if (items.some((value) => value.length > 120)) throw new Error("An option exceeds 120 characters.");
  const next = mode === "replace" ? [] : [...current];
  const seen = new Set(next);
  for (const item of items) if (!seen.has(item)) { next.push(item); seen.add(item); }
  if (next.length > 500) throw new Error("A field can contain at most 500 unique options.");
  return { options: next, imported: next.length - (mode === "replace" ? 0 : current.length), duplicates: items.length - (next.length - (mode === "replace" ? 0 : current.length)) };
}
