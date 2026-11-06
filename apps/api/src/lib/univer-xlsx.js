import { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import { createFileZipStream } from "./image-zip.js";

// Export native Drive spreadsheets as actual XLSX files inside a bulk ZIP.
// The regular individual download uses SheetJS in the browser; this minimal
// server-side OOXML writer preserves worksheets, values, formulas and merges
// without fetching an external dependency during an authenticated download.
const xml = (value) => String(value ?? "")
  .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, "\ufffd")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function columnName(index) {
  let name = "";
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26))
    name = String.fromCharCode(65 + ((number - 1) % 26)) + name;
  return name;
}

function sheetName(name, used) {
  const base = String(name || "Sheet").replace(/[\\/?*\[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  for (let number = 2; used.has(candidate.toLowerCase()); number++) {
    const suffix = ` ${number}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cellXml(cell, ref, styleIndex) {
  if (!cell || (cell.v == null && !cell.f)) return "";
  const style = styleIndex ? ` s="${styleIndex}"` : "";
  const formula = cell.f ? `<f>${xml(String(cell.f).replace(/^=/, ""))}</f>` : "";
  // Formula calculation is deferred to Excel, avoiding stale calculated values.
  if (formula) return `<c r="${ref}"${style}>${formula}</c>`;
  if (typeof cell.v === "number" && Number.isFinite(cell.v))
    return `<c r="${ref}"${style}><v>${cell.v}</v></c>`;
  if (typeof cell.v === "boolean")
    return `<c r="${ref}"${style} t="b"><v>${cell.v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(cell.v)}</t></is></c>`;
}

function worksheetXml(sheet, snapshot, registerFormat) {
  const rows = Object.entries(sheet?.cellData || {})
    .map(([key, cols]) => [Number(key), cols])
    .filter(([index]) => Number.isInteger(index) && index >= 0)
    .sort(([a], [b]) => a - b)
    .map(([rowIndex, cols]) => {
      const cells = Object.entries(cols || {})
        .map(([key, cell]) => [Number(key), cell])
        .filter(([index]) => Number.isInteger(index) && index >= 0)
        .sort(([a], [b]) => a - b)
        .map(([columnIndex, cell]) => {
          const style = typeof cell?.s === "string" ? snapshot?.styles?.[cell.s] : cell?.s;
          const pattern = style?.n?.pattern;
          const styleIndex = typeof pattern === "string" && pattern ? registerFormat(pattern) : 0;
          return cellXml(cell, `${columnName(columnIndex)}${rowIndex + 1}`, styleIndex);
        })
        .join("");
      return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : "";
    })
    .join("");

  const merges = (sheet?.mergeData || [])
    .filter(({ startRow, startColumn, endRow, endColumn }) =>
      [startRow, startColumn, endRow, endColumn].every((v) => Number.isInteger(v) && v >= 0))
    .map((range) => `<mergeCell ref="${columnName(range.startColumn)}${range.startRow + 1}:${columnName(range.endColumn)}${range.endRow + 1}"/>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows}</sheetData>${merges ? `<mergeCells count="${(merges.match(/<mergeCell /g) || []).length}">${merges}</mergeCells>` : ""}</worksheet>`;
}

function stylesXml(formats) {
  const custom = [...formats.keys()];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="${custom.length}">` +
    custom.map((pattern, index) => `<numFmt numFmtId="${164 + index}" formatCode="${xml(pattern)}"/>`).join("") +
    `</numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${custom.length + 1}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    custom.map((_, index) => `<xf numFmtId="${164 + index}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("") +
    `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

export async function univerSnapshotToXlsxBuffer(snapshot) {
  const sources = (snapshot?.sheetOrder || []).map((id) => snapshot?.sheets?.[id]).filter(Boolean);
  if (!sources.length) sources.push({ name: "Sheet1", cellData: {} });
  const used = new Set();
  const names = sources.map((sheet) => sheetName(sheet.name, used));
  const formats = new Map();
  const registerFormat = (pattern) => {
    if (!formats.has(pattern)) formats.set(pattern, formats.size + 1);
    return formats.get(pattern);
  };
  const worksheets = sources.map((sheet) => worksheetXml(sheet, snapshot, registerFormat));
  const prefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const files = [
    { name: "[Content_Types].xml", body: prefix +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sources.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      `</Types>` },
    { name: "_rels/.rels", body: prefix +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>` },
    { name: "xl/workbook.xml", body: prefix +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<bookViews><workbookView/></bookViews><sheets>` +
      names.map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets><calcPr fullCalcOnLoad="1"/></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", body: prefix +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sources.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sources.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>` },
    { name: "xl/styles.xml", body: stylesXml(formats) },
    ...worksheets.map((body, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, body })),
  ];
  return buffer(createFileZipStream(files.map(({ name, body }) => ({
    originalName: name,
    sizeBytes: Buffer.byteLength(body),
    open: () => Readable.from([Buffer.from(body)]),
  })), { allowPaths: true }));
}
