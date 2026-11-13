import { describe, expect, it } from "vitest";
import { parseOptionSpreadsheet, prepareOptionImport } from "../src/lib/approval-option-import.js";

const encoder = new TextEncoder();
function exampleFile(name, contents) {
  return {
    name,
    size: new Blob([contents]).size,
    text: async () => contents,
    arrayBuffer: async () => encoder.encode(contents).buffer,
  };
}
function storedXlsx(entries) {
  // Minimal uncompressed ZIP, matching the XLSX container format.
  const local = [], central = [];
  let offset = 0;
  for (const [name, xml] of Object.entries(entries)) {
    const file = encoder.encode(name);
    const value = encoder.encode(xml);
    const header = new Uint8Array(30);
    const d = new DataView(header.buffer);
    d.setUint32(0, 0x04034b50, true); d.setUint16(4, 20, true);
    d.setUint32(18, value.length, true); d.setUint32(22, value.length, true);
    d.setUint16(26, file.length, true);
    local.push(header, file, value);
    const index = new Uint8Array(46);
    const c = new DataView(index.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true); c.setUint16(6, 20, true);
    c.setUint32(20, value.length, true); c.setUint32(24, value.length, true);
    c.setUint16(28, file.length, true); c.setUint32(42, offset, true);
    central.push(index, file);
    offset += header.length + file.length + value.length;
  }
  const totalCentral = central.reduce((n, item) => n + item.length, 0);
  const eocd = new Uint8Array(22);
  const end = new DataView(eocd.buffer);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(entries).length, true);
  end.setUint16(10, Object.keys(entries).length, true);
  end.setUint32(12, totalCentral, true);
  end.setUint32(16, offset, true);
  const bytes = new Uint8Array([...local, ...central, eocd].reduce((n, item) => n + item.length, 0));
  let p = 0;
  for (const chunk of [...local, ...central, eocd]) { bytes.set(chunk, p); p += chunk.length; }
  return bytes;
}

describe("Approval options import", () => {
  it("parses UTF-8 CSV with quotes and delimiter characters", async () => {
    const csv = '\uFEFFStore;Location\n"Kiabi; Mall";Tbilisi\n"East Point";Tbilisi\n';
    expect(await parseOptionSpreadsheet(exampleFile("stores.csv", csv))).toEqual([
      ["Store", "Location"], ["Kiabi; Mall", "Tbilisi"], ["East Point", "Tbilisi"],
    ]);
  });
  it("extracts text cells from an XLSX worksheet and shared strings", async () => {
    const bytes = storedXlsx({
      "xl/sharedStrings.xml": "<sst><si><t>Store Name</t></si><si><t>Kiabi Batumi</t></si><si><t>Kiabi Galleria</t></si></sst>",
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c></row></sheetData></worksheet>',
    });
    const parsed = await parseOptionSpreadsheet({
      name: "stores.xlsx", size: bytes.length, arrayBuffer: async () => bytes.buffer,
    });
    expect(parsed).toEqual([["Store Name"], ["Kiabi Batumi"], ["Kiabi Galleria"]]);
  });
  it("imports the selected column, deduplicates, and can append or replace", () => {
    const rows = [
      ["Store", "Region"], ["A", "Tbilisi"], ["B", "Batumi"], ["A", "Tbilisi"], ["", "Other"],
    ];
    expect(prepareOptionImport(rows, { column: 0, current: ["Z", "A"], mode: "append" }))
      .toEqual({ options: ["Z", "A", "B"], imported: 1, duplicates: 2 });
    expect(prepareOptionImport(rows, { column: 1, mode: "replace" }).options)
      .toEqual(["Tbilisi", "Batumi", "Other"]);
  });
  it("rejects unsupported files, overlong values, and more than 500 options", async () => {
    await expect(parseOptionSpreadsheet(exampleFile("stores.xls", "hello"))).rejects.toThrow(/xlsx or .csv/);
    expect(() => prepareOptionImport([["Option"], ["A".repeat(121)]])).toThrow(/120 characters/);
    expect(() => prepareOptionImport([["Option"], ...Array.from({ length: 501 }, (_, i) => ["Store " + i])]))
      .toThrow(/500 unique options/);
  });
});
